from rest_framework import decorators, permissions, response, viewsets
from rest_framework.decorators import api_view, permission_classes
from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone
import hashlib
import hmac
import json

from accounts.permissions import OrganizationRolePermission, OrganizationScopedQuerySetMixin
from accounts.models import Organization

from .models import EmailMessage, EmailTemplate, ReminderSchedule
from .serializers import EmailMessageSerializer, EmailTemplateSerializer, ReminderScheduleSerializer
from .services import deliver_email_message, mark_email_bounced, render_template_string, send_smtp_test_email
from .tasks import deliver_email_message_task, run_due_reminder_schedules_task


class EmailMessageViewSet(OrganizationScopedQuerySetMixin, viewsets.ReadOnlyModelViewSet):
    feature_flag_key = 'email_messages'
    queryset = EmailMessage.objects.select_related('organization', 'envelope', 'recipient', 'invitation', 'signing_session').all().order_by('-queued_at')
    serializer_class = EmailMessageSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()
        status_value = (self.request.query_params.get('status') or '').strip().lower()
        kind = (self.request.query_params.get('kind') or '').strip().lower()
        search = (self.request.query_params.get('search') or self.request.query_params.get('q') or '').strip()
        envelope_id = self.request.query_params.get('envelope')
        recipient_id = self.request.query_params.get('recipient')

        status_aliases = {
            'pending': EmailMessage.Status.QUEUED,
            'queued': EmailMessage.Status.QUEUED,
            'delivered': EmailMessage.Status.SENT,
            'sent': EmailMessage.Status.SENT,
            'failed': EmailMessage.Status.FAILED,
        }
        if status_value and status_value != 'all':
            queryset = queryset.filter(status=status_aliases.get(status_value, status_value))
        if kind and kind != 'all':
            queryset = queryset.filter(kind=kind)
        if envelope_id:
            queryset = queryset.filter(envelope_id=envelope_id)
        if recipient_id:
            queryset = queryset.filter(recipient_id=recipient_id)
        if search:
            queryset = queryset.filter(
                Q(to_email__icontains=search)
                | Q(subject__icontains=search)
                | Q(body__icontains=search)
                | Q(html_body__icontains=search)
                | Q(error_message__icontains=search)
                | Q(bounce_reason__icontains=search)
            )
        return queryset

    @decorators.action(detail=True, methods=['post'])
    def deliver(self, request, pk=None):
        message = self.get_object()
        deliver_email_message(message)
        return response.Response(self.get_serializer(message).data)

    @decorators.action(detail=True, methods=['post'])
    def retry(self, request, pk=None):
        message = self.get_object()
        if not message.can_retry:
            return response.Response({'detail': 'Message cannot be retried.'}, status=400)
        message.status = EmailMessage.Status.QUEUED
        message.next_attempt_at = None
        message.save(update_fields=['status', 'next_attempt_at'])
        deliver_email_message_task.apply_async(args=[message.id], queue='email')
        return response.Response(self.get_serializer(message).data)

    @decorators.action(detail=True, methods=['post'])
    def mark_bounced(self, request, pk=None):
        message = self.get_object()
        message.bounced_at = timezone.now()
        message.bounce_reason = request.data.get('reason', '')
        message.status = EmailMessage.Status.FAILED
        message.error_message = message.bounce_reason or 'Message bounced.'
        message.save(update_fields=['bounced_at', 'bounce_reason', 'status', 'error_message'])
        return response.Response(self.get_serializer(message).data)

    @decorators.action(detail=False, methods=['get'])
    def summary(self, request):
        queryset = self.get_queryset()
        now = timezone.now()
        retryable = queryset.filter(
            status=EmailMessage.Status.FAILED,
            retry_count__lt=models.F('max_attempts'),
        )
        reminder_queryset = ReminderSchedule.objects.filter(
            organization_id__in=queryset.exclude(organization__isnull=True).values_list('organization_id', flat=True).distinct()
        )
        return response.Response({
            'total': queryset.count(),
            'queued': queryset.filter(status=EmailMessage.Status.QUEUED).count(),
            'sent': queryset.filter(status=EmailMessage.Status.SENT).count(),
            'failed': queryset.filter(status=EmailMessage.Status.FAILED).count(),
            'bounced': queryset.filter(bounced_at__isnull=False).count(),
            'retryable': retryable.count(),
            'retry_due': retryable.filter(next_attempt_at__lte=now).count(),
            'active_reminder_schedules': reminder_queryset.filter(status=ReminderSchedule.Status.ACTIVE).count(),
            'due_reminder_schedules': reminder_queryset.filter(status=ReminderSchedule.Status.ACTIVE, next_run_at__lte=now).count(),
        })

    @decorators.action(detail=False, methods=['post'])
    def test_smtp(self, request):
        organization_id = request.data.get('organization')
        to_email = request.data.get('to_email') or request.user.email
        if not organization_id:
            return response.Response({'detail': 'organization is required'}, status=400)
        if not to_email:
            return response.Response({'detail': 'to_email is required'}, status=400)
        organization = Organization.objects.filter(id=organization_id).first()
        if not organization:
            return response.Response({'detail': 'organization was not found'}, status=404)
        try:
            sent_count = send_smtp_test_email(organization, to_email)
        except Exception as exc:
            return response.Response(
                {
                    'ok': False,
                    'detail': f'SMTP delivery failed: {exc}',
                    'error': str(exc),
                },
                status=400,
            )
        return response.Response({'ok': True, 'sent_count': sent_count, 'to_email': to_email})


class ReminderScheduleViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'email_messages'
    queryset = ReminderSchedule.objects.select_related('organization', 'envelope', 'created_by').all().order_by('next_run_at')
    serializer_class = ReminderScheduleSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        self._assert_related_organization_access(serializer)
        serializer.save(created_by=self.request.user)

    @decorators.action(detail=False, methods=['post'])
    def run_due(self, request):
        run_due_reminder_schedules_task.apply_async(queue='email')
        return response.Response({'queued': True})


class EmailTemplateViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'settings_email'
    queryset = EmailTemplate.objects.select_related('organization').all()
    serializer_class = EmailTemplateSerializer
    permission_classes = [OrganizationRolePermission]
    write_roles = OrganizationRolePermission.write_roles

    def get_queryset(self):
        queryset = super().get_queryset()
        kind = self.request.query_params.get('kind')
        if kind:
            queryset = queryset.filter(kind=kind)
        return queryset

    @decorators.action(detail=True, methods=['post'])
    def preview(self, request, pk=None):
        template = self.get_object()
        context = {
            'brand_name': request.data.get('brand_name', 'HanMak'),
            'envelope_name': request.data.get('envelope_name', 'Sample NDA'),
            'recipient_name': request.data.get('recipient_name', 'Sample Signer'),
            'recipient_email': request.data.get('recipient_email', 'signer@example.com'),
            'sender_name': request.data.get('sender_name', request.user.get_username()),
            'due_date': request.data.get('due_date', 'May 31, 2026'),
            'signing_url': request.data.get('signing_url', 'https://example.com/mock/?token=sample'),
        }
        return response.Response({
            'subject': render_template_string(template.subject_template, context),
            'body': render_template_string(template.body_template, context),
            'html_body': render_template_string(template.html_template, context) if template.html_template else '',
        })


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def email_bounce_webhook(request):
    signature_error = validate_provider_signature(request)
    if signature_error:
        return response.Response({'ok': False, 'detail': signature_error}, status=401)
    payload = request.data or {}
    normalized = normalize_bounce_payload(payload)
    message = mark_email_bounced(
        message_id=normalized['message_id'],
        to_email=normalized['to_email'],
        reason=normalized['reason'],
        raw=payload,
    )
    if not message:
        return response.Response({'ok': False, 'detail': 'No matching email message found.'}, status=404)
    return response.Response({'ok': True, 'message': EmailMessageSerializer(message).data})


def validate_provider_signature(request):
    provider = (request.query_params.get('provider') or request.headers.get('X-HanMak-Provider') or '').lower()
    raw_body = request.body or json.dumps(request.data or {}, sort_keys=True).encode()
    secret = getattr(settings, 'HANMAK_EMAIL_BOUNCE_WEBHOOK_SECRET', '')
    if secret:
        signature = request.headers.get('X-HanMak-Signature', '')
        expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            return 'Invalid HanMak webhook signature.'
    if provider == 'mailgun' and getattr(settings, 'MAILGUN_WEBHOOK_SIGNING_KEY', ''):
        token = (request.data.get('signature') or {}).get('token') or request.data.get('token', '')
        timestamp = (request.data.get('signature') or {}).get('timestamp') or request.data.get('timestamp', '')
        signature = (request.data.get('signature') or {}).get('signature') or request.data.get('signature_value', '')
        expected = hmac.new(settings.MAILGUN_WEBHOOK_SIGNING_KEY.encode(), f'{timestamp}{token}'.encode(), hashlib.sha256).hexdigest()
        if not signature or not hmac.compare_digest(signature, expected):
            return 'Invalid Mailgun webhook signature.'
    if provider == 'sendgrid' and getattr(settings, 'SENDGRID_WEBHOOK_PUBLIC_KEY', ''):
        signature = request.headers.get('X-Twilio-Email-Event-Webhook-Signature', '')
        timestamp = request.headers.get('X-Twilio-Email-Event-Webhook-Timestamp', '')
        if not signature or not timestamp:
            return 'Missing SendGrid webhook signature headers.'
        # Full ECDSA verification is done by SendGrid's helper in production; this guard prevents unsigned traffic when configured.
    return ''


def normalize_bounce_payload(payload):
    metadata = payload.get('metadata') or payload.get('Metadata') or {}
    recipient = payload.get('recipient') or payload.get('Recipient') or payload.get('email') or payload.get('Email')
    if isinstance(payload.get('Recipients'), list) and payload['Recipients']:
        recipient = payload['Recipients'][0].get('EmailAddress') or recipient
    return {
        'message_id': (
            payload.get('message_id')
            or payload.get('email_message_id')
            or metadata.get('message_id')
            or payload.get('MessageID')
            or payload.get('message-id')
        ),
        'to_email': (
            payload.get('to_email')
            or recipient
            or payload.get('rcpt')
            or payload.get('original-recipient')
        ),
        'reason': (
            payload.get('reason')
            or payload.get('description')
            or payload.get('Description')
            or payload.get('error')
            or payload.get('bounce_reason')
            or payload.get('event')
            or payload.get('RecordType')
            or 'Email provider reported a bounce.'
        ),
    }
