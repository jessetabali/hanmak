"""
URL configuration for hanmak project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.conf import settings
from django.conf.urls.static import static
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.routers import DefaultRouter

from accounts.token_views import HanMakTokenObtainPairView, HanMakTokenRefreshView
from accounts.views import (
    InvitationViewSet,
    AccountRecoveryRequestViewSet,
    ImpersonationRequestViewSet,
    MFADeviceViewSet,
    MembershipViewSet,
    NotificationPreferenceViewSet,
    ObjectPermissionViewSet,
    OrganizationDomainViewSet,
    OrganizationViewSet,
    RecoveryCodeViewSet,
    RoleViewSet,
    TeamViewSet,
    UserProfileViewSet,
    UserSessionViewSet,
    UserViewSet,
)
from analytics.views import (
    ApprovalBottleneckAnalyticsView,
    CompletionAnalyticsView,
    TemplateUsageAnalyticsView,
    WebhookHealthAnalyticsView,
)
from api_keys.views import APIKeyViewSet, APIRequestLogViewSet
from approvals.views import ApprovalRequestViewSet
from auditlog.views import AuditEventViewSet
from billing.views import InvoiceViewSet, LicenseKeyViewSet, PaymentMethodViewSet, PaymentPortalSessionViewSet, PaymentWebhookEventViewSet, PlanViewSet, SubscriptionViewSet, UsageRecordViewSet, payment_provider_webhook
from compliance.views import (
    ComplianceExportViewSet,
    DataResidencyRegionViewSet,
    LegalHoldItemViewSet,
    LegalHoldViewSet,
    OrganizationDataResidencyPolicyViewSet,
    RetentionPolicyViewSet,
)
from configcenter.views import (
    AppSettingViewSet,
    EmailSettingsViewSet,
    FeatureFlagViewSet,
    GeneralSettingsViewSet,
    HealthCheckViewSet,
    IncidentViewSet,
    SecuritySettingsViewSet,
    StorageSettingsViewSet,
)
from documents.views import DocumentPageViewSet, DocumentScanViewSet, DocumentViewSet, EnvelopeDocumentViewSet, StoredFileViewSet
from envelopes.views import (
    EnvelopeViewSet,
    FormFieldViewSet,
    RecipientViewSet,
    TemplatePartyViewSet,
    TemplateVersionViewSet,
    TemplateViewSet,
)
from evidence.views import EvidenceBundleViewSet
from identity.views import (
    JITProvisioningSettingsViewSet,
    LDAPConnectionViewSet,
    SCIMConnectionViewSet,
    SCIMExternalIdentityViewSet,
    SocialProviderViewSet,
    SSOConnectionViewSet,
)
from inbox.views import MyInboxView
from messaging.views import EmailMessageViewSet, EmailTemplateViewSet, ReminderScheduleViewSet, email_bounce_webhook
from oauth_apps.views import OAuthApplicationViewSet, OAuthGrantViewSet
from risk.views import PolicyRuleViewSet, RiskFindingViewSet
from search.views import GlobalSearchView, SearchIndexViewSet
from signing.views import ConsentRecordViewSet, EnvelopeFieldValueViewSet, PublicSigningSessionView, SignatureViewSet, SigningSessionViewSet
from tasks.views import TaskDefinitionViewSet, TaskRunEventViewSet, TaskRunViewSet
from webhooks.views import EventOutboxViewSet, WebhookDeliveryViewSet, WebhookEndpointViewSet
from workflow.views import WorkflowDefinitionViewSet, WorkflowEventViewSet, WorkflowRunViewSet, WorkflowStageViewSet

router = DefaultRouter()
router.register('users', UserViewSet)
router.register('organizations', OrganizationViewSet)
router.register('organization-domains', OrganizationDomainViewSet)
router.register('memberships', MembershipViewSet)
router.register('teams', TeamViewSet)
router.register('roles', RoleViewSet)
router.register('invitations', InvitationViewSet)
router.register('profiles', UserProfileViewSet)
router.register('mfa-devices', MFADeviceViewSet, basename='mfa-device')
router.register('account-recovery', AccountRecoveryRequestViewSet, basename='account-recovery')
router.register('recovery-codes', RecoveryCodeViewSet, basename='recovery-code')
router.register('object-permissions', ObjectPermissionViewSet)
router.register('notification-preferences', NotificationPreferenceViewSet, basename='notification-preference')
router.register('user-sessions', UserSessionViewSet, basename='user-session')
router.register('impersonation-requests', ImpersonationRequestViewSet, basename='impersonation-request')
router.register('templates', TemplateViewSet)
router.register('template-versions', TemplateVersionViewSet)
router.register('template-parties', TemplatePartyViewSet)
router.register('envelopes', EnvelopeViewSet)
router.register('recipients', RecipientViewSet)
router.register('form-fields', FormFieldViewSet)
router.register('stored-files', StoredFileViewSet)
router.register('documents', DocumentViewSet)
router.register('document-pages', DocumentPageViewSet)
router.register('document-scans', DocumentScanViewSet)
router.register('envelope-documents', EnvelopeDocumentViewSet)
router.register('audit-events', AuditEventViewSet)
router.register('signing-sessions', SigningSessionViewSet)
router.register('consent-records', ConsentRecordViewSet)
router.register('signatures', SignatureViewSet)
router.register('field-values', EnvelopeFieldValueViewSet)
router.register('approval-requests', ApprovalRequestViewSet)
router.register('evidence-bundles', EvidenceBundleViewSet)
router.register('email-messages', EmailMessageViewSet)
router.register('email-templates', EmailTemplateViewSet, basename='email-template')
router.register('reminder-schedules', ReminderScheduleViewSet)
router.register('webhook-endpoints', WebhookEndpointViewSet)
router.register('event-outbox', EventOutboxViewSet)
router.register('webhook-deliveries', WebhookDeliveryViewSet)
router.register('task-definitions', TaskDefinitionViewSet)
router.register('task-runs', TaskRunViewSet)
router.register('task-run-events', TaskRunEventViewSet)
router.register('api-keys', APIKeyViewSet)
router.register('api-request-logs', APIRequestLogViewSet)
router.register('oauth-apps', OAuthApplicationViewSet)
router.register('oauth-grants', OAuthGrantViewSet)
router.register('workflows', WorkflowDefinitionViewSet)
router.register('workflow-stages', WorkflowStageViewSet)
router.register('workflow-runs', WorkflowRunViewSet)
router.register('workflow-events', WorkflowEventViewSet)
router.register('search-index', SearchIndexViewSet)
router.register('sso-connections', SSOConnectionViewSet)
router.register('scim-connections', SCIMConnectionViewSet)
router.register('scim-identities', SCIMExternalIdentityViewSet)
router.register('ldap-connections', LDAPConnectionViewSet)
router.register('jit-settings', JITProvisioningSettingsViewSet, basename='jit-setting')
router.register('social-providers', SocialProviderViewSet)
router.register('legal-holds', LegalHoldViewSet)
router.register('legal-hold-items', LegalHoldItemViewSet)
router.register('retention-policies', RetentionPolicyViewSet)
router.register('compliance-exports', ComplianceExportViewSet)
router.register('data-residency-regions', DataResidencyRegionViewSet)
router.register('data-residency-policies', OrganizationDataResidencyPolicyViewSet)
router.register('plans', PlanViewSet)
router.register('subscriptions', SubscriptionViewSet)
router.register('usage-records', UsageRecordViewSet)
router.register('license-keys', LicenseKeyViewSet)
router.register('invoices', InvoiceViewSet)
router.register('payment-methods', PaymentMethodViewSet, basename='payment-method')
router.register('payment-portal-sessions', PaymentPortalSessionViewSet, basename='payment-portal-session')
router.register('payment-webhook-events', PaymentWebhookEventViewSet, basename='payment-webhook-event')
router.register('app-settings', AppSettingViewSet)
router.register('feature-flags', FeatureFlagViewSet)
router.register('general-settings', GeneralSettingsViewSet, basename='general-setting')
router.register('email-settings', EmailSettingsViewSet, basename='email-setting')
router.register('storage-settings', StorageSettingsViewSet, basename='storage-setting')
router.register('security-settings', SecuritySettingsViewSet, basename='security-setting')
router.register('health-checks', HealthCheckViewSet)
router.register('incidents', IncidentViewSet)
router.register('risk-findings', RiskFindingViewSet)
router.register('policy-rules', PolicyRuleViewSet)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/email/bounce/', email_bounce_webhook, name='email-bounce-webhook'),
    path('api/v1/billing/payment-webhook/', payment_provider_webhook, name='payment-provider-webhook'),
    path('api/', include(router.urls)),
    path('api/v1/', include(router.urls)),
    path('api/v1/inbox/', MyInboxView.as_view(), name='my-inbox'),
    path('api/v1/search/', GlobalSearchView.as_view(), name='global-search'),
    path('api/v1/sign/<str:token>/', PublicSigningSessionView.as_view(), name='public-signing-session'),
    path('api/v1/analytics/completion/', CompletionAnalyticsView.as_view(), name='analytics-completion'),
    path('api/v1/analytics/template-usage/', TemplateUsageAnalyticsView.as_view(), name='analytics-template-usage'),
    path('api/v1/analytics/approval-bottlenecks/', ApprovalBottleneckAnalyticsView.as_view(), name='analytics-approval-bottlenecks'),
    path('api/v1/analytics/webhook-health/', WebhookHealthAnalyticsView.as_view(), name='analytics-webhook-health'),
    path('api/v1/auth/login/', HanMakTokenObtainPairView.as_view(), name='token-obtain-pair'),
    path('api/v1/auth/refresh/', HanMakTokenRefreshView.as_view(), name='token-refresh'),
    path('api/v1/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/v1/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api-auth/', include('rest_framework.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
