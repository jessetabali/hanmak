from django.db import connection
from django.conf import settings
from django.utils import timezone
from rest_framework import decorators, permissions, response, viewsets
from decimal import Decimal
import os
import shutil
import time
from urllib import request as urlrequest

from accounts.models import Membership
from accounts.permissions import OrganizationRolePermission, OrganizationScopedQuerySetMixin, feature_flag_allows_request, user_has_org_role
from auditlog.services import log_admin_event
from messaging.models import EmailMessage
from tasks.models import TaskRun

from .models import AppSetting, EmailSettings, FeatureFlag, GeneralSettings, HealthCheck, Incident, SecuritySettings, StorageSettings
from .serializers import (
    AppSettingSerializer,
    EmailSettingsSerializer,
    FeatureFlagSerializer,
    GeneralSettingsSerializer,
    HealthCheckSerializer,
    IncidentSerializer,
    SecuritySettingsSerializer,
    StorageSettingsSerializer,
)


DEFAULT_RELEASE_MODULES = [
    {'key': 'core_dashboard', 'name': 'Dashboard', 'module': FeatureFlag.Module.CORE, 'description': 'Dashboard metrics, recent activity, pending tasks, and quick actions.', 'is_enabled': True, 'release_stage': FeatureFlag.ReleaseStage.RELEASED, 'rollout_percentage': 100},
    {'key': 'core_inbox', 'name': 'Inbox / My Tasks', 'module': FeatureFlag.Module.CORE, 'description': 'Task inbox, signing tasks, approval actions, snooze, delegation, and task counters.', 'is_enabled': True, 'release_stage': FeatureFlag.ReleaseStage.RELEASED, 'rollout_percentage': 100},
    {'key': 'core_profile', 'name': 'Profile & Security', 'module': FeatureFlag.Module.CORE, 'description': 'Personal profile, sessions, passkeys/MFA surfaces, activity, notifications, and password changes.', 'is_enabled': True, 'release_stage': FeatureFlag.ReleaseStage.RELEASED, 'rollout_percentage': 100},
    {'key': 'auth_login_setup', 'name': 'Login & Account Setup', 'module': FeatureFlag.Module.CORE, 'description': 'Sign in, setup token acceptance, invitation acceptance, recovery entry points, and auth token handling.', 'is_enabled': True, 'release_stage': FeatureFlag.ReleaseStage.RELEASED, 'rollout_percentage': 100},
    {'key': 'envelope_management', 'name': 'Envelopes', 'module': FeatureFlag.Module.SIGNING, 'description': 'Envelope list, create/edit/send/void/delete drafts, bulk actions, reminders, detail drawer, and downloads.', 'is_enabled': True, 'release_stage': FeatureFlag.ReleaseStage.RELEASED, 'rollout_percentage': 100},
    {'key': 'public_signing', 'name': 'Public Signing', 'module': FeatureFlag.Module.SIGNING, 'description': 'Secure signer links, recipient-owned fields, consent, signatures, attachments, readonly completion, and completion emails.', 'is_enabled': True, 'release_stage': FeatureFlag.ReleaseStage.RELEASED, 'rollout_percentage': 100},
    {'key': 'signing_sessions_admin', 'name': 'Signing Sessions Admin', 'module': FeatureFlag.Module.SIGNING, 'description': 'Admin signing-session visibility, tokens, active signer links, and session status review.', 'is_enabled': True, 'release_stage': FeatureFlag.ReleaseStage.BETA, 'rollout_percentage': 100},
    {'key': 'template_library', 'name': 'Templates', 'module': FeatureFlag.Module.TEMPLATES, 'description': 'Template list, metadata edit, archive/delete, template drawer, and create envelope from template.', 'is_enabled': True, 'release_stage': FeatureFlag.ReleaseStage.RELEASED, 'rollout_percentage': 100},
    {'key': 'form_builder', 'name': 'Form Builder', 'module': FeatureFlag.Module.TEMPLATES, 'description': 'Document upload/rendering, party assignment, field placement, select/date/signature/attachment fields, and template setup.', 'is_enabled': True, 'release_stage': FeatureFlag.ReleaseStage.RELEASED, 'rollout_percentage': 100},
    {'key': 'file_library', 'name': 'File Library', 'module': FeatureFlag.Module.TEMPLATES, 'description': 'Document upload, storage, scan/process/render pages, search/filter/sort, preview, download, and delete.', 'is_enabled': True, 'release_stage': FeatureFlag.ReleaseStage.RELEASED, 'rollout_percentage': 100},
    {'key': 'workflow_builder', 'name': 'Workflow Builder', 'module': FeatureFlag.Module.WORKFLOW, 'description': 'Workflow definitions, stage replacement, validation/simulation, activation, run creation, events, and advancement.', 'is_enabled': True, 'release_stage': FeatureFlag.ReleaseStage.BETA, 'rollout_percentage': 50},
    {'key': 'approval_queue', 'name': 'Approval Queue', 'module': FeatureFlag.Module.WORKFLOW, 'description': 'Approval queue tabs, approve/reject/request changes, delegation, CSV export, and request status tracking.', 'is_enabled': True, 'release_stage': FeatureFlag.ReleaseStage.RELEASED, 'rollout_percentage': 100},
    {'key': 'api_docs', 'name': 'API Docs', 'module': FeatureFlag.Module.DEVELOPER, 'description': 'Developer API documentation and endpoint examples inside the mock experience.', 'is_enabled': True, 'release_stage': FeatureFlag.ReleaseStage.BETA, 'rollout_percentage': 100},
    {'key': 'api_keys', 'name': 'API Keys', 'module': FeatureFlag.Module.DEVELOPER, 'description': 'API key list, create, rotate, revoke, and scope editing.', 'is_enabled': True, 'release_stage': FeatureFlag.ReleaseStage.BETA, 'rollout_percentage': 100},
    {'key': 'oauth_apps', 'name': 'OAuth Apps', 'module': FeatureFlag.Module.DEVELOPER, 'description': 'OAuth application list, create/delete, and grant visibility/revocation.', 'is_enabled': True, 'release_stage': FeatureFlag.ReleaseStage.BETA, 'rollout_percentage': 100},
    {'key': 'webhook_lab', 'name': 'Webhook Lab', 'module': FeatureFlag.Module.DEVELOPER, 'description': 'Webhook endpoint creation, delivery history, replay, and test-lab diagnostics.', 'is_enabled': True, 'release_stage': FeatureFlag.ReleaseStage.BETA, 'rollout_percentage': 100},
    {'key': 'sdk_cli', 'name': 'SDK / CLI', 'module': FeatureFlag.Module.DEVELOPER, 'description': 'SDK and CLI guidance surface for developers.', 'is_enabled': False, 'release_stage': FeatureFlag.ReleaseStage.INTERNAL, 'rollout_percentage': 0},
    {'key': 'test_lab', 'name': 'Test Lab', 'module': FeatureFlag.Module.DEVELOPER, 'description': 'End-to-end test flows for template, envelope, signer link, public signing, and evidence checks.', 'is_enabled': True, 'release_stage': FeatureFlag.ReleaseStage.BETA, 'rollout_percentage': 100},
    {'key': 'email_messages', 'name': 'Email Messages', 'module': FeatureFlag.Module.OPERATIONS, 'description': 'Queued email visibility, branded email content, delivery/retry testing, and signing URL inspection.', 'is_enabled': True, 'release_stage': FeatureFlag.ReleaseStage.BETA, 'rollout_percentage': 100},
    {'key': 'admin_users', 'name': 'Users', 'module': FeatureFlag.Module.ADMIN, 'description': 'Create/invite/resend/cancel users, memberships, sessions, recovery requests, and impersonation controls.', 'is_enabled': True, 'release_stage': FeatureFlag.ReleaseStage.BETA, 'rollout_percentage': 75},
    {'key': 'admin_organizations', 'name': 'Organizations', 'module': FeatureFlag.Module.ADMIN, 'description': 'Organization profile, domains, transfer/delete controls, exports, branding logo, and organization metadata.', 'is_enabled': True, 'release_stage': FeatureFlag.ReleaseStage.BETA, 'rollout_percentage': 75},
    {'key': 'admin_teams', 'name': 'Teams', 'module': FeatureFlag.Module.ADMIN, 'description': 'Team creation, membership management, and organization team views.', 'is_enabled': True, 'release_stage': FeatureFlag.ReleaseStage.BETA, 'rollout_percentage': 75},
    {'key': 'admin_roles', 'name': 'Roles & Permissions', 'module': FeatureFlag.Module.ADMIN, 'description': 'Role matrix creation/edit/delete and custom permission persistence.', 'is_enabled': True, 'release_stage': FeatureFlag.ReleaseStage.BETA, 'rollout_percentage': 75},
    {'key': 'background_tasks', 'name': 'Background Tasks', 'module': FeatureFlag.Module.OPERATIONS, 'description': 'Task runs, queues, retry/purge/cancel actions, Celery beat schedule visibility, and worker telemetry.', 'is_enabled': True, 'release_stage': FeatureFlag.ReleaseStage.BETA, 'rollout_percentage': 75},
    {'key': 'system_health', 'name': 'System Health', 'module': FeatureFlag.Module.OPERATIONS, 'description': 'Health checks, service metrics, incidents, resource utilization, database/Redis/storage/task summaries, and alerts.', 'is_enabled': True, 'release_stage': FeatureFlag.ReleaseStage.BETA, 'rollout_percentage': 75},
    {'key': 'settings_general', 'name': 'General Settings', 'module': FeatureFlag.Module.ADMIN, 'description': 'Application name, locale/timezone/date/time, envelope defaults, signing order, reminder defaults, and general switches.', 'is_enabled': True, 'release_stage': FeatureFlag.ReleaseStage.RELEASED, 'rollout_percentage': 100},
    {'key': 'settings_branding', 'name': 'Branding Settings', 'module': FeatureFlag.Module.ADMIN, 'description': 'Organization branding, colors, logo upload, and branding preview.', 'is_enabled': True, 'release_stage': FeatureFlag.ReleaseStage.BETA, 'rollout_percentage': 75},
    {'key': 'settings_email', 'name': 'Email / SMTP Settings', 'module': FeatureFlag.Module.ADMIN, 'description': 'SMTP configuration, test SMTP, rich email templates, bounce configuration, and message settings.', 'is_enabled': True, 'release_stage': FeatureFlag.ReleaseStage.BETA, 'rollout_percentage': 75},
    {'key': 'settings_storage', 'name': 'Storage Settings', 'module': FeatureFlag.Module.ADMIN, 'description': 'Storage backend settings, bucket/endpoint config, health verification, and retention settings.', 'is_enabled': True, 'release_stage': FeatureFlag.ReleaseStage.BETA, 'rollout_percentage': 75},
    {'key': 'settings_security', 'name': 'Security Settings', 'module': FeatureFlag.Module.ADMIN, 'description': 'MFA/passkey policy, session limits, password policy, IP allowlist, and security toggles.', 'is_enabled': True, 'release_stage': FeatureFlag.ReleaseStage.BETA, 'rollout_percentage': 75},
    {'key': 'settings_notifications', 'name': 'Notification Settings', 'module': FeatureFlag.Module.ADMIN, 'description': 'Notification channel preferences and digest frequency persistence.', 'is_enabled': True, 'release_stage': FeatureFlag.ReleaseStage.BETA, 'rollout_percentage': 75},
    {'key': 'identity_sso_scim', 'name': 'SSO / SCIM / LDAP', 'module': FeatureFlag.Module.INTEGRATIONS, 'description': 'OIDC/SAML/SCIM/LDAP/JIT/social provider setup, validation, testing, and provisioning controls.', 'is_enabled': False, 'release_stage': FeatureFlag.ReleaseStage.INTERNAL, 'rollout_percentage': 0},
    {'key': 'audit_evidence', 'name': 'Audit Evidence', 'module': FeatureFlag.Module.COMPLIANCE, 'description': 'Audit trail search/filter/export, evidence bundle creation, verification, signed PDF generation, and visual QA.', 'is_enabled': True, 'release_stage': FeatureFlag.ReleaseStage.BETA, 'rollout_percentage': 75},
    {'key': 'legal_holds', 'name': 'Legal Holds', 'module': FeatureFlag.Module.COMPLIANCE, 'description': 'Legal hold creation, custodians/items, release controls, and hold status review.', 'is_enabled': False, 'release_stage': FeatureFlag.ReleaseStage.INTERNAL, 'rollout_percentage': 0},
    {'key': 'retention_policies', 'name': 'Retention Policies', 'module': FeatureFlag.Module.COMPLIANCE, 'description': 'Retention policy management and retention action planning.', 'is_enabled': False, 'release_stage': FeatureFlag.ReleaseStage.INTERNAL, 'rollout_percentage': 0},
    {'key': 'data_residency', 'name': 'Data Residency', 'module': FeatureFlag.Module.COMPLIANCE, 'description': 'Region catalog, organization data residency policy, and backend enforcement controls.', 'is_enabled': False, 'release_stage': FeatureFlag.ReleaseStage.INTERNAL, 'rollout_percentage': 0},
    {'key': 'compliance_exports', 'name': 'Compliance Exports', 'module': FeatureFlag.Module.COMPLIANCE, 'description': 'Compliance export queue, export types, date ranges, file links, and request tracking.', 'is_enabled': False, 'release_stage': FeatureFlag.ReleaseStage.INTERNAL, 'rollout_percentage': 0},
    {'key': 'billing_usage', 'name': 'Usage & Billing', 'module': FeatureFlag.Module.BILLING, 'description': 'Plans, subscriptions, usage metrics, invoices, payment methods, checkout, and payment portal handoff.', 'is_enabled': False, 'release_stage': FeatureFlag.ReleaseStage.INTERNAL, 'rollout_percentage': 0},
    {'key': 'license_management', 'name': 'License', 'module': FeatureFlag.Module.BILLING, 'description': 'License key details, activation, edition metadata, and licensed feature list.', 'is_enabled': False, 'release_stage': FeatureFlag.ReleaseStage.INTERNAL, 'rollout_percentage': 0},
    {'key': 'roadmap', 'name': 'Roadmap', 'module': FeatureFlag.Module.CORE, 'description': 'Product roadmap and planned feature communication page.', 'is_enabled': False, 'release_stage': FeatureFlag.ReleaseStage.INTERNAL, 'rollout_percentage': 0},
    {'key': 'operations_console', 'name': 'Operations Console', 'module': FeatureFlag.Module.OPERATIONS, 'description': 'Risk findings, policy rules, API logs, event outbox, OAuth grants, object permissions, feature flags, and search indexing.', 'is_enabled': True, 'release_stage': FeatureFlag.ReleaseStage.BETA, 'rollout_percentage': 75},
    {'key': 'release_control', 'name': 'Release Control', 'module': FeatureFlag.Module.OPERATIONS, 'description': 'Feature release gates, default seeding, QA checklist, stage/rollout controls, summary metrics, and admin audit logging.', 'is_enabled': True, 'release_stage': FeatureFlag.ReleaseStage.BETA, 'rollout_percentage': 100},
]


class AppSettingViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    queryset = AppSetting.objects.select_related('organization').all().order_by('namespace', 'key')
    serializer_class = AppSettingSerializer
    permission_classes = [OrganizationRolePermission]
    write_roles = OrganizationRolePermission.write_roles

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        organization = serializer.validated_data.get('organization')
        namespace = serializer.validated_data['namespace']
        key = serializer.validated_data['key']
        setting = AppSetting.objects.filter(
            organization=organization,
            namespace=namespace,
            key=key,
        ).first()
        if setting:
            setting.value = serializer.validated_data.get('value', setting.value)
            setting.is_secret = serializer.validated_data.get('is_secret', setting.is_secret)
            setting.save(update_fields=['value', 'is_secret', 'updated_at'])
            return response.Response(self.get_serializer(setting).data)
        self.perform_create(serializer)
        return response.Response(serializer.data, status=201)


class FeatureFlagViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    queryset = FeatureFlag.objects.select_related('organization').all().order_by('module', 'key')
    serializer_class = FeatureFlagSerializer
    permission_classes = [OrganizationRolePermission]
    pagination_class = None
    write_roles = OrganizationRolePermission.write_roles

    def perform_create(self, serializer):
        self._assert_related_organization_access(serializer)
        flag = serializer.save()
        self._log_change(flag, 'admin.feature_created', 'Feature release control created.')

    def perform_update(self, serializer):
        self._assert_related_organization_access(serializer)
        flag = serializer.save()
        self._log_change(flag, 'admin.feature_updated', 'Feature release control updated.')

    @decorators.action(detail=False, methods=['post'], url_path='seed-defaults')
    def seed_defaults(self, request):
        organization_id = request.data.get('organization')
        if organization_id and not user_has_org_role(request.user, int(organization_id), [Membership.Role.ADMIN, Membership.Role.MANAGER]):
            return response.Response({'detail': 'You do not have access to that organization.'}, status=403)
        created = 0
        updated = 0
        for item in DEFAULT_RELEASE_MODULES:
            defaults = {
                **item,
                'owner': item.get('owner', 'Product'),
                'qa_checklist': [
                    {'label': 'Backend endpoint verified', 'done': False},
                    {'label': 'Frontend flow verified', 'done': False},
                    {'label': 'Permissions and audit behavior checked', 'done': False},
                    {'label': 'Release notes reviewed', 'done': False},
                ],
                'config': {'source': 'release-control-defaults'},
            }
            flag, was_created = FeatureFlag.objects.get_or_create(
                organization_id=organization_id,
                key=item['key'],
                defaults=defaults,
            )
            if not was_created:
                changed_fields = []
                for field in ['name', 'module', 'description']:
                    if getattr(flag, field) != defaults[field]:
                        setattr(flag, field, defaults[field])
                        changed_fields.append(field)
                if not flag.owner:
                    flag.owner = defaults['owner']
                    changed_fields.append('owner')
                if not flag.qa_checklist:
                    flag.qa_checklist = defaults['qa_checklist']
                    changed_fields.append('qa_checklist')
                if changed_fields:
                    changed_fields.append('updated_at')
                    flag.save(update_fields=changed_fields)
            created += 1 if was_created else 0
            updated += 0 if was_created else 1
            self._log_change(flag, 'admin.feature_seeded', 'Feature release control seeded from defaults.')
        return response.Response({'created': created, 'updated': updated, 'total': created + updated})

    @decorators.action(detail=True, methods=['post'])
    def review(self, request, pk=None):
        flag = self.get_object()
        checklist = request.data.get('qa_checklist')
        if checklist is not None:
            flag.qa_checklist = checklist
        flag.last_reviewed_at = timezone.now()
        flag.release_notes = request.data.get('release_notes', flag.release_notes)
        flag.save(update_fields=['qa_checklist', 'last_reviewed_at', 'release_notes', 'updated_at'])
        self._log_change(flag, 'admin.feature_reviewed', 'Feature release checklist reviewed.')
        return response.Response(self.get_serializer(flag).data)

    @decorators.action(detail=True, methods=['post'])
    def release(self, request, pk=None):
        flag = self.get_object()
        flag.is_enabled = True
        flag.release_stage = request.data.get('release_stage') or FeatureFlag.ReleaseStage.RELEASED
        flag.rollout_percentage = min(int(request.data.get('rollout_percentage', 100)), 100)
        if flag.release_stage == FeatureFlag.ReleaseStage.RELEASED:
            flag.released_at = timezone.now()
        flag.save(update_fields=['is_enabled', 'release_stage', 'rollout_percentage', 'released_at', 'updated_at'])
        self._log_change(flag, 'admin.feature_released', 'Feature released from control panel.')
        return response.Response(self.get_serializer(flag).data)

    @decorators.action(detail=False, methods=['get'])
    def summary(self, request):
        queryset = self.filter_queryset(self.get_queryset())
        rows = list(queryset)
        modules = {}
        for flag in rows:
            module = modules.setdefault(flag.module, {'module': flag.module, 'total': 0, 'enabled': 0, 'released': 0, 'internal': 0, 'paused': 0, 'average_rollout': 0})
            module['total'] += 1
            module['enabled'] += 1 if flag.is_enabled else 0
            module['released'] += 1 if flag.release_stage == FeatureFlag.ReleaseStage.RELEASED else 0
            module['internal'] += 1 if flag.release_stage in [FeatureFlag.ReleaseStage.PLANNED, FeatureFlag.ReleaseStage.INTERNAL] else 0
            module['paused'] += 1 if flag.release_stage == FeatureFlag.ReleaseStage.PAUSED else 0
            module['average_rollout'] += flag.rollout_percentage
        for module in modules.values():
            module['average_rollout'] = round(module['average_rollout'] / module['total']) if module['total'] else 0
        return response.Response({'total': len(rows), 'modules': sorted(modules.values(), key=lambda item: item['module'])})

    def _log_change(self, flag, event_type, message):
        if not flag.organization_id:
            return
        log_admin_event(
            organization=flag.organization,
            actor=self.request.user,
            event_type=event_type,
            message=f'{message} {flag.name or flag.key}',
            request=self.request,
            metadata={'feature_flag': flag.id, 'key': flag.key, 'module': flag.module, 'release_stage': flag.release_stage, 'rollout_percentage': flag.rollout_percentage},
        )


class SingletonSettingsViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    permission_classes = [OrganizationRolePermission]
    write_roles = OrganizationRolePermission.write_roles

    def create(self, request, *args, **kwargs):
        organization_id = request.data.get('organization')
        instance = self.get_queryset().filter(organization_id=organization_id).first()
        if instance:
            serializer = self.get_serializer(instance, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return response.Response(serializer.data)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return response.Response(serializer.data, status=201)


class GeneralSettingsViewSet(SingletonSettingsViewSet):
    feature_flag_key = 'settings_general'
    queryset = GeneralSettings.objects.select_related('organization').all()
    serializer_class = GeneralSettingsSerializer


class EmailSettingsViewSet(SingletonSettingsViewSet):
    feature_flag_key = 'settings_email'
    queryset = EmailSettings.objects.select_related('organization').all()
    serializer_class = EmailSettingsSerializer


class StorageSettingsViewSet(SingletonSettingsViewSet):
    feature_flag_key = 'settings_storage'
    queryset = StorageSettings.objects.select_related('organization').all()
    serializer_class = StorageSettingsSerializer


class SecuritySettingsViewSet(SingletonSettingsViewSet):
    feature_flag_key = 'settings_security'
    queryset = SecuritySettings.objects.select_related('organization').all()
    serializer_class = SecuritySettingsSerializer


class HealthCheckViewSet(viewsets.ModelViewSet):
    feature_flag_key = 'system_health'
    queryset = HealthCheck.objects.all().order_by('name')
    serializer_class = HealthCheckSerializer

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if getattr(self, 'action', '') in ['live', 'ready', 'public_status']:
            return
        if not feature_flag_allows_request(request, self):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('The "system_health" feature is not released for this organization.')

    def get_permissions(self):
        if self.action in ['live', 'ready', 'public_status']:
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    @decorators.action(detail=False, methods=['get'])
    def live(self, request):
        return response.Response({'ok': True})

    @decorators.action(detail=False, methods=['get'])
    def ready(self, request):
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
            cursor.fetchone()
        return response.Response({'ok': True, 'database': 'ok'})

    @decorators.action(detail=False, methods=['post'])
    def run_checks(self, request):
        previous_status = self._overall_status()
        checks = [
            ('api', 'healthy', 'API process is responding.', {}),
            ('database', 'healthy', 'Database SELECT 1 succeeded.', self._database_metadata()),
            ('task_queue', self._task_status(), 'Background task queue checked.', self._task_metadata()),
            ('email', self._email_status(), 'Email delivery queue checked.', self._email_metadata()),
            ('storage', 'healthy', 'Local media storage checked.', self._storage_metadata()),
            ('worker', self._task_status(), 'Worker task state checked.', self._worker_metadata()),
        ]
        results = []
        for name, check_status, message, metadata in checks:
            check, _ = HealthCheck.objects.update_or_create(
                name=name,
                defaults={'status': check_status, 'message': message, 'metadata': self._json_safe(metadata)},
            )
            results.append(HealthCheckSerializer(check).data)
        current_status = 'healthy' if all(item['status'] == 'healthy' for item in results) else 'degraded'
        queued_alerts = self._queue_status_alerts(previous_status, current_status, request.user)
        return response.Response({'ok': current_status == 'healthy', 'status': current_status, 'queued_alerts': queued_alerts, 'results': results})

    @decorators.action(detail=False, methods=['get'])
    def summary(self, request):
        checks = list(HealthCheck.objects.all().order_by('name'))
        metrics = {
            **self._host_metrics(),
            **self._database_runtime_metrics(),
            **self._redis_metrics(),
            **self._minio_metrics(),
            **self._celery_worker_metrics(),
            'task_queue_depth': TaskRun.objects.filter(status=TaskRun.Status.QUEUED).count(),
            'running_tasks': TaskRun.objects.filter(status=TaskRun.Status.RUNNING).count(),
            'failed_tasks': TaskRun.objects.filter(status=TaskRun.Status.FAILED).count(),
            'queued_emails': EmailMessage.objects.filter(status=EmailMessage.Status.QUEUED).count(),
            'failed_emails': EmailMessage.objects.filter(status=EmailMessage.Status.FAILED).count(),
        }
        return response.Response({
            'overall_status': self._overall_status(checks),
            'checked_at': timezone.now(),
            'checks': HealthCheckSerializer(checks, many=True).data,
            'metrics': metrics,
            'threshold_breaches': self._threshold_breaches(metrics),
            'apm': self._apm_config(),
        })

    @decorators.action(detail=False, methods=['get', 'patch'], url_path='apm-config')
    def apm_config(self, request):
        setting, _ = AppSetting.objects.get_or_create(
            organization=None,
            namespace='observability',
            key='apm',
            defaults={'value': {
                'provider': os.environ.get('HANMAK_APM_PROVIDER', 'none'),
                'environment': os.environ.get('HANMAK_ENVIRONMENT', 'development'),
                'release': os.environ.get('HANMAK_RELEASE', ''),
                'sample_rate': float(os.environ.get('HANMAK_APM_SAMPLE_RATE', '0.1')),
                'external_alerts_enabled': False,
            }},
        )
        if request.method == 'PATCH':
            setting.value = {**setting.value, **request.data}
            setting.save(update_fields=['value', 'updated_at'])
        return response.Response({
            **AppSettingSerializer(setting).data,
            'runtime': self._apm_config(),
        })

    @decorators.action(detail=False, methods=['get'], url_path='deployment-readiness')
    def deployment_readiness(self, request):
        checks = self._deployment_readiness_checks()
        passed = sum(1 for item in checks if item['status'] == 'pass')
        warnings = sum(1 for item in checks if item['status'] == 'warning')
        failed = sum(1 for item in checks if item['status'] == 'fail')
        return response.Response({
            'status': 'pass' if failed == 0 else 'fail',
            'passed': passed,
            'warnings': warnings,
            'failed': failed,
            'checks': checks,
            'runbook': self._deployment_runbook(),
        })

    @decorators.action(detail=False, methods=['get'], url_path='deployment-runbook')
    def deployment_runbook(self, request):
        return response.Response(self._deployment_runbook())

    @decorators.action(detail=False, methods=['get'])
    def public_status(self, request):
        data = self.summary(request).data
        return response.Response({
            'status': data['overall_status'],
            'checked_at': data['checked_at'],
            'services': [
                {'name': item['name'], 'status': item['status'], 'message': item['message']}
                for item in data['checks']
            ],
        })

    @decorators.action(detail=False, methods=['get', 'patch'])
    def alert_thresholds(self, request):
        setting, _ = AppSetting.objects.get_or_create(
            organization=None,
            namespace='observability',
            key='alert_thresholds',
            defaults={'value': {
                'api_error_rate': 1,
                'response_time_ms': 2000,
                'cpu_percent': 85,
                'memory_percent': 90,
                'disk_percent': 80,
                'queue_depth': 1000,
            }},
        )
        if request.method == 'PATCH':
            setting.value = {**setting.value, **request.data}
            setting.save(update_fields=['value', 'updated_at'])
        return response.Response(AppSettingSerializer(setting).data)

    @decorators.action(detail=False, methods=['get', 'post'])
    def alert_subscriptions(self, request):
        setting, _ = AppSetting.objects.get_or_create(
            organization=None,
            namespace='observability',
            key='alert_subscriptions',
            defaults={'value': {'subscriptions': []}},
        )
        if request.method == 'POST':
            email = (request.data.get('email') or request.user.email or '').strip().lower()
            if not email:
                return response.Response({'detail': 'email is required'}, status=400)
            channels = request.data.get('channels') or ['email']
            events = request.data.get('events') or ['degraded', 'recovered']
            subscriptions = [
                item for item in setting.value.get('subscriptions', [])
                if item.get('email', '').lower() != email
            ]
            subscriptions.append({
                'email': email,
                'channels': channels,
                'events': events,
                'created_by': request.user.id,
                'created_at': timezone.now().isoformat(),
            })
            setting.value = {'subscriptions': subscriptions}
            setting.save(update_fields=['value', 'updated_at'])
        return response.Response(AppSettingSerializer(setting).data)

    @decorators.action(detail=False, methods=['post'])
    def publish_status(self, request):
        setting, _ = AppSetting.objects.update_or_create(
            organization=None,
            namespace='observability',
            key='public_status',
            defaults={'value': {'published_at': timezone.now().isoformat(), 'status': self.summary(request).data['overall_status']}},
        )
        return response.Response({'ok': True, 'status_page': setting.value})

    def _overall_status(self, checks=None):
        checks = checks if checks is not None else list(HealthCheck.objects.all())
        unhealthy = [item for item in checks if item.status not in ['healthy', 'ok', 'ready']]
        return 'degraded' if unhealthy else 'healthy'

    def _queue_status_alerts(self, previous_status, current_status, actor):
        if previous_status == current_status:
            return 0
        setting = AppSetting.objects.filter(organization=None, namespace='observability', key='alert_subscriptions').first()
        subscriptions = setting.value.get('subscriptions', []) if setting and isinstance(setting.value, dict) else []
        event = 'recovered' if current_status == 'healthy' else 'degraded'
        queued = 0
        from messaging.tasks import deliver_email_message_task
        for subscription in subscriptions:
            if event not in subscription.get('events', []):
                continue
            email = subscription.get('email')
            if not email:
                continue
            message = EmailMessage.objects.create(
                organization=None,
                kind=EmailMessage.Kind.INVITATION,
                to_email=email,
                subject=f'HanMak system status {current_status}',
                body=f'HanMak system status changed from {previous_status} to {current_status}.',
                html_body=f'<!doctype html><html><body><h1>HanMak system status {current_status}</h1><p>Status changed from {previous_status} to {current_status}.</p></body></html>',
                queued_by=actor if getattr(actor, 'is_authenticated', False) else None,
            )
            deliver_email_message_task.apply_async(args=[message.id], queue='email')
            queued += 1
        return queued

    def _database_metadata(self):
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
            cursor.fetchone()
        return {'vendor': connection.vendor, **self._database_runtime_metrics()}

    def _database_runtime_metrics(self):
        metrics = {
            'db_vendor': connection.vendor,
            'db_queries_observed': len(getattr(connection, 'queries', [])),
        }
        try:
            with connection.cursor() as cursor:
                if connection.vendor == 'sqlite':
                    cursor.execute('PRAGMA page_count')
                    page_count = cursor.fetchone()[0]
                    cursor.execute('PRAGMA page_size')
                    page_size = cursor.fetchone()[0]
                    metrics.update({
                        'db_size_bytes': page_count * page_size,
                        'db_page_count': page_count,
                    })
                elif connection.vendor == 'postgresql':
                    cursor.execute('SELECT version()')
                    metrics['db_version'] = cursor.fetchone()[0]
                    cursor.execute("SELECT sum(numbackends) FROM pg_stat_database")
                    metrics['db_active_connections'] = cursor.fetchone()[0] or 0
                    cursor.execute("SELECT coalesce(sum(xact_commit + xact_rollback), 0) FROM pg_stat_database")
                    metrics['db_transactions_observed'] = cursor.fetchone()[0] or 0
        except Exception as exc:
            metrics['db_metrics_error'] = str(exc)
        return metrics

    def _redis_metrics(self):
        location = getattr(settings, 'CELERY_BROKER_URL', '') or ''
        metrics = {'redis_configured': location.startswith('redis://')}
        if not metrics['redis_configured']:
            return metrics
        try:
            import redis
            client = redis.Redis.from_url(location, socket_connect_timeout=1, socket_timeout=1)
            info = client.info()
            metrics.update({
                'redis_ping': bool(client.ping()),
                'redis_used_memory': info.get('used_memory'),
                'redis_connected_clients': info.get('connected_clients'),
            })
        except Exception as exc:
            metrics.update({'redis_ping': False, 'redis_error': str(exc)})
        return metrics

    def _task_status(self):
        return 'degraded' if TaskRun.objects.filter(status=TaskRun.Status.FAILED).exists() else 'healthy'

    def _task_metadata(self):
        return {
            'queued': TaskRun.objects.filter(status=TaskRun.Status.QUEUED).count(),
            'running': TaskRun.objects.filter(status=TaskRun.Status.RUNNING).count(),
            'failed': TaskRun.objects.filter(status=TaskRun.Status.FAILED).count(),
        }

    def _email_status(self):
        return 'degraded' if EmailMessage.objects.filter(status=EmailMessage.Status.FAILED).exists() else 'healthy'

    def _email_metadata(self):
        return {
            'queued': EmailMessage.objects.filter(status=EmailMessage.Status.QUEUED).count(),
            'failed': EmailMessage.objects.filter(status=EmailMessage.Status.FAILED).count(),
        }

    def _storage_metadata(self):
        usage = shutil.disk_usage(getattr(settings, 'MEDIA_ROOT', '/tmp'))
        return {
            'total_bytes': usage.total,
            'used_bytes': usage.used,
            'free_bytes': usage.free,
            'used_percent': round((usage.used / usage.total) * 100, 2) if usage.total else 0,
            'media_root': str(getattr(settings, 'MEDIA_ROOT', '')),
            'object_storage_configured': bool(os.environ.get('AWS_ACCESS_KEY_ID') or os.environ.get('MINIO_ROOT_USER')),
            'object_storage_endpoint': os.environ.get('AWS_S3_ENDPOINT_URL', ''),
        }

    def _minio_metrics(self):
        endpoint = os.environ.get('AWS_S3_ENDPOINT_URL') or os.environ.get('MINIO_ENDPOINT') or ''
        configured = bool(endpoint or os.environ.get('MINIO_ROOT_USER'))
        metrics = {
            'minio_configured': configured,
            'minio_endpoint': endpoint,
            'minio_reachable': None,
        }
        if not endpoint:
            return metrics
        try:
            started = time.monotonic()
            with urlrequest.urlopen(endpoint.rstrip('/') + '/minio/health/live', timeout=1) as result:
                metrics['minio_reachable'] = 200 <= result.status < 500
            metrics['minio_latency_ms'] = round((time.monotonic() - started) * 1000, 2)
        except Exception as exc:
            metrics.update({'minio_reachable': False, 'minio_error': str(exc)})
        return metrics

    def _worker_metadata(self):
        worker_metrics = self._celery_worker_metrics()
        return {
            'known_running_tasks': TaskRun.objects.filter(status=TaskRun.Status.RUNNING).count(),
            'known_queued_tasks': TaskRun.objects.filter(status=TaskRun.Status.QUEUED).count(),
            **worker_metrics,
            'heartbeat_source': 'celery inspect' if worker_metrics.get('celery_worker_count') is not None else 'task-run table',
        }

    def _celery_worker_metrics(self):
        try:
            from hanmak.celery import app as celery_app
            inspect = celery_app.control.inspect(timeout=1)
            stats = inspect.stats() or {}
            active = inspect.active() or {}
            reserved = inspect.reserved() or {}
            scheduled = inspect.scheduled() or {}
            worker_details = []
            for name in sorted(stats.keys()):
                pool = stats.get(name, {}).get('pool') or {}
                rusage = stats.get(name, {}).get('rusage') or {}
                worker_details.append({
                    'name': name,
                    'active_tasks': len(active.get(name, [])),
                    'reserved_tasks': len(reserved.get(name, [])),
                    'scheduled_tasks': len(scheduled.get(name, [])),
                    'pool_processes': len(pool.get('processes') or []),
                    'max_concurrency': pool.get('max-concurrency') or pool.get('max_concurrency'),
                    'uptime_seconds': stats.get(name, {}).get('clock'),
                    'pid': stats.get(name, {}).get('pid'),
                    'rss_kb': rusage.get('maxrss'),
                    'utime_seconds': rusage.get('utime'),
                    'stime_seconds': rusage.get('stime'),
                })
            return {
                'celery_worker_count': len(stats),
                'celery_active_tasks': sum(len(items) for items in active.values()),
                'celery_reserved_tasks': sum(len(items) for items in reserved.values()),
                'celery_scheduled_tasks': sum(len(items) for items in scheduled.values()),
                'celery_workers': sorted(stats.keys()),
                'celery_worker_details': worker_details,
            }
        except Exception as exc:
            return {'celery_worker_count': None, 'celery_active_tasks': None, 'celery_worker_details': [], 'celery_error': str(exc)}

    def _host_metrics(self):
        metrics = {'observed_at': timezone.now().isoformat()}
        try:
            load = os.getloadavg()
            metrics['load_1m'] = load[0]
            cpu_count = os.cpu_count() or 1
            metrics['cpu_count'] = cpu_count
            metrics['cpu_load_percent'] = round(min(100, (load[0] / cpu_count) * 100), 2)
        except (AttributeError, OSError):
            metrics['load_1m'] = None
            metrics['cpu_count'] = os.cpu_count()
            metrics['cpu_load_percent'] = None
        metrics.update(self._process_cpu_metrics())
        metrics.update(self._memory_metrics())
        metrics.update(self._storage_metadata())
        metrics['process_uptime_seconds'] = int(time.monotonic())
        return metrics

    def _process_cpu_metrics(self):
        try:
            with open('/proc/self/stat', encoding='utf-8') as stat_file:
                fields = stat_file.read().split()
            ticks = os.sysconf(os.sysconf_names['SC_CLK_TCK'])
            user_seconds = int(fields[13]) / ticks
            system_seconds = int(fields[14]) / ticks
            return {
                'process_cpu_user_seconds': round(user_seconds, 2),
                'process_cpu_system_seconds': round(system_seconds, 2),
            }
        except (OSError, ValueError, KeyError, IndexError):
            return {'process_cpu_user_seconds': None, 'process_cpu_system_seconds': None}

    def _memory_metrics(self):
        try:
            values = {}
            with open('/proc/meminfo', encoding='utf-8') as meminfo:
                for line in meminfo:
                    key, raw_value = line.split(':', 1)
                    values[key] = int(raw_value.strip().split()[0]) * 1024
            total = values.get('MemTotal', 0)
            available = values.get('MemAvailable', 0)
            used = total - available if total and available else 0
            return {
                'memory_total_bytes': total,
                'memory_available_bytes': available,
                'memory_used_bytes': used,
                'memory_used_percent': round((used / total) * 100, 2) if total else None,
            }
        except (OSError, ValueError, KeyError):
            return {
                'memory_total_bytes': None,
                'memory_available_bytes': None,
                'memory_used_bytes': None,
                'memory_used_percent': None,
            }

    def _threshold_breaches(self, metrics):
        setting = AppSetting.objects.filter(organization=None, namespace='observability', key='alert_thresholds').first()
        thresholds = setting.value if setting and isinstance(setting.value, dict) else {}
        checks = [
            ('memory_percent', metrics.get('memory_used_percent'), thresholds.get('memory_percent')),
            ('disk_percent', metrics.get('used_percent'), thresholds.get('disk_percent')),
            ('cpu_percent', metrics.get('cpu_load_percent'), thresholds.get('cpu_percent')),
            ('queue_depth', metrics.get('task_queue_depth'), thresholds.get('queue_depth')),
        ]
        return [
            {'metric': metric, 'value': value, 'threshold': threshold}
            for metric, value, threshold in checks
            if value is not None and threshold is not None and float(value) > float(threshold)
        ]

    def _apm_config(self):
        return {
            'provider': os.environ.get('HANMAK_APM_PROVIDER', 'none'),
            'environment': os.environ.get('HANMAK_ENVIRONMENT', 'development'),
            'release': os.environ.get('HANMAK_RELEASE', ''),
            'sentry_configured': bool(os.environ.get('SENTRY_DSN')),
            'otel_exporter_configured': bool(os.environ.get('OTEL_EXPORTER_OTLP_ENDPOINT')),
            'trace_sample_rate': float(os.environ.get('HANMAK_APM_SAMPLE_RATE', '0.1')),
            'runtime_status': getattr(settings, 'HANMAK_OBSERVABILITY_STATUS', {'configured': False}),
            'host_metrics_enabled': True,
            'celery_inspect_enabled': True,
            'external_alerts_configured': bool(os.environ.get('HANMAK_ALERT_WEBHOOK_URL')),
        }

    def _deployment_readiness_checks(self):
        secret_key = getattr(settings, 'SECRET_KEY', '')
        allowed_hosts = getattr(settings, 'ALLOWED_HOSTS', [])
        cors_all = getattr(settings, 'CORS_ALLOW_ALL_ORIGINS', False)
        database_engine = connection.settings_dict.get('ENGINE', '')
        backup_policy = os.environ.get('HANMAK_BACKUP_POLICY', '') or os.environ.get('HANMAK_DATABASE_BACKUP_POLICY', '')
        restore_drill_at = os.environ.get('HANMAK_LAST_RESTORE_DRILL_AT', '')
        secrets_manager = os.environ.get('HANMAK_SECRETS_MANAGER', '')
        checks = [
            self._readiness_item('debug_disabled', not settings.DEBUG, 'DEBUG is disabled in production.'),
            self._readiness_item('strong_secret_key', bool(secret_key and not secret_key.startswith('django-insecure')), 'DJANGO_SECRET_KEY is set to a non-development value.'),
            self._readiness_item('allowed_hosts_configured', bool(allowed_hosts and '*' not in allowed_hosts), 'DJANGO_ALLOWED_HOSTS is restricted to expected domains.'),
            self._readiness_item('cors_restricted', not cors_all, 'CORS_ALLOW_ALL_ORIGINS is disabled.'),
            self._readiness_item('database_not_sqlite', 'sqlite' not in database_engine, 'Production database is not SQLite.'),
            self._readiness_item('secure_ssl_redirect', getattr(settings, 'SECURE_SSL_REDIRECT', False), 'SECURE_SSL_REDIRECT is enabled behind TLS.'),
            self._readiness_item('secure_cookies', getattr(settings, 'SESSION_COOKIE_SECURE', False) and getattr(settings, 'CSRF_COOKIE_SECURE', False), 'Session and CSRF cookies require HTTPS.'),
            self._readiness_item('hsts_configured', getattr(settings, 'SECURE_HSTS_SECONDS', 0) >= 3600, 'HSTS is configured.'),
            self._readiness_item('static_root_configured', bool(getattr(settings, 'STATIC_ROOT', None)), 'STATIC_ROOT is configured for collectstatic.'),
            self._readiness_item('media_policy_configured', bool(os.environ.get('AWS_STORAGE_BUCKET_NAME') or os.environ.get('HANMAK_MEDIA_BACKUP_POLICY')), 'Media storage or backup policy is configured.'),
            self._readiness_item('database_backup_policy', bool(backup_policy), 'Database backup policy is configured.'),
            self._readiness_item('restore_drill_recorded', bool(restore_drill_at), 'Last restore drill timestamp is recorded.'),
            self._readiness_item('secrets_manager_configured', bool(secrets_manager), 'Secrets manager or secret delivery system is configured.'),
            self._readiness_item('tls_domain_configured', bool(os.environ.get('HANMAK_PRIMARY_DOMAIN') and getattr(settings, 'SECURE_SSL_REDIRECT', False)), 'Primary domain and TLS redirect are configured.'),
            self._readiness_item('apm_configured', self._apm_config()['sentry_configured'] or self._apm_config()['otel_exporter_configured'], 'Sentry or OTEL exporter is configured.'),
            self._readiness_item('external_alerts_configured', self._apm_config()['external_alerts_configured'], 'External alert webhook is configured.'),
            self._readiness_item('payment_webhook_secret', bool(os.environ.get('STRIPE_WEBHOOK_SECRET') or os.environ.get('ADYEN_WEBHOOK_HMAC_KEY') or os.environ.get('HANMAK_PAYMENT_WEBHOOK_SECRET')), 'Payment webhook signature secret is configured.'),
        ]
        return checks

    def _readiness_item(self, key, passed, message):
        return {
            'key': key,
            'status': 'pass' if passed else 'fail',
            'message': message,
        }

    def _json_safe(self, value):
        if isinstance(value, Decimal):
            return float(value)
        if isinstance(value, dict):
            return {key: self._json_safe(item) for key, item in value.items()}
        if isinstance(value, (list, tuple)):
            return [self._json_safe(item) for item in value]
        return value

    def _deployment_runbook(self):
        return {
            'tls': [
                'Set HANMAK_PRIMARY_DOMAIN, DJANGO_ALLOWED_HOSTS, USE_X_FORWARDED_PROTO=true, SECURE_SSL_REDIRECT=true.',
                'Terminate TLS at the load balancer or reverse proxy and forward X-Forwarded-Proto.',
                'Enable SESSION_COOKIE_SECURE, CSRF_COOKIE_SECURE, HSTS, and preload only after domain validation.',
            ],
            'backups': [
                'Schedule encrypted database backups with point-in-time recovery where supported.',
                'Back up media/object storage separately from database snapshots.',
                'Set HANMAK_BACKUP_POLICY and HANMAK_MEDIA_BACKUP_POLICY to document the active policy.',
            ],
            'restore_drill': [
                'Restore the latest backup into an isolated environment.',
                'Run migrations, seed a smoke admin if needed, and verify login, templates, envelopes, files, and signed PDFs.',
                'Record the successful drill timestamp in HANMAK_LAST_RESTORE_DRILL_AT.',
            ],
            'secrets': [
                'Store DJANGO_SECRET_KEY, database credentials, SMTP credentials, payment webhook secrets, SSO certificates, and object-storage keys in a secrets manager.',
                'Set HANMAK_SECRETS_MANAGER to the active provider name.',
                'Rotate secrets on a schedule and after staff/offboarding events.',
            ],
            'static_media': [
                'Run collectstatic during build/release.',
                'Serve static assets from Nginx/CDN with immutable cache headers.',
                'Keep uploaded media private unless a signed URL or authenticated download endpoint is intended.',
            ],
            'observability': [
                'Configure SENTRY_DSN or OTEL_EXPORTER_OTLP_ENDPOINT and HANMAK_APM_PROVIDER.',
                'Set HANMAK_ALERT_WEBHOOK_URL and add alert email subscriptions in System Health.',
                'Run /api/v1/health-checks/run_checks/ after deploy and publish the status snapshot.',
            ],
        }


class IncidentViewSet(viewsets.ModelViewSet):
    feature_flag_key = 'system_health'
    queryset = Incident.objects.all().order_by('-started_at')
    serializer_class = IncidentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if not feature_flag_allows_request(request, self):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('The "system_health" feature is not released for this organization.')

    @decorators.action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        incident = self.get_object()
        incident.status = Incident.Status.RESOLVED
        incident.resolved_at = timezone.now()
        incident.save(update_fields=['status', 'resolved_at', 'updated_at'])
        return response.Response(self.get_serializer(incident).data)
