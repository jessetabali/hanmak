import json

from django.utils import timezone
from django.db.models import Q
from drf_spectacular.utils import extend_schema
from rest_framework import decorators, parsers, permissions, response, status, views, viewsets

from accounts.permissions import OrganizationScopedQuerySetMixin, feature_flag_allows
from accounts.throttles import PublicSigningRateThrottle
from approvals.models import ApprovalRequest
from envelopes.models import Envelope, Recipient
from messaging.services import queue_completion_emails, queue_envelope_invites
from messaging.tasks import deliver_email_message_task

from .models import ConsentRecord, EnvelopeFieldValue, Signature, SigningSession
from .serializers import (
    ConsentRecordSerializer,
    EnvelopeFieldValueSerializer,
    PublicSigningSessionSerializer,
    SignatureSerializer,
    SigningSessionSerializer,
)


class SigningSessionViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'signing_sessions_admin'
    queryset = SigningSession.objects.select_related('envelope', 'recipient').all().order_by('-created_at')
    serializer_class = SigningSessionSerializer
    permission_classes = [permissions.IsAuthenticated]

    @decorators.action(detail=True, methods=['post'])
    def open(self, request, pk=None):
        session = self.get_object()
        session.status = SigningSession.Status.OPENED
        session.opened_at = timezone.now()
        session.save(update_fields=['status', 'opened_at'])
        return response.Response(self.get_serializer(session).data)

    @decorators.action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        session = self.get_object()
        session.status = SigningSession.Status.SUBMITTED
        session.submitted_at = timezone.now()
        session.save(update_fields=['status', 'submitted_at'])
        return response.Response(self.get_serializer(session).data)


class ConsentRecordViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'public_signing'
    queryset = ConsentRecord.objects.select_related('envelope', 'recipient', 'signing_session').all()
    serializer_class = ConsentRecordSerializer
    permission_classes = [permissions.IsAuthenticated]


class SignatureViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'public_signing'
    queryset = Signature.objects.select_related('envelope', 'recipient', 'signing_session').all().order_by('-created_at')
    serializer_class = SignatureSerializer
    permission_classes = [permissions.IsAuthenticated]


class EnvelopeFieldValueViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'public_signing'
    queryset = EnvelopeFieldValue.objects.select_related('envelope', 'recipient', 'field').all()
    serializer_class = EnvelopeFieldValueSerializer
    permission_classes = [permissions.IsAuthenticated]


class PublicSigningSessionView(views.APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [PublicSigningRateThrottle]
    parser_classes = [parsers.JSONParser, parsers.MultiPartParser, parsers.FormParser]
    serializer_class = PublicSigningSessionSerializer

    def get_session(self, token):
        return (
            SigningSession.objects.select_related('envelope', 'recipient', 'envelope__sender', 'envelope__template')
            .prefetch_related('envelope__fields', 'envelope__recipients', 'envelope__envelope_documents__document')
            .get(token=token)
        )

    def _feature_gate_response(self, session):
        if feature_flag_allows(session.envelope.sender, session.envelope.organization_id, 'public_signing'):
            return None
        return response.Response({'detail': 'Public signing is not released for this organization.'}, status=status.HTTP_403_FORBIDDEN)

    @extend_schema(responses=PublicSigningSessionSerializer)
    def get(self, request, token):
        try:
            session = self.get_session(token)
        except SigningSession.DoesNotExist:
            return response.Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        gated = self._feature_gate_response(session)
        if gated:
            return gated
        if session.expires_at and session.expires_at < timezone.now():
            session.status = SigningSession.Status.EXPIRED
            session.save(update_fields=['status'])
        if session.status in [SigningSession.Status.EXPIRED, SigningSession.Status.REVOKED, SigningSession.Status.DECLINED]:
            return response.Response({'detail': 'This signing link is no longer active.'}, status=status.HTTP_410_GONE)
        if session.status == SigningSession.Status.CREATED:
            session.status = SigningSession.Status.OPENED
            session.opened_at = timezone.now()
            session.ip_address = request.META.get('REMOTE_ADDR')
            session.user_agent = request.META.get('HTTP_USER_AGENT', '')
            session.save(update_fields=['status', 'opened_at', 'ip_address', 'user_agent'])
        return response.Response(PublicSigningSessionSerializer(session, context={'request': request}).data)

    @extend_schema(request=dict, responses=PublicSigningSessionSerializer)
    def post(self, request, token):
        try:
            session = self.get_session(token)
        except SigningSession.DoesNotExist:
            return response.Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        gated = self._feature_gate_response(session)
        if gated:
            return gated
        if session.status in [SigningSession.Status.EXPIRED, SigningSession.Status.REVOKED, SigningSession.Status.DECLINED]:
            return response.Response({'detail': 'This signing link is no longer active.'}, status=status.HTTP_410_GONE)
        if session.status == SigningSession.Status.SUBMITTED or session.recipient.status == Recipient.Status.SIGNED:
            return response.Response(PublicSigningSessionSerializer(session, context={'request': request}).data)
        payload = self._payload_data(request)
        if payload.get('action') == 'decline':
            return self._decline(session, request, payload)
        if payload.get('action') == 'delegate':
            return self._delegate(session, request, payload)
        ConsentRecord.objects.get_or_create(
            envelope=session.envelope,
            recipient=session.recipient,
            signing_session=session,
            defaults={
                'consent_text': payload.get('consent_text', 'Accepted electronic signature consent.'),
                'ip_address': request.META.get('REMOTE_ADDR'),
                'user_agent': request.META.get('HTTP_USER_AGENT', ''),
            },
        )
        signature_data = payload.get('signature', {})
        if signature_data:
            Signature.objects.create(
                envelope=session.envelope,
                recipient=session.recipient,
                signing_session=session,
                signature_type=signature_data.get('signature_type', Signature.SignatureType.TYPED),
                typed_name=signature_data.get('typed_name', session.recipient.name),
                metadata=signature_data.get('metadata', {}),
            )
        allowed_fields = session.envelope.fields.filter(Q(recipient__isnull=True) | Q(recipient=session.recipient))
        submitted_values = {
            item.get('field_key', ''): item.get('value', '')
            for item in payload.get('field_values', [])
        }
        missing_required = []
        for required_field in allowed_fields.filter(required=True):
            value = submitted_values.get(required_field.field_key, '')
            if required_field.field_type == required_field.FieldType.CHECKBOX:
                is_complete = str(value).lower() == 'true'
            elif required_field.field_type == required_field.FieldType.ATTACHMENT:
                is_complete = bool(self._attachment_for_field(request, required_field.field_key))
            else:
                is_complete = bool(str(value).strip())
            if not is_complete:
                missing_required.append(required_field.label or required_field.field_key)
        if missing_required:
            return response.Response(
                {'detail': f'Required field(s) missing: {", ".join(missing_required[:5])}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        for field_value in payload.get('field_values', []):
            field_key = field_value.get('field_key', '')
            field = allowed_fields.filter(field_key=field_key).first()
            if not field:
                if session.envelope.fields.exists():
                    return response.Response(
                        {'detail': f'Field "{field_key}" is not assigned to this recipient.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            defaults = {
                'field': field,
                'value': field_value.get('value', ''),
                'metadata': field_value.get('metadata', {}),
            }
            attachment = self._attachment_for_field(request, field_key)
            if attachment:
                defaults['attachment'] = attachment
                defaults['value'] = attachment.name
                defaults['metadata'] = {
                    **defaults['metadata'],
                    'filename': attachment.name,
                    'content_type': getattr(attachment, 'content_type', ''),
                    'size': attachment.size,
                }
            EnvelopeFieldValue.objects.update_or_create(
                envelope=session.envelope,
                recipient=session.recipient,
                field_key=field_key,
                defaults=defaults,
            )
        session.status = SigningSession.Status.SUBMITTED
        session.submitted_at = timezone.now()
        session.save(update_fields=['status', 'submitted_at'])
        session.recipient.status = session.recipient.Status.SIGNED
        session.recipient.signed_at = timezone.now()
        session.recipient.save(update_fields=['status', 'signed_at'])
        envelope = session.envelope
        active_recipients = envelope.recipients.exclude(role=Recipient.Role.CC).exclude(status=Recipient.Status.DELEGATED)
        if not active_recipients.exclude(status=Recipient.Status.SIGNED).exists():
            envelope.status = Envelope.Status.COMPLETED
            envelope.completed_at = timezone.now()
            envelope.save(update_fields=['status', 'completed_at', 'updated_at'])
            messages = queue_completion_emails(envelope, queued_by=envelope.sender, request=request)
            for message in messages:
                deliver_email_message_task.apply_async(args=[message.id], queue='email')
        elif envelope.status in [Envelope.Status.SENT, Envelope.Status.PARTIALLY_SIGNED]:
            envelope.status = Envelope.Status.PARTIALLY_SIGNED
            envelope.save(update_fields=['status', 'updated_at'])
            current_order_open = active_recipients.filter(routing_order=session.recipient.routing_order).exclude(
                status__in=[Recipient.Status.SIGNED, Recipient.Status.DECLINED]
            )
            if not current_order_open.exists():
                next_messages = queue_envelope_invites(envelope, queued_by=envelope.sender, request=request)
                for message in next_messages:
                    deliver_email_message_task.apply_async(args=[message.id], queue='email')
            if session.recipient.role == Recipient.Role.SIGNER:
                for approver in envelope.recipients.filter(role=Recipient.Role.APPROVER).exclude(status__in=[Recipient.Status.SIGNED, Recipient.Status.DELEGATED]):
                    ApprovalRequest.objects.get_or_create(
                        envelope=envelope,
                        approver=envelope.sender,
                        approval_role=f'{approver.name} approval',
                        defaults={'notes': f'Awaiting approval from {approver.name} <{approver.email}>.'},
                    )
        session = self.get_session(token)
        return response.Response(PublicSigningSessionSerializer(session, context={'request': request}).data)

    def _decline(self, session, request, payload):
        reason = (payload.get('reason') or '').strip()
        session.status = SigningSession.Status.DECLINED
        session.submitted_at = timezone.now()
        session.ip_address = request.META.get('REMOTE_ADDR')
        session.user_agent = request.META.get('HTTP_USER_AGENT', '')
        session.save(update_fields=['status', 'submitted_at', 'ip_address', 'user_agent'])

        session.recipient.status = Recipient.Status.DECLINED
        session.recipient.save(update_fields=['status'])

        envelope = session.envelope
        envelope.status = Envelope.Status.DECLINED
        envelope.void_reason = reason or f'Declined by {session.recipient.name or session.recipient.email}.'
        envelope.save(update_fields=['status', 'void_reason', 'updated_at'])
        envelope.signing_sessions.exclude(id=session.id).exclude(status=SigningSession.Status.SUBMITTED).update(status=SigningSession.Status.REVOKED)

        ConsentRecord.objects.get_or_create(
            envelope=envelope,
            recipient=session.recipient,
            signing_session=session,
            defaults={
                'consent_text': f'Declined signing task. Reason: {reason}' if reason else 'Declined signing task.',
                'ip_address': request.META.get('REMOTE_ADDR'),
                'user_agent': request.META.get('HTTP_USER_AGENT', ''),
            },
        )
        return response.Response(PublicSigningSessionSerializer(self.get_session(session.token), context={'request': request}).data)

    def _delegate(self, session, request, payload):
        name = (payload.get('name') or '').strip()
        email = (payload.get('email') or '').strip().lower()
        reason = (payload.get('reason') or '').strip()
        if not name or not email:
            return response.Response({'detail': 'Delegate name and email are required.'}, status=status.HTTP_400_BAD_REQUEST)
        if session.recipient.status in [Recipient.Status.SIGNED, Recipient.Status.DECLINED, Recipient.Status.DELEGATED]:
            return response.Response({'detail': 'This recipient can no longer delegate the signing task.'}, status=status.HTTP_400_BAD_REQUEST)

        delegate = Recipient.objects.create(
            envelope=session.envelope,
            delegated_from=session.recipient,
            name=name,
            email=email,
            role=session.recipient.role,
            status=Recipient.Status.SENT,
            routing_order=session.recipient.routing_order,
            delegation_reason=reason,
            delegated_at=timezone.now(),
        )
        session.recipient.fields.update(recipient=delegate)
        session.recipient.status = Recipient.Status.DELEGATED
        session.recipient.delegated_at = timezone.now()
        session.recipient.delegation_reason = reason
        session.recipient.save(update_fields=['status', 'delegated_at', 'delegation_reason'])
        session.status = SigningSession.Status.REVOKED
        session.save(update_fields=['status'])

        new_session, _ = SigningSession.objects.get_or_create(envelope=session.envelope, recipient=delegate)
        messages = queue_envelope_invites(session.envelope, queued_by=session.envelope.sender, request=request)
        for message in messages:
            deliver_email_message_task.apply_async(args=[message.id], queue='email')
        data = PublicSigningSessionSerializer(new_session, context={'request': request}).data
        data['delegated_from_recipient'] = session.recipient_id
        return response.Response(data, status=status.HTTP_201_CREATED)

    def _payload_data(self, request):
        if 'payload' not in request.data:
            return request.data
        payload = request.data.get('payload') or '{}'
        if isinstance(payload, (dict, list)):
            return payload
        try:
            return json.loads(payload)
        except (TypeError, ValueError):
            return {}

    def _attachment_for_field(self, request, field_key):
        return request.FILES.get(f'attachment__{field_key}') or request.FILES.get(field_key)


class PublicSigningDownloadView(views.APIView):
    """Public signed-PDF download — authenticated only by the signing token."""
    permission_classes = [permissions.AllowAny]
    throttle_classes = [PublicSigningRateThrottle]

    def get(self, request, token):
        try:
            session = (
                SigningSession.objects
                .select_related('envelope', 'recipient')
                .get(token=token)
            )
        except SigningSession.DoesNotExist:
            return response.Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        envelope = session.envelope
        if envelope.status not in [envelope.Status.COMPLETED, envelope.Status.PARTIALLY_SIGNED]:
            return response.Response(
                {'detail': 'Signed PDF is only available for completed envelopes.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        from django.http import HttpResponse
        from evidence.pdf import build_signed_pdf
        try:
            pdf_bytes, _ = build_signed_pdf(envelope)
        except Exception as exc:
            return response.Response({'detail': f'PDF generation failed: {exc}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        resp = HttpResponse(pdf_bytes, content_type='application/pdf')
        resp['Content-Disposition'] = f'attachment; filename="signed-{envelope.id}.pdf"'
        return resp
