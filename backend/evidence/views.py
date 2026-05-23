import hashlib
import json

from django.core.files.base import ContentFile
from django.utils import timezone
from rest_framework import decorators, response, viewsets

from accounts.permissions import OrganizationRolePermission, OrganizationScopedQuerySetMixin

from .models import EvidenceBundle
from .pdf import build_signed_pdf, can_stamp_source_pdf
from .serializers import EvidenceBundleSerializer


class EvidenceBundleViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'audit_evidence'
    queryset = EvidenceBundle.objects.select_related('envelope', 'generated_by').all().order_by('-created_at')
    serializer_class = EvidenceBundleSerializer
    permission_classes = [OrganizationRolePermission]
    write_roles = OrganizationRolePermission.write_roles

    @decorators.action(detail=True, methods=['post'])
    def generate(self, request, pk=None):
        bundle = self.get_object()
        payload = {
            'envelope': bundle.envelope_id,
            'name': bundle.envelope.name,
            'status': bundle.envelope.status,
            'sender': {
                'id': bundle.envelope.sender_id,
                'username': bundle.envelope.sender.username,
                'email': bundle.envelope.sender.email,
            },
            'recipients': list(bundle.envelope.recipients.values('id', 'name', 'email', 'role', 'status', 'signed_at')),
            'signatures': list(bundle.envelope.signatures.values('id', 'recipient_id', 'signature_type', 'typed_name', 'created_at')),
            'field_values': list(bundle.envelope.field_values.values('id', 'recipient_id', 'field_id', 'field_key', 'value', 'metadata', 'created_at', 'updated_at')),
            'field_attachments': [
                {
                    'id': value.id,
                    'recipient_id': value.recipient_id,
                    'field_key': value.field_key,
                    'filename': value.metadata.get('filename') or value.value,
                    'file': value.attachment.name,
                    'size': value.metadata.get('size'),
                    'content_type': value.metadata.get('content_type'),
                    'created_at': value.created_at,
                }
                for value in bundle.envelope.field_values.exclude(attachment='')
            ],
            'consents': list(bundle.envelope.consent_records.values('id', 'recipient_id', 'signing_session_id', 'consent_text', 'accepted_at', 'ip_address', 'user_agent')),
            'documents': [
                {
                    'id': link.document_id,
                    'title': link.document.title,
                    'sha256': link.document.sha256,
                    'page_count': link.document.page_count,
                    'status': link.document.status,
                    'order': link.order,
                    'pages': list(link.document.pages.values('page_number', 'width', 'height')),
                }
                for link in bundle.envelope.envelope_documents.select_related('document').prefetch_related('document__pages')
            ],
            'fields': list(bundle.envelope.fields.values('id', 'recipient_id', 'field_key', 'field_type', 'label', 'required', 'page', 'x', 'y', 'width', 'height')),
            'email_messages': list(bundle.envelope.email_messages.values('id', 'recipient_id', 'kind', 'to_email', 'subject', 'status', 'error_message', 'queued_at', 'sent_at')),
            'approval_requests': list(bundle.envelope.approval_requests.values('id', 'approver_id', 'approval_role', 'status', 'notes', 'due_at', 'decided_at', 'created_at')),
            'audit_events': list(bundle.envelope.audit_events.values('id', 'event_type', 'message', 'created_at')),
            'generated_at': timezone.now().isoformat(),
        }
        manifest = json.dumps(payload, sort_keys=True, default=str, indent=2)
        bundle.status = EvidenceBundle.Status.READY
        bundle.sha256 = hashlib.sha256(manifest.encode()).hexdigest()
        bundle.file.save(f'evidence-envelope-{bundle.envelope_id}.json', ContentFile(manifest.encode()), save=False)
        bundle.generated_by = request.user
        bundle.generated_at = timezone.now()
        bundle.error_message = ''
        bundle.save(update_fields=['status', 'file', 'sha256', 'generated_by', 'generated_at', 'error_message'])
        return response.Response(self.get_serializer(bundle).data)

    @decorators.action(detail=True, methods=['post'], url_path='generate-signed-pdf')
    def generate_signed_pdf(self, request, pk=None):
        bundle = self.get_object()
        pdf_bytes, pdf_sha256 = build_signed_pdf(bundle.envelope)
        bundle.signed_pdf.save(f'signed-envelope-{bundle.envelope_id}.pdf', ContentFile(pdf_bytes), save=False)
        bundle.signed_pdf_sha256 = pdf_sha256
        bundle.status = EvidenceBundle.Status.READY
        bundle.generated_by = request.user
        bundle.generated_at = timezone.now()
        bundle.error_message = ''
        bundle.save(update_fields=['signed_pdf', 'signed_pdf_sha256', 'status', 'generated_by', 'generated_at', 'error_message'])
        return response.Response(self.get_serializer(bundle).data)

    @decorators.action(detail=True, methods=['post'])
    def verify(self, request, pk=None):
        bundle = self.get_object()
        manifest = self._verify_file(bundle.file, bundle.sha256)
        signed_pdf = self._verify_file(bundle.signed_pdf, bundle.signed_pdf_sha256)
        return response.Response({
            'id': bundle.id,
            'status': bundle.status,
            'manifest': manifest,
            'signed_pdf': signed_pdf,
            'valid': manifest['valid'] and signed_pdf['valid'],
        })

    @decorators.action(detail=True, methods=['get'], url_path='visual-qa')
    def visual_qa(self, request, pk=None):
        bundle = self.get_object()
        envelope = bundle.envelope
        documents = []
        warnings = []
        for link in envelope.envelope_documents.select_related('document').prefetch_related('document__pages'):
            document = link.document
            pages = list(document.pages.all())
            missing_images = [
                page.page_number for page in pages
                if not page.image
            ]
            if missing_images:
                warnings.append(f'{document.title} is missing page preview images for pages {missing_images}.')
            field_count = envelope.fields.filter(document_page__document=document).count()
            documents.append({
                'document': document.id,
                'title': document.title,
                'page_count': document.page_count or len(pages),
                'stored_pages': len(pages),
                'missing_page_images': missing_images,
                'field_count': field_count,
                'sha256': document.sha256,
            })
        if not documents:
            warnings.append('No source documents are attached to this envelope.')
        if not bundle.signed_pdf:
            warnings.append('No signed PDF artifact has been generated yet.')
        return response.Response({
            'bundle': bundle.id,
            'envelope': envelope.id,
            'status': 'needs_review' if warnings else 'ready',
            'signed_pdf_present': bool(bundle.signed_pdf),
            'signed_pdf_sha256': bundle.signed_pdf_sha256,
            'source_pdf_stamping_available': can_stamp_source_pdf(),
            'manifest_present': bool(bundle.file),
            'manifest_sha256': bundle.sha256,
            'documents': documents,
            'warnings': warnings,
        })

    def _verify_file(self, file_field, expected_sha256):
        if not expected_sha256:
            return {'present': False, 'valid': False, 'expected_sha256': '', 'actual_sha256': '', 'detail': 'No expected hash recorded.'}
        if not file_field:
            return {'present': False, 'valid': False, 'expected_sha256': expected_sha256, 'actual_sha256': '', 'detail': 'No file stored.'}
        digest = hashlib.sha256()
        try:
            file_field.open('rb')
            for chunk in iter(lambda: file_field.read(1024 * 1024), b''):
                digest.update(chunk)
        finally:
            file_field.close()
        actual_sha256 = digest.hexdigest()
        return {
            'present': True,
            'valid': actual_sha256 == expected_sha256,
            'expected_sha256': expected_sha256,
            'actual_sha256': actual_sha256,
            'detail': 'Hash matches.' if actual_sha256 == expected_sha256 else 'Hash mismatch.',
        }
