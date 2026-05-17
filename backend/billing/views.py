import hashlib
import hmac
import json
import secrets

from django.conf import settings
from django.db import transaction
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from rest_framework import decorators, permissions, response, viewsets
from rest_framework.decorators import api_view, permission_classes

from accounts.models import Organization
from accounts.permissions import OrganizationScopedQuerySetMixin, feature_flag_allows_request, user_has_org_role
from accounts.models import Membership

from .models import Invoice, LicenseKey, PaymentMethod, PaymentPortalSession, PaymentWebhookEvent, Plan, Subscription, UsageRecord
from .serializers import (
    InvoiceSerializer,
    LicenseKeySerializer,
    PaymentMethodSerializer,
    PaymentPortalSessionSerializer,
    PaymentWebhookEventSerializer,
    PlanSerializer,
    SubscriptionSerializer,
    UsageRecordSerializer,
)

DEFAULT_LICENSE_FEATURES = [
    {'name': 'Form Builder', 'note': 'All field types', 'enabled': True},
    {'name': 'Workflow Builder', 'note': 'Visual editor and approval stages', 'enabled': True},
    {'name': 'API Access', 'note': 'REST API, API keys, OAuth apps, and webhooks', 'enabled': True},
    {'name': 'Audit Evidence', 'note': 'Evidence bundles and completion certificates', 'enabled': True},
    {'name': 'Custom Branding', 'note': 'Logo and organization colors', 'enabled': True},
    {'name': 'SSO / SAML / OIDC', 'note': 'Available when identity module is released', 'enabled': True},
    {'name': 'SCIM / LDAP', 'note': 'Available when identity module is released', 'enabled': True},
    {'name': 'Advanced Compliance', 'note': 'Controlled by release flags', 'enabled': True},
]


class PlanViewSet(viewsets.ModelViewSet):
    feature_flag_key = 'billing_usage'
    queryset = Plan.objects.all().order_by('monthly_price')
    serializer_class = PlanSerializer
    permission_classes = [permissions.IsAuthenticated]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if not feature_flag_allows_request(request, self):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('The "billing_usage" feature is not released for this organization.')


class SubscriptionViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'billing_usage'
    queryset = Subscription.objects.select_related('organization', 'plan').all().order_by('organization__name')
    serializer_class = SubscriptionSerializer
    permission_classes = [permissions.IsAuthenticated]

    @decorators.action(detail=False, methods=['post'], url_path='checkout-session')
    def checkout_session(self, request):
        organization_id = request.data.get('organization')
        plan_id = request.data.get('plan')
        organization = Organization.objects.filter(id=organization_id).first()
        plan = Plan.objects.filter(id=plan_id, is_active=True).first()
        if not organization or not plan:
            return response.Response({'detail': 'organization and active plan are required.'}, status=400)
        if not user_has_org_role(request.user, organization.id, [Membership.Role.ADMIN, Membership.Role.MANAGER]):
            return response.Response({'detail': 'Admin or manager membership is required for billing checkout.'}, status=403)
        token = secrets.token_urlsafe(18)
        success_url = request.data.get('success_url') or getattr(settings, 'HANMAK_BILLING_SUCCESS_URL', 'http://127.0.0.1:8080/mock/?page=billing&checkout=success')
        cancel_url = request.data.get('cancel_url') or getattr(settings, 'HANMAK_BILLING_CANCEL_URL', 'http://127.0.0.1:8080/mock/?page=billing&checkout=cancel')
        base_url = getattr(settings, 'HANMAK_PAYMENT_CHECKOUT_BASE_URL', 'http://127.0.0.1:8080/mock/billing-checkout')
        session = PaymentPortalSession.objects.create(
            organization=organization,
            plan=plan,
            session_type=PaymentPortalSession.SessionType.CHECKOUT,
            provider=getattr(settings, 'HANMAK_PAYMENT_PROVIDER', 'mock'),
            provider_session_id=f'chk_{token}',
            url=f'{base_url}?session=chk_{token}&plan={plan.code}',
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={'plan_code': plan.code, 'monthly_price': str(plan.monthly_price)},
            created_by=request.user,
            expires_at=timezone.now() + timezone.timedelta(hours=1),
        )
        return response.Response(PaymentPortalSessionSerializer(session, context=self.get_serializer_context()).data, status=201)

    @decorators.action(detail=False, methods=['post'], url_path='billing-portal')
    def billing_portal(self, request):
        organization_id = request.data.get('organization')
        organization = Organization.objects.filter(id=organization_id).first()
        if not organization:
            return response.Response({'detail': 'organization is required.'}, status=400)
        if not user_has_org_role(request.user, organization.id, [Membership.Role.ADMIN, Membership.Role.MANAGER]):
            return response.Response({'detail': 'Admin or manager membership is required for billing portal access.'}, status=403)
        token = secrets.token_urlsafe(18)
        return_url = request.data.get('return_url') or getattr(settings, 'HANMAK_BILLING_RETURN_URL', 'http://127.0.0.1:8080/mock/?page=billing')
        base_url = getattr(settings, 'HANMAK_PAYMENT_PORTAL_BASE_URL', 'http://127.0.0.1:8080/mock/billing-portal')
        session = PaymentPortalSession.objects.create(
            organization=organization,
            session_type=PaymentPortalSession.SessionType.PORTAL,
            provider=getattr(settings, 'HANMAK_PAYMENT_PROVIDER', 'mock'),
            provider_session_id=f'portal_{token}',
            url=f'{base_url}?session=portal_{token}',
            success_url=return_url,
            metadata={'return_url': return_url},
            created_by=request.user,
            expires_at=timezone.now() + timezone.timedelta(minutes=30),
        )
        return response.Response(PaymentPortalSessionSerializer(session, context=self.get_serializer_context()).data, status=201)


class UsageRecordViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'billing_usage'
    queryset = UsageRecord.objects.select_related('organization').all().order_by('-period_end')
    serializer_class = UsageRecordSerializer
    permission_classes = [permissions.IsAuthenticated]


class LicenseKeyViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'license_management'
    queryset = LicenseKey.objects.select_related('organization').all().order_by('-created_at')
    serializer_class = LicenseKeySerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        self._assert_related_organization_access(serializer)
        serializer.save(features=serializer.validated_data.get('features') or DEFAULT_LICENSE_FEATURES)

    @decorators.action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        license_key = self.get_object()
        license_key.status = 'active'
        license_key.activated_at = timezone.now()
        if not license_key.features:
            license_key.features = DEFAULT_LICENSE_FEATURES
        license_key.save(update_fields=['status', 'activated_at', 'features'])
        return response.Response(self.get_serializer(license_key).data)


class InvoiceViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'billing_usage'
    queryset = Invoice.objects.select_related('organization').all().order_by('-created_at')
    serializer_class = InvoiceSerializer
    permission_classes = [permissions.IsAuthenticated]


class PaymentMethodViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'billing_usage'
    queryset = PaymentMethod.objects.select_related('organization').all().order_by('-is_default', '-updated_at')
    serializer_class = PaymentMethodSerializer
    permission_classes = [permissions.IsAuthenticated]


class PaymentPortalSessionViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'billing_usage'
    queryset = PaymentPortalSession.objects.select_related('organization', 'plan', 'created_by').all()
    serializer_class = PaymentPortalSessionSerializer
    permission_classes = [permissions.IsAuthenticated]


class PaymentWebhookEventViewSet(OrganizationScopedQuerySetMixin, viewsets.ReadOnlyModelViewSet):
    feature_flag_key = 'billing_usage'
    queryset = PaymentWebhookEvent.objects.select_related('organization', 'portal_session').all()
    serializer_class = PaymentWebhookEventSerializer
    permission_classes = [permissions.IsAuthenticated]


@csrf_exempt
@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def payment_provider_webhook(request):
    provider = (request.query_params.get('provider') or request.headers.get('X-HanMak-Payment-Provider') or getattr(settings, 'HANMAK_PAYMENT_PROVIDER', 'mock')).lower()
    raw_body = request.body or b'{}'
    signature_error = _validate_payment_signature(provider, raw_body, request.headers)
    if signature_error:
        return response.Response({'detail': signature_error}, status=400)
    try:
        payload = json.loads(raw_body.decode('utf-8') or '{}')
    except json.JSONDecodeError:
        return response.Response({'detail': 'Webhook payload must be valid JSON.'}, status=400)
    event_id = _payment_event_id(provider, payload)
    event_type = _payment_event_type(provider, payload)
    with transaction.atomic():
        event, created = PaymentWebhookEvent.objects.get_or_create(
            provider=provider,
            provider_event_id=event_id,
            defaults={'event_type': event_type, 'payload': payload},
        )
        if not created and event.status == PaymentWebhookEvent.Status.PROCESSED:
            return response.Response({'ok': True, 'duplicate': True, 'event': event.id})
        event.event_type = event_type
        event.payload = payload
        try:
            notes = _reconcile_payment_event(provider, payload, event)
            event.status = PaymentWebhookEvent.Status.PROCESSED if notes.get('processed') else PaymentWebhookEvent.Status.IGNORED
            event.processing_notes = notes.get('message', '')
            event.processed_at = timezone.now()
        except Exception as exc:
            event.status = PaymentWebhookEvent.Status.FAILED
            event.processing_notes = str(exc)
        event.save(update_fields=['event_type', 'payload', 'organization', 'portal_session', 'status', 'processing_notes', 'processed_at'])
    status_code = 200 if event.status != PaymentWebhookEvent.Status.FAILED else 500
    return response.Response({'ok': event.status != PaymentWebhookEvent.Status.FAILED, 'event': event.id, 'status': event.status, 'notes': event.processing_notes}, status=status_code)


def _validate_payment_signature(provider, raw_body, headers):
    if provider == 'stripe':
        secret = getattr(settings, 'STRIPE_WEBHOOK_SECRET', '')
        signature = headers.get('Stripe-Signature', '')
        if secret:
            timestamp = _stripe_signature_part(signature, 't')
            expected = hmac.new(secret.encode(), f'{timestamp}.{raw_body.decode("utf-8")}'.encode(), hashlib.sha256).hexdigest()
            received = _stripe_signature_part(signature, 'v1')
            if not timestamp or not received or not hmac.compare_digest(expected, received):
                return 'Invalid Stripe webhook signature.'
    elif provider == 'adyen':
        secret = getattr(settings, 'ADYEN_WEBHOOK_HMAC_KEY', '')
        signature = headers.get('HmacSignature') or headers.get('X-Adyen-Hmac-Signature') or ''
        if secret and signature:
            expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
            if not hmac.compare_digest(expected, signature):
                return 'Invalid Adyen webhook signature.'
        elif secret:
            return 'Missing Adyen webhook signature.'
    else:
        secret = getattr(settings, 'HANMAK_PAYMENT_WEBHOOK_SECRET', '')
        signature = headers.get('X-HanMak-Signature', '')
        if secret:
            expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
            if not hmac.compare_digest(expected, signature):
                return 'Invalid HanMak payment webhook signature.'
    return None


def _stripe_signature_part(signature, key):
    for part in signature.split(','):
        if part.startswith(f'{key}='):
            return part.split('=', 1)[1]
    return ''


def _payment_event_id(provider, payload):
    if payload.get('id'):
        return str(payload['id'])
    if provider == 'adyen':
        items = payload.get('notificationItems') or []
        if items:
            item = items[0].get('NotificationRequestItem', {})
            return str(item.get('pspReference') or item.get('originalReference') or secrets.token_urlsafe(12))
    return f'{provider}_{hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()[:24]}'


def _payment_event_type(provider, payload):
    if provider == 'stripe':
        return payload.get('type', 'unknown')
    if provider == 'adyen':
        items = payload.get('notificationItems') or []
        if items:
            return items[0].get('NotificationRequestItem', {}).get('eventCode', 'unknown').lower()
    return payload.get('event_type') or payload.get('type') or 'unknown'


def _reconcile_payment_event(provider, payload, event):
    normalized = _normalize_payment_payload(provider, payload)
    organization = _resolve_payment_organization(normalized)
    portal_session = _resolve_payment_session(normalized, organization)
    event.organization = organization
    event.portal_session = portal_session
    event_type = normalized.get('event_type', '')
    if portal_session and event_type in ['checkout.session.completed', 'checkout.completed', 'authorisation']:
        portal_session.status = PaymentPortalSession.Status.COMPLETED
        portal_session.save(update_fields=['status'])
    if organization and normalized.get('plan_code'):
        plan = Plan.objects.filter(code=normalized['plan_code'], is_active=True).first()
        if plan:
            Subscription.objects.update_or_create(
                organization=organization,
                defaults={
                    'plan': plan,
                    'status': normalized.get('subscription_status') or Subscription.Status.ACTIVE,
                    'current_period_start': normalized.get('period_start'),
                    'current_period_end': normalized.get('period_end'),
                },
            )
    if organization and normalized.get('invoice_number'):
        Invoice.objects.update_or_create(
            organization=organization,
            invoice_number=normalized['invoice_number'],
            defaults={
                'amount': normalized.get('amount') or 0,
                'currency': normalized.get('currency') or 'USD',
                'status': normalized.get('invoice_status') or Invoice.Status.OPEN,
                'period_start': normalized.get('period_start') or timezone.localdate(),
                'period_end': normalized.get('period_end') or timezone.localdate(),
                'paid_at': normalized.get('paid_at'),
            },
        )
    processed = bool(organization or portal_session)
    return {'processed': processed, 'message': 'Payment event reconciled.' if processed else 'Payment event recorded but no organization/session matched.'}


def _normalize_payment_payload(provider, payload):
    if provider == 'stripe':
        event_type = payload.get('type', '')
        obj = (payload.get('data') or {}).get('object') or {}
        metadata = obj.get('metadata') or {}
        status_map = {'paid': Invoice.Status.PAID, 'open': Invoice.Status.OPEN, 'void': Invoice.Status.VOID, 'uncollectible': Invoice.Status.UNCOLLECTIBLE}
        invoice_number = (obj.get('number') or obj.get('id')) if event_type.startswith('invoice.') else None
        return {
            'event_type': event_type,
            'provider_session_id': obj.get('id') or obj.get('checkout_session'),
            'organization_id': metadata.get('organization') or metadata.get('organization_id'),
            'plan_code': metadata.get('plan_code'),
            'subscription_status': obj.get('status') if event_type.startswith('customer.subscription') else None,
            'invoice_number': invoice_number,
            'invoice_status': status_map.get(obj.get('status'), Invoice.Status.OPEN),
            'amount': (obj.get('amount_paid') or obj.get('amount_due') or 0) / 100,
            'currency': (obj.get('currency') or 'USD').upper(),
            'paid_at': timezone.now() if event_type in ['invoice.paid', 'invoice.payment_succeeded'] else None,
        }
    if provider == 'adyen':
        item = ((payload.get('notificationItems') or [{}])[0].get('NotificationRequestItem') or {})
        additional = item.get('additionalData') or {}
        return {
            'event_type': item.get('eventCode', '').lower(),
            'provider_session_id': item.get('merchantReference'),
            'organization_id': additional.get('organization_id'),
            'plan_code': additional.get('plan_code'),
            'invoice_number': item.get('pspReference'),
            'invoice_status': Invoice.Status.PAID if item.get('success') == 'true' else Invoice.Status.OPEN,
            'amount': (item.get('amount') or {}).get('value', 0) / 100,
            'currency': (item.get('amount') or {}).get('currency', 'USD'),
            'paid_at': timezone.now() if item.get('success') == 'true' else None,
        }
    return {
        'event_type': payload.get('event_type') or payload.get('type'),
        'provider_session_id': payload.get('provider_session_id') or payload.get('session'),
        'organization_id': payload.get('organization') or payload.get('organization_id'),
        'plan_code': payload.get('plan_code'),
        'invoice_number': payload.get('invoice_number'),
        'invoice_status': payload.get('invoice_status'),
        'amount': payload.get('amount'),
        'currency': payload.get('currency'),
        'paid_at': timezone.now() if payload.get('paid') else None,
    }


def _resolve_payment_organization(normalized):
    organization_id = normalized.get('organization_id')
    if organization_id:
        return Organization.objects.filter(id=organization_id).first()
    return None


def _resolve_payment_session(normalized, organization):
    session_id = normalized.get('provider_session_id')
    if not session_id:
        return None
    queryset = PaymentPortalSession.objects.filter(provider_session_id=session_id)
    if organization:
        queryset = queryset.filter(organization=organization)
    return queryset.first()
