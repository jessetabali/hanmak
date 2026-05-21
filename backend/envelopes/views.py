from django.http import HttpResponse
from django.db.models import Count, Prefetch, Q
from django.utils import timezone
from rest_framework import serializers
from rest_framework import decorators, permissions, response, status, viewsets

from accounts.permissions import OrganizationRolePermission, OrganizationScopedQuerySetMixin, user_has_custom_permission, user_has_org_role
from accounts.models import Organization
from compliance.services import assert_not_under_active_legal_hold, validate_data_residency_for_organization
from configcenter.models import GeneralSettings
from messaging.models import EmailMessage
from messaging.services import absolute_signing_url, queue_envelope_invites, queue_reminders, render_email
from messaging.tasks import deliver_email_message_task
from signing.models import SigningSession

from documents.models import Document

from .models import Envelope, FormField, Recipient, Template, TemplateParty, TemplateVersion
from .serializers import (
    CreateEnvelopeFromTemplateSerializer,
    EnvelopeSerializer,
    EnvelopeStatusSerializer,
    FormFieldSerializer,
    RecipientDelegationSerializer,
    RecipientSerializer,
    TemplateSetupSerializer,
    TemplatePartySerializer,
    TemplateSerializer,
    TemplateVersionSerializer,
)
from .services import create_envelope_from_template, setup_template_version


class TemplateViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'template_library'
    write_roles = OrganizationRolePermission.write_roles
    queryset = Template.objects.select_related('organization', 'created_by').prefetch_related(
        Prefetch(
            'versions',
            queryset=TemplateVersion.objects.select_related('document').prefetch_related('parties', 'fields').order_by('-version_number'),
        ),
        'fields',
    ).all().order_by('-updated_at')
    serializer_class = TemplateSerializer
    permission_classes = [OrganizationRolePermission]

    def perform_create(self, serializer):
        self._assert_related_organization_access(serializer)
        serializer.save(created_by=self.request.user)

    @decorators.action(detail=True, methods=['post'])
    def archive(self, request, pk=None):
        template = self.get_object()
        template.status = Template.Status.ARCHIVED
        template.save(update_fields=['status', 'updated_at'])
        return response.Response(self.get_serializer(template).data)

    @decorators.action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        template = self.get_object()
        template.status = Template.Status.ACTIVE
        template.save(update_fields=['status', 'updated_at'])
        return response.Response(self.get_serializer(template).data)

    @decorators.action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        source = self.get_object()
        duplicate = Template.objects.create(
            organization=source.organization,
            name=request.data.get('name') or f'{source.name} Copy',
            description=source.description,
            category=source.category,
            version=1,
            status=Template.Status.DRAFT,
            created_by=request.user,
        )
        latest = source.versions.select_related('document').prefetch_related('fields', 'parties').order_by('-version_number').first()
        if latest:
            fields = [
                {
                    'field_key': field.field_key,
                    'field_type': field.field_type,
                    'label': field.label,
                    'required': field.required,
                    'party_key': field.party.role_key if field.party else 'party-1',
                    'page': field.page,
                    'x': field.x,
                    'y': field.y,
                    'width': field.width,
                    'height': field.height,
                    'options': field.options,
                }
                for field in latest.fields.select_related('party').all()
            ]
            setup_template_version(
                duplicate,
                latest.document,
                fields=fields or latest.field_schema.get('fields', []),
                created_by=request.user,
                changelog=f'Duplicated from template #{source.id}',
                party_labels={p.role_key: p.label for p in latest.parties.all()},
            )
            duplicate.status = Template.Status.DRAFT
            duplicate.save(update_fields=['status', 'updated_at'])
        return response.Response(self.get_serializer(duplicate).data, status=status.HTTP_201_CREATED)

    @decorators.action(detail=True, methods=['post'])
    def setup(self, request, pk=None):
        template = self.get_object()
        serializer = TemplateSetupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        document = Document.objects.filter(
            id=serializer.validated_data['document'],
            organization=template.organization,
        ).first()
        if not document:
            raise serializers.ValidationError('Document was not found for this template organization.')
        party_labels = {
            p.get('key', p.get('id', '')): p.get('label', '')
            for p in (serializer.validated_data.get('parties') or [])
            if p.get('key') or p.get('id')
        }
        version = setup_template_version(
            template,
            document,
            fields=serializer.validated_data.get('fields'),
            created_by=request.user,
            changelog=serializer.validated_data.get('changelog') or 'Backend template setup',
            party_labels=party_labels,
        )
        return response.Response(TemplateVersionSerializer(version, context=self.get_serializer_context()).data, status=status.HTTP_201_CREATED)


class TemplateVersionViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'template_library'
    write_roles = OrganizationRolePermission.write_roles
    queryset = TemplateVersion.objects.select_related('template', 'document', 'created_by').prefetch_related('parties').all()
    serializer_class = TemplateVersionSerializer
    permission_classes = [OrganizationRolePermission]
    filterset_fields = ['template']


class TemplatePartyViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'template_library'
    write_roles = OrganizationRolePermission.write_roles
    queryset = TemplateParty.objects.select_related('template_version').all()
    serializer_class = TemplatePartySerializer
    permission_classes = [OrganizationRolePermission]


class EnvelopeViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'envelope_management'
    write_roles = OrganizationRolePermission.write_roles
    queryset = (
        Envelope.objects.select_related('organization', 'template', 'sender')
        .prefetch_related('recipients', 'fields')
        .all()
        .order_by('-created_at')
    )
    serializer_class = EnvelopeSerializer
    permission_classes = [OrganizationRolePermission]

    @decorators.action(detail=False, methods=['get'])
    def summary(self, request):
        queryset = self.filter_queryset(self.get_queryset())
        status_counts = dict(queryset.values_list('status').annotate(total=Count('id')))
        overdue = queryset.exclude(status__in=[Envelope.Status.COMPLETED, Envelope.Status.VOIDED, Envelope.Status.DECLINED]).filter(due_date__lt=timezone.now().date()).count()
        return response.Response({
            'total': queryset.count(),
            'draft': status_counts.get(Envelope.Status.DRAFT, 0),
            'sent': status_counts.get(Envelope.Status.SENT, 0),
            'viewed': status_counts.get(Envelope.Status.VIEWED, 0),
            'partially_signed': status_counts.get(Envelope.Status.PARTIALLY_SIGNED, 0),
            'in_progress': sum(status_counts.get(status_value, 0) for status_value in [Envelope.Status.SENT, Envelope.Status.VIEWED, Envelope.Status.PARTIALLY_SIGNED]),
            'completed': status_counts.get(Envelope.Status.COMPLETED, 0),
            'declined': status_counts.get(Envelope.Status.DECLINED, 0),
            'voided': status_counts.get(Envelope.Status.VOIDED, 0),
            'expired': status_counts.get(Envelope.Status.EXPIRED, 0),
            'closed': sum(status_counts.get(status_value, 0) for status_value in [Envelope.Status.VOIDED, Envelope.Status.EXPIRED, Envelope.Status.DECLINED]),
            'overdue': overdue,
        })

    def get_queryset(self):
        queryset = super().get_queryset()
        status_value = self.request.query_params.get('status')
        organization_id = self.request.query_params.get('organization')
        search = self.request.query_params.get('search')
        ordering = self.request.query_params.get('ordering')
        due_from = self.request.query_params.get('due_from')
        due_to = self.request.query_params.get('due_to')
        if status_value:
            queryset = queryset.filter(status=status_value)
        if organization_id:
            queryset = queryset.filter(organization_id=organization_id)
        if search:
            queryset = queryset.filter(name__icontains=search)
        if due_from:
            queryset = queryset.filter(due_date__gte=due_from)
        if due_to:
            queryset = queryset.filter(due_date__lte=due_to)
        allowed_ordering = {
            'name': 'name',
            '-name': '-name',
            'created_at': 'created_at',
            '-created_at': '-created_at',
            'due_date': 'due_date',
            '-due_date': '-due_date',
        }
        if ordering in allowed_ordering:
            queryset = queryset.order_by(allowed_ordering[ordering])
        return queryset

    def perform_create(self, serializer):
        self._assert_related_organization_access(serializer)
        organization = serializer.validated_data['organization']
        validate_data_residency_for_organization(organization)
        if not serializer.validated_data.get('due_date'):
            defaults = GeneralSettings.objects.filter(organization=organization).first()
            if defaults and defaults.default_envelope_expiration_days:
                serializer.validated_data['due_date'] = timezone.now().date() + timezone.timedelta(days=defaults.default_envelope_expiration_days)
        serializer.save(sender=self.request.user)

    def perform_destroy(self, instance):
        assert_not_under_active_legal_hold('envelope', instance.id)
        return super().perform_destroy(instance)

    @decorators.action(detail=False, methods=['post'], url_path='create-from-template')
    def create_from_template(self, request):
        serializer = CreateEnvelopeFromTemplateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        organization_id = serializer.validated_data['organization']
        organization = Organization.objects.get(id=organization_id)
        validate_data_residency_for_organization(organization)
        if not user_has_org_role(request.user, organization_id, OrganizationRolePermission.write_roles) and not user_has_custom_permission(request.user, organization_id, 'envelopes:create'):
            return response.Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
        template_version = TemplateVersion.objects.select_related('template', 'document').filter(
            id=serializer.validated_data['template_version'],
            template__organization_id=organization_id,
        ).first()
        if not template_version:
            raise serializers.ValidationError('Template version was not found for this organization.')
        due_date = serializer.validated_data.get('due_date')
        if not due_date:
            defaults = GeneralSettings.objects.filter(organization=organization).first()
            if defaults and defaults.default_envelope_expiration_days:
                due_date = timezone.now().date() + timezone.timedelta(days=defaults.default_envelope_expiration_days)
        try:
            envelope = create_envelope_from_template(
                organization=template_version.template.organization,
                template_version=template_version,
                sender=request.user,
                name=serializer.validated_data['name'],
                message=serializer.validated_data.get('message', ''),
                due_date=due_date,
                recipients=serializer.validated_data['recipients'],
                send_status=serializer.validated_data.get('send', False),
            )
        except ValueError as exc:
            raise serializers.ValidationError(str(exc))
        if serializer.validated_data.get('send', False):
            messages = queue_envelope_invites(envelope, queued_by=request.user, request=request)
            for message in messages:
                deliver_email_message_task.apply_async(args=[message.id], queue='email')
        return response.Response(self.get_serializer(envelope).data, status=status.HTTP_201_CREATED)

    @decorators.action(detail=True, methods=['post'])
    def send(self, request, pk=None):
        envelope = self.get_object()
        serializer = EnvelopeStatusSerializer(data=request.data, context={'envelope': envelope, 'status': Envelope.Status.SENT})
        serializer.is_valid(raise_exception=True)
        envelope = serializer.save()
        messages = queue_envelope_invites(envelope, queued_by=request.user, request=request)
        for message in messages:
            deliver_email_message_task.apply_async(args=[message.id], queue='email')
        data = self.get_serializer(envelope).data
        data['queued_email_count'] = len(messages)
        return response.Response(data)

    @decorators.action(detail=True, methods=['post'])
    def void(self, request, pk=None):
        envelope = self.get_object()
        serializer = EnvelopeStatusSerializer(data=request.data, context={'envelope': envelope, 'status': Envelope.Status.VOIDED})
        serializer.is_valid(raise_exception=True)
        envelope = serializer.save()
        return response.Response(self.get_serializer(envelope).data)

    @decorators.action(detail=True, methods=['post'])
    def remind(self, request, pk=None):
        envelope = self.get_object()
        messages = queue_reminders(envelope, queued_by=request.user, request=request)
        for message in messages:
            deliver_email_message_task.apply_async(args=[message.id], queue='email')
        return response.Response({'queued_email_count': len(messages)})

    @decorators.action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        envelope = self.get_object()
        from evidence.pdf import build_signed_pdf

        pdf_bytes, pdf_sha256 = build_signed_pdf(envelope)
        result = HttpResponse(pdf_bytes, content_type='application/pdf')
        result['Content-Disposition'] = f'attachment; filename="hanmak-envelope-{envelope.id}.pdf"'
        result['X-HanMak-SHA256'] = pdf_sha256
        return result

    @decorators.action(detail=False, methods=['post'], url_path='bulk-action')
    def bulk_action(self, request):
        ids = request.data.get('ids') or []
        action = request.data.get('action')
        queryset = self.filter_queryset(self.get_queryset()).filter(id__in=ids)
        if action == 'send':
            sent = 0
            queued = 0
            skipped = []
            for envelope in queryset.filter(status=Envelope.Status.DRAFT):
                serializer = EnvelopeStatusSerializer(data={}, context={'envelope': envelope, 'status': Envelope.Status.SENT})
                if not serializer.is_valid():
                    skipped.append({'id': envelope.id, 'errors': serializer.errors})
                    continue
                envelope.status = Envelope.Status.SENT
                envelope.sent_at = timezone.now()
                envelope.save(update_fields=['status', 'sent_at', 'updated_at'])
                messages = queue_envelope_invites(envelope, queued_by=request.user, request=request)
                for message in messages:
                    deliver_email_message_task.apply_async(args=[message.id], queue='email')
                sent += 1
                queued += len(messages)
            return response.Response({'ok': True, 'action': action, 'updated': sent, 'queued_email_count': queued, 'skipped': skipped})
        if action == 'void':
            updated = queryset.exclude(status__in=[Envelope.Status.COMPLETED, Envelope.Status.VOIDED]).update(
                status=Envelope.Status.VOIDED,
                void_reason=request.data.get('reason', 'Bulk voided'),
                updated_at=timezone.now(),
            )
            return response.Response({'ok': True, 'action': action, 'updated': updated})
        if action == 'delete_drafts':
            drafts = queryset.filter(status=Envelope.Status.DRAFT)
            count = drafts.count()
            for envelope in drafts:
                assert_not_under_active_legal_hold('envelope', envelope.id)
            drafts.delete()
            return response.Response({'ok': True, 'action': action, 'deleted': count})
        if action == 'delete':
            count = queryset.count()
            for envelope in queryset:
                assert_not_under_active_legal_hold('envelope', envelope.id)
            queryset.delete()
            return response.Response({'ok': True, 'action': action, 'deleted': count})
        return response.Response({'detail': 'Unsupported bulk action.'}, status=400)


class RecipientViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'envelope_management'
    write_roles = OrganizationRolePermission.write_roles
    queryset = Recipient.objects.select_related('envelope').all().order_by('envelope_id', 'routing_order')
    serializer_class = RecipientSerializer
    permission_classes = [OrganizationRolePermission]

    @decorators.action(detail=True, methods=['post'])
    def mark_signed(self, request, pk=None):
        recipient = self.get_object()
        recipient.status = Recipient.Status.SIGNED
        recipient.signed_at = timezone.now()
        recipient.save(update_fields=['status', 'signed_at'])
        return response.Response(self.get_serializer(recipient).data, status=status.HTTP_200_OK)

    @decorators.action(detail=True, methods=['post'])
    def delegate(self, request, pk=None):
        recipient = self.get_object()
        if recipient.status in [Recipient.Status.SIGNED, Recipient.Status.DECLINED, Recipient.Status.DELEGATED]:
            return response.Response(
                {'detail': f'Cannot delegate a recipient with status "{recipient.status}".'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = RecipientDelegationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        delegate = Recipient.objects.create(
            envelope=recipient.envelope,
            delegated_from=recipient,
            name=serializer.validated_data['name'],
            email=serializer.validated_data['email'],
            role=recipient.role,
            status=Recipient.Status.SENT if recipient.envelope.status != Envelope.Status.DRAFT else Recipient.Status.PENDING,
            routing_order=recipient.routing_order,
            delegation_reason=serializer.validated_data.get('reason', ''),
            delegated_at=timezone.now(),
        )
        recipient.fields.update(recipient=delegate)
        recipient.signing_sessions.exclude(status=SigningSession.Status.SUBMITTED).update(status=SigningSession.Status.REVOKED)
        recipient.status = Recipient.Status.DELEGATED
        recipient.delegated_at = timezone.now()
        recipient.delegation_reason = serializer.validated_data.get('reason', '')
        recipient.save(update_fields=['status', 'delegated_at', 'delegation_reason'])
        queued_email_id = None
        if recipient.envelope.status != Envelope.Status.DRAFT:
            session, _ = SigningSession.objects.get_or_create(envelope=recipient.envelope, recipient=delegate)
            signing_url = absolute_signing_url(request, session)
            subject, body, html_body = render_email(EmailMessage.Kind.ENVELOPE_INVITE, recipient.envelope, delegate, signing_url)
            message = EmailMessage.objects.create(
                organization=recipient.envelope.organization,
                envelope=recipient.envelope,
                recipient=delegate,
                signing_session=session,
                kind=EmailMessage.Kind.ENVELOPE_INVITE,
                to_email=delegate.email,
                subject=subject,
                body=body,
                html_body=html_body,
                queued_by=request.user,
            )
            deliver_email_message_task.apply_async(args=[message.id], queue='email')
            queued_email_id = message.id
        data = self.get_serializer(delegate).data
        data['delegated_from_recipient'] = recipient.id
        data['queued_email'] = queued_email_id
        return response.Response(data, status=status.HTTP_201_CREATED)


class FormFieldViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'form_builder'
    write_roles = OrganizationRolePermission.write_roles
    queryset = FormField.objects.select_related('template', 'envelope', 'recipient').all().order_by('page', 'y', 'x')
    serializer_class = FormFieldSerializer
    permission_classes = [OrganizationRolePermission]
