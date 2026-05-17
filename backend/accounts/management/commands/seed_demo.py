from datetime import date

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone

from accounts.models import Invitation, MFADevice, Membership, NotificationPreference, Organization, Role, Team, UserProfile, UserSession
from api_keys.models import APIKey
from approvals.models import ApprovalRequest
from auditlog.models import AuditEvent
from billing.models import LicenseKey, Plan, Subscription, UsageRecord
from compliance.models import ComplianceExport, DataResidencyRegion, LegalHold, OrganizationDataResidencyPolicy, RetentionPolicy
from configcenter.models import AppSetting, EmailSettings, FeatureFlag, GeneralSettings, HealthCheck, SecuritySettings, StorageSettings
from evidence.models import EvidenceBundle
from envelopes.models import Envelope, FormField, Recipient, Template, TemplateParty, TemplateVersion
from identity.models import SCIMConnection, SSOConnection
from messaging.services import queue_envelope_invites
from oauth_apps.models import OAuthApplication
from risk.models import PolicyRule, RiskFinding
from signing.models import ConsentRecord, SigningSession
from tasks.models import TaskDefinition, TaskRun, TaskRunEvent
from webhooks.models import EventOutbox, WebhookDelivery, WebhookEndpoint
from workflow.models import WorkflowDefinition, WorkflowEvent, WorkflowRun, WorkflowStage


class Command(BaseCommand):
    help = 'Create demo data for the HanMak mock-up backend.'

    def handle(self, *args, **options):
        User = get_user_model()
        admin, created = User.objects.get_or_create(
            username='admin',
            defaults={
                'email': 'admin@example.com',
                'first_name': 'Alex',
                'last_name': 'Kim',
                'is_staff': True,
                'is_superuser': True,
            },
        )
        if created:
            admin.set_password('admin123')
            admin.save()

        org, _ = Organization.objects.get_or_create(
            slug='acme',
            defaults={
                'name': 'Acme Corporation',
                'legal_name': 'Acme Corporation LLC',
                'website': 'https://acmecorp.com',
                'primary_contact_email': 'admin@acmecorp.com',
            },
        )
        operations, _ = Team.objects.get_or_create(
            organization=org,
            name='Operations',
            defaults={'description': 'Core operations and document processing'},
        )
        Membership.objects.get_or_create(
            user=admin,
            organization=org,
            defaults={'team': operations, 'role': Membership.Role.ADMIN},
        )
        Role.objects.get_or_create(
            organization=org,
            name='Administrator',
            defaults={'description': 'Full administrative access', 'is_system': True, 'permissions': ['*']},
        )
        UserProfile.objects.get_or_create(
            user=admin,
            defaults={
                'display_name': 'Alex Kim',
                'title': 'Operations Administrator',
                'timezone': 'America/Los_Angeles',
                'signature_name': 'Alex Kim',
            },
        )
        MFADevice.objects.get_or_create(
            user=admin,
            name='Demo authenticator app',
            defaults={'method': MFADevice.Method.TOTP, 'is_confirmed': True},
        )
        NotificationPreference.objects.get_or_create(
            user=admin,
            event_type='envelope.completed',
            defaults={'email_enabled': True, 'in_app_enabled': True},
        )
        UserSession.objects.get_or_create(
            user=admin,
            session_key='demo-session',
            defaults={'ip_address': '127.0.0.1', 'user_agent': 'HanMak demo seed', 'last_seen_at': timezone.now()},
        )
        Invitation.objects.get_or_create(
            organization=org,
            email='new.user@acmecorp.com',
            status=Invitation.Status.PENDING,
            defaults={'full_name': 'New User', 'role': Membership.Role.SIGNER, 'team': operations, 'invited_by': admin, 'sent_at': timezone.now()},
        )
        self.seed_secondary_organization(
            admin=admin,
            slug='beta',
            name='Beta Ventures',
            legal_name='Beta Ventures Ltd',
            website='https://betaventures.example',
            contact_email='ops@betaventures.example',
            template_name='Investor NDA',
            envelope_specs=[
                ('Investor NDA - Seed Round', Envelope.Status.COMPLETED, date(2026, 5, 20), [('Priya Shah', 'priya@betaventures.example', Recipient.Status.SIGNED)]),
                ('Advisor Agreement - Beta', Envelope.Status.SENT, date(2026, 5, 28), [('Owen Miller', 'owen@betaventures.example', Recipient.Status.PENDING)]),
            ],
        )
        self.seed_secondary_organization(
            admin=admin,
            slug='gamma',
            name='Gamma Holdings',
            legal_name='Gamma Holdings PLC',
            website='https://gammaholdings.example',
            contact_email='legal@gammaholdings.example',
            template_name='Board Resolution',
            envelope_specs=[
                ('Board Resolution - Q2', Envelope.Status.DRAFT, date(2026, 6, 3), [('Mina Okafor', 'mina@gammaholdings.example', Recipient.Status.PENDING)]),
            ],
        )

        template, _ = Template.objects.get_or_create(
            organization=org,
            name='Vendor Contract',
            defaults={
                'description': 'Standard vendor contract template',
                'category': 'Procurement',
                'status': Template.Status.ACTIVE,
                'created_by': admin,
            },
        )
        template_version, _ = TemplateVersion.objects.get_or_create(
            template=template,
            version_number=1,
            defaults={
                'field_schema': {'fields': ['vendor_signature']},
                'workflow_schema': {'steps': ['signer', 'approval', 'complete']},
                'changelog': 'Initial demo version',
                'is_published': True,
                'created_by': admin,
            },
        )
        party, _ = TemplateParty.objects.get_or_create(
            template_version=template_version,
            role_key='vendor_signer',
            defaults={'label': 'Vendor Signer', 'routing_order': 1},
        )

        envelope, _ = Envelope.objects.get_or_create(
            organization=org,
            name='Q4 Vendor Contract - Acme Corp',
            defaults={
                'template': template,
                'template_version': template_version,
                'status': Envelope.Status.PARTIALLY_SIGNED,
                'sender': admin,
                'message': 'Please review and sign at your earliest convenience.',
                'due_date': date(2026, 5, 5),
            },
        )
        envelope.template = template
        envelope.template_version = template_version
        envelope.save(update_fields=['template', 'template_version', 'updated_at'])

        recipients = [
            ('Sarah Chen', 'sarah@acmecorp.com', Recipient.Status.SIGNED),
            ('James Lee', 'james@acmecorp.com', Recipient.Status.PENDING),
        ]
        recipient_objects = []
        for order, (name, email, status) in enumerate(recipients, start=1):
            recipient, _ = Recipient.objects.get_or_create(
                envelope=envelope,
                email=email,
                defaults={
                    'name': name,
                    'role': Recipient.Role.SIGNER,
                    'status': status,
                    'routing_order': order,
                },
            )
            recipient_objects.append(recipient)

        form_field, _ = FormField.objects.get_or_create(
            envelope=envelope,
            label='Vendor signature',
            defaults={
                'template_version': template_version,
                'party': party,
                'field_key': 'vendor_signature',
                'field_type': FormField.FieldType.SIGNATURE,
                'required': True,
                'page': 1,
                'x': 80,
                'y': 640,
                'width': 220,
                'height': 64,
            },
        )
        form_field.template_version = template_version
        form_field.party = party
        form_field.field_key = 'vendor_signature'
        form_field.save(update_fields=['template_version', 'party', 'field_key'])
        if recipient_objects:
            session, _ = SigningSession.objects.get_or_create(
                envelope=envelope,
                recipient=recipient_objects[-1],
            )
            ConsentRecord.objects.get_or_create(
                envelope=envelope,
                recipient=recipient_objects[0],
                defaults={
                    'signing_session': session,
                    'consent_text': 'I agree to sign electronically using HanMak.',
                },
            )

        ApprovalRequest.objects.get_or_create(
            envelope=envelope,
            approver=admin,
            approval_role='Manager Approval',
            defaults={'status': ApprovalRequest.Status.PENDING},
        )
        EvidenceBundle.objects.get_or_create(
            envelope=envelope,
            defaults={'status': EvidenceBundle.Status.PENDING, 'generated_by': admin},
        )
        if not envelope.email_messages.exists():
            queue_envelope_invites(envelope, queued_by=admin)

        # Webhook Endpoints — three endpoints matching the mock UI
        webhook, _ = WebhookEndpoint.objects.get_or_create(
            organization=org,
            name='Acme Contract Events',
            defaults={
                'target_url': 'https://api.acmecorp.com/hanmak/hooks',
                'events': ['envelope.completed', 'envelope.voided', 'signature.applied'],
                'signing_secret': 'whsec_demo_acme',
                'is_active': True,
            },
        )
        slack_webhook, _ = WebhookEndpoint.objects.get_or_create(
            organization=org,
            name='Slack Notifications',
            defaults={
                'target_url': 'https://hooks.slack.com/services/T01ABC/B02DEF/xyz123',
                'events': ['envelope.sent', 'approval.granted', 'approval.declined'],
                'signing_secret': 'whsec_demo_slack',
                'is_active': True,
            },
        )
        crm_webhook, _ = WebhookEndpoint.objects.get_or_create(
            organization=org,
            name='CRM Integration',
            defaults={
                'target_url': 'https://crm.salesteam.io/api/webhooks/hanmak',
                'events': ['envelope.completed'],
                'signing_secret': 'whsec_demo_crm',
                'is_active': True,
            },
        )
        completed_event, _ = EventOutbox.objects.get_or_create(
            organization=org,
            event_type='envelope.completed',
            aggregate_type='envelope',
            aggregate_id=str(envelope.id),
            defaults={'payload': {'envelope_id': envelope.id, 'status': 'completed'}},
        )
        created_event, _ = EventOutbox.objects.get_or_create(
            organization=org,
            event_type='envelope.created',
            aggregate_type='envelope',
            aggregate_id=str(envelope.id),
            defaults={'payload': {'envelope_id': envelope.id}},
        )
        WebhookDelivery.objects.get_or_create(
            endpoint=webhook,
            event=completed_event,
            defaults={
                'request_body': completed_event.payload,
                'status': 'delivered',
                'response_status': 200,
                'response_body': '{"ok":true}',
            },
        )
        WebhookDelivery.objects.get_or_create(
            endpoint=slack_webhook,
            event=created_event,
            defaults={
                'request_body': created_event.payload,
                'status': 'delivered',
                'response_status': 200,
                'response_body': '{"ok":true}',
            },
        )
        WebhookDelivery.objects.get_or_create(
            endpoint=crm_webhook,
            event=completed_event,
            defaults={
                'request_body': completed_event.payload,
                'status': 'failed',
                'response_status': 503,
                'response_body': 'Service Unavailable',
                'error_message': 'Connection timeout after 30s',
            },
        )

        task_definition, _ = TaskDefinition.objects.get_or_create(
            name='documents.render_pdf_pages',
            defaults={'queue_name': 'documents', 'is_restartable': True, 'max_attempts': 3},
        )
        task_run, _ = TaskRun.objects.get_or_create(
            organization=org,
            task_name='documents.render_pdf_pages',
            idempotency_key=f'render-demo-envelope-{envelope.id}',
            defaults={
                'definition': task_definition,
                'queue_name': 'documents',
                'status': TaskRun.Status.FAILED,
                'related_object_type': 'envelope',
                'related_object_id': str(envelope.id),
                'payload': {'envelope_id': envelope.id},
                'error_type': 'DemoRenderError',
                'error_message': 'Demo failed render task for restart testing',
                'created_by': admin,
            },
        )
        TaskRunEvent.objects.get_or_create(
            task_run=task_run,
            event_type='failed',
            defaults={'message': 'Demo render task failed'},
        )

        # API Keys — four keys matching the mock UI
        APIKey.objects.get_or_create(
            organization=org,
            name='Production — Main Integration',
            defaults={
                'key_prefix': 'hm_prod_main',
                'key_hash': 'seed-hash-prod-main',
                'scopes': ['envelopes:read', 'envelopes:write', 'templates:read', 'signatures:write', 'webhooks:manage'],
                'status': 'active',
            },
        )
        APIKey.objects.get_or_create(
            organization=org,
            name='CI/CD Pipeline',
            defaults={
                'key_prefix': 'hm_cicd',
                'key_hash': 'seed-hash-cicd',
                'scopes': ['envelopes:read', 'templates:read'],
                'status': 'active',
            },
        )
        APIKey.objects.get_or_create(
            organization=org,
            name='Development / Testing',
            defaults={
                'key_prefix': 'hm_dev',
                'key_hash': 'seed-hash-dev',
                'scopes': ['envelopes:read', 'envelopes:write', 'templates:read', 'templates:write', 'webhooks:read'],
                'status': 'active',
            },
        )
        APIKey.objects.get_or_create(
            organization=org,
            name='Analytics Dashboard',
            defaults={
                'key_prefix': 'hm_analytics',
                'key_hash': 'seed-hash-analytics',
                'scopes': ['envelopes:read', 'audit:read', 'users:read'],
                'status': 'active',
            },
        )

        # OAuth Applications
        slack_app, _ = OAuthApplication.objects.get_or_create(
            organization=org,
            name='HanMak for Slack',
            defaults={
                'redirect_uris': ['https://slack.com/oauth/callback'],
                'scopes': ['envelopes:read', 'users:read'],
                'status': 'active',
                'created_by': admin,
            },
        )
        portal_app, _ = OAuthApplication.objects.get_or_create(
            organization=org,
            name='Acme Internal Portal',
            defaults={
                'redirect_uris': ['https://portal.acmecorp.com/oauth/callback', 'https://staging.acmecorp.com/auth'],
                'scopes': ['envelopes:read', 'envelopes:write', 'templates:read', 'signatures:write'],
                'status': 'active',
                'created_by': admin,
            },
        )
        from oauth_apps.models import OAuthGrant
        OAuthGrant.objects.get_or_create(
            application=portal_app,
            user=admin,
            defaults={'scopes': ['envelopes:read', 'envelopes:write']},
        )

        workflow, _ = WorkflowDefinition.objects.get_or_create(
            organization=org,
            name='Standard Signing + Approval',
            defaults={
                'description': 'Signer completion followed by manager approval',
                'status': WorkflowDefinition.Status.ACTIVE,
                'schema': {'steps': ['signer', 'manager_approval', 'complete']},
                'created_by': admin,
            },
        )
        WorkflowStage.objects.get_or_create(
            workflow=workflow,
            key='signer',
            defaults={'label': 'Signer', 'stage_type': 'signing', 'order': 1},
        )
        WorkflowStage.objects.get_or_create(
            workflow=workflow,
            key='manager_approval',
            defaults={'label': 'Manager Approval', 'stage_type': 'approval', 'order': 2},
        )
        workflow_run, _ = WorkflowRun.objects.get_or_create(
            envelope=envelope,
            workflow=workflow,
            defaults={'status': WorkflowRun.Status.RUNNING, 'current_stage_key': 'manager_approval'},
        )
        WorkflowEvent.objects.get_or_create(
            run=workflow_run,
            envelope=envelope,
            event_type='stage.entered',
            stage_key='manager_approval',
            defaults={'actor': admin, 'message': 'Envelope entered manager approval'},
        )

        SSOConnection.objects.get_or_create(
            organization=org,
            name='Okta SAML',
            defaults={'provider_type': SSOConnection.ProviderType.SAML, 'is_enabled': False, 'metadata_url': 'https://app.hanmak.io/saml/metadata.xml'},
        )
        SCIMConnection.objects.get_or_create(
            organization=org,
            defaults={'base_url': 'https://app.hanmak.io/scim/v2', 'token_prefix': 'scim_demo', 'is_enabled': False},
        )

        LegalHold.objects.get_or_create(
            organization=org,
            name='LIT-2026-042 Vendor Dispute',
            defaults={'matter': 'LIT-2026-042', 'reason': 'Preserve vendor contract documents', 'created_by': admin},
        )
        RetentionPolicy.objects.get_or_create(
            organization=org,
            name='Completed Envelopes - 7 Years',
            defaults={'applies_to': 'envelopes', 'status_filter': 'completed', 'retention_days': 2555, 'action': 'archive'},
        )
        ComplianceExport.objects.get_or_create(
            organization=org,
            export_type='audit',
            defaults={'status': ComplianceExport.Status.QUEUED, 'requested_by': admin},
        )
        us_region, _ = DataResidencyRegion.objects.get_or_create(
            code='us',
            defaults={'name': 'United States', 'country_codes': ['US'], 'storage_backend': 'minio-us'},
        )
        eu_region, _ = DataResidencyRegion.objects.get_or_create(
            code='eu',
            defaults={'name': 'European Union', 'country_codes': ['DE', 'FR', 'IE', 'NL'], 'storage_backend': 'minio-eu'},
        )
        residency_policy, _ = OrganizationDataResidencyPolicy.objects.get_or_create(
            organization=org,
            defaults={'primary_region': us_region, 'enforcement_mode': OrganizationDataResidencyPolicy.EnforcementMode.LOG_ONLY},
        )
        residency_policy.allowed_regions.add(us_region, eu_region)

        # Plans — four tiers matching the mock UI
        Plan.objects.get_or_create(
            code='starter',
            defaults={'name': 'Starter', 'monthly_price': 49, 'features': ['api', 'basic_webhooks'],
                      'limits': {'envelopes': 100, 'users': 5, 'storage_gb': 10, 'api_calls': 100000}},
        )
        Plan.objects.get_or_create(
            code='growth',
            defaults={'name': 'Growth', 'monthly_price': 149, 'features': ['api', 'webhooks', 'custom_branding'],
                      'limits': {'envelopes': 250, 'users': 25, 'storage_gb': 100, 'api_calls': 500000}},
        )
        business_plan, _ = Plan.objects.get_or_create(
            code='business',
            defaults={'name': 'Business', 'monthly_price': 299,
                      'features': ['sso', 'api', 'webhooks', 'custom_branding', 'legal_holds', 'audit_trail'],
                      'limits': {'envelopes': 500, 'users': 50, 'storage_gb': 1024, 'api_calls': 1000000,
                                 'webhook_endpoints': 10, 'templates': 25}},
        )
        Plan.objects.get_or_create(
            code='enterprise',
            defaults={'name': 'Enterprise', 'monthly_price': 499,
                      'features': ['sso', 'scim', 'api', 'webhooks', 'custom_branding', 'legal_holds',
                                   'audit_trail', 'data_residency', 'advanced_compliance'],
                      'limits': {'envelopes': 10000, 'users': -1, 'storage_gb': -1, 'api_calls': -1}},
        )
        subscription, _ = Subscription.objects.get_or_create(
            organization=org,
            defaults={
                'plan': business_plan,
                'status': Subscription.Status.ACTIVE,
                'current_period_start': date(2026, 5, 15),
                'current_period_end': date(2026, 6, 15),
            },
        )
        # Usage records — multiple metrics for the current billing period
        usage_metrics = [
            ('envelopes.sent', 213),
            ('users.active', 41),
            ('storage.gb', 248),
            ('api_calls.mtd', 87300),
            ('templates', 8),
            ('webhook_endpoints', 3),
        ]
        for metric_key, quantity in usage_metrics:
            UsageRecord.objects.get_or_create(
                organization=org,
                metric_key=metric_key,
                period_start='2026-05-01',
                period_end='2026-05-31',
                defaults={'quantity': quantity},
            )
        LicenseKey.objects.get_or_create(
            organization=org,
            key='HM-BUS-2026-ACME-XXXXX',
            defaults={
                'status': 'active',
                'activated_at': timezone.now(),
            },
        )

        AppSetting.objects.get_or_create(
            organization=org,
            namespace='branding',
            key='application_name',
            defaults={'value': {'name': 'HanMak'}},
        )
        FeatureFlag.objects.get_or_create(
            organization=org,
            key='workflow_builder',
            defaults={
                'name': 'Workflow Builder',
                'module': FeatureFlag.Module.WORKFLOW,
                'is_enabled': True,
                'release_stage': FeatureFlag.ReleaseStage.BETA,
                'rollout_percentage': 50,
                'owner': 'Product',
                'description': 'Visual workflow definitions, validation, runs, events, and advancement.',
            },
        )
        HealthCheck.objects.get_or_create(
            name='database',
            defaults={'status': 'healthy', 'message': 'Database reachable'},
        )

        RiskFinding.objects.get_or_create(
            organization=org,
            envelope=envelope,
            title='Signer domain differs from organization domain',
            defaults={'severity': RiskFinding.Severity.MEDIUM, 'description': 'Demo risk finding for review.'},
        )
        PolicyRule.objects.get_or_create(
            organization=org,
            name='Flag external signer domains',
            defaults={'rule_type': 'signer_domain', 'config': {'allow_external': False}},
        )

        # Audit events — diverse set matching the mock UI
        audit_events_seed = [
            ('envelope.created', AuditEvent.Severity.INFO, 'Demo envelope created', {'source': 'seed_demo'}),
            ('signature.applied', AuditEvent.Severity.INFO, 'Signature applied to field vendor_signature on page 1', {'field': 'vendor_signature', 'page': 1}),
            ('envelope.sent', AuditEvent.Severity.INFO, 'Envelope dispatched to 2 recipients via email', {'recipients': 2}),
            ('approval.granted', AuditEvent.Severity.INFO, 'Manager approval granted with comment: Looks good to proceed', {}),
            ('user.login', AuditEvent.Severity.INFO, 'Successful login via SSO (Okta)', {'method': 'sso', 'provider': 'okta'}),
            ('api.key_used', AuditEvent.Severity.INFO, 'GET /api/v1/envelopes — 200 OK', {'method': 'GET', 'path': '/api/v1/envelopes', 'status': 200}),
            ('envelope.voided', AuditEvent.Severity.WARNING, 'Envelope voided — reason: Insurance policy cancelled', {'reason': 'Insurance policy cancelled'}),
            ('user.mfa_enabled', AuditEvent.Severity.INFO, 'MFA enrolled — method: TOTP', {'method': 'totp'}),
            ('webhook.delivered', AuditEvent.Severity.INFO, 'POST envelope.completed → https://api.acmecorp.com/hooks — 200', {}),
            ('user.login_failed', AuditEvent.Severity.SECURITY, 'Failed login attempt — blocked by IP policy', {'blocked': True}),
        ]
        for event_type, severity, message, metadata in audit_events_seed:
            AuditEvent.objects.get_or_create(
                organization=org,
                event_type=event_type,
                message=message,
                defaults={
                    'envelope': envelope if 'envelope' in event_type else None,
                    'actor': admin,
                    'severity': severity,
                    'ip_address': '172.16.0.42',
                    'metadata': metadata,
                },
            )

        # Additional approval requests matching the mock UI queue
        extra_approvals = [
            ('Q4 Vendor Contract — Acme', 'CFO Approval', ApprovalRequest.Status.PENDING),
            ('SLA Amendment — CloudBase', 'Legal Review', ApprovalRequest.Status.PENDING),
            ('Board Resolution Q2', 'CEO Approval', ApprovalRequest.Status.PENDING),
            ('Office Supplies PO #2024-1142', 'Finance Approval', ApprovalRequest.Status.APPROVED),
            ('MSA — TechVentures Inc', 'Manager Approval', ApprovalRequest.Status.APPROVED),
        ]
        for name, role, status in extra_approvals:
            env_ref, _ = Envelope.objects.get_or_create(
                organization=org,
                name=name,
                defaults={
                    'template': template,
                    'template_version': template_version,
                    'status': Envelope.Status.SENT,
                    'sender': admin,
                },
            )
            ApprovalRequest.objects.get_or_create(
                envelope=env_ref,
                approval_role=role,
                defaults={'approver': admin, 'status': status},
            )

        # Seed documents (metadata only — no actual file bytes needed for the UI)
        from documents.models import Document
        doc_seeds = [
            ('Q4 Vendor Contract — Acme.pdf', 'application/pdf', 2500000, Document.Status.READY),
            ('Employment Agreement — A.Rivera.pdf', 'application/pdf', 1800000, Document.Status.READY),
            ('Mutual NDA — Horizon.pdf', 'application/pdf', 900000, Document.Status.READY),
            ('SaaS MSA — CloudBase.pdf', 'application/pdf', 3100000, Document.Status.READY),
            ('Board Resolution Q1.pdf', 'application/pdf', 500000, Document.Status.READY),
            ('DPA GDPR Compliance.pdf', 'application/pdf', 1600000, Document.Status.READY),
            ('SOW Design Sprint Ph2.pdf', 'application/pdf', 1200000, Document.Status.UPLOADED),
        ]
        for title, mime_type, file_size, status in doc_seeds:
            Document.objects.get_or_create(
                organization=org,
                title=title,
                defaults={
                    'uploaded_by': admin,
                    'mime_type': mime_type,
                    'file_size': file_size,
                    'status': status,
                    'page_count': 3 if file_size > 1000000 else 1,
                },
            )

        self.stdout.write(self.style.SUCCESS('Demo data ready. Login: admin / admin123'))

    def seed_secondary_organization(self, *, admin, slug, name, legal_name, website, contact_email, template_name, envelope_specs):
        from configcenter.views import DEFAULT_RELEASE_MODULES

        organization, _ = Organization.objects.get_or_create(
            slug=slug,
            defaults={
                'name': name,
                'legal_name': legal_name,
                'website': website,
                'primary_contact_email': contact_email,
            },
        )
        team, _ = Team.objects.get_or_create(
            organization=organization,
            name='Operations',
            defaults={'description': f'{name} operations team'},
        )
        Membership.objects.get_or_create(
            user=admin,
            organization=organization,
            defaults={'team': team, 'role': Membership.Role.ADMIN},
        )
        Role.objects.get_or_create(
            organization=organization,
            name='Administrator',
            defaults={'description': 'Full administrative access', 'is_system': True, 'permissions': ['*']},
        )
        GeneralSettings.objects.get_or_create(
            organization=organization,
            defaults={
                'application_name': 'HanMak',
                'default_timezone': 'UTC',
                'support_email': contact_email,
            },
        )
        EmailSettings.objects.get_or_create(
            organization=organization,
            defaults={'from_email': f'no-reply@{slug}.hanmak.local', 'reply_to_email': contact_email},
        )
        StorageSettings.objects.get_or_create(
            organization=organization,
            defaults={'backend': 'local', 'bucket_name': f'hanmak-{slug}'},
        )
        SecuritySettings.objects.get_or_create(
            organization=organization,
            defaults={'require_admin_mfa': False, 'allow_passkeys': True},
        )
        AppSetting.objects.get_or_create(
            organization=organization,
            namespace='branding',
            key='application_name',
            defaults={'value': {'name': 'HanMak'}},
        )
        for item in DEFAULT_RELEASE_MODULES:
            FeatureFlag.objects.get_or_create(
                organization=organization,
                key=item['key'],
                defaults={
                    **item,
                    'owner': item.get('owner', 'Product'),
                    'qa_checklist': [
                        {'label': 'Backend endpoint verified', 'done': False},
                        {'label': 'Frontend flow verified', 'done': False},
                        {'label': 'Permissions and audit behavior checked', 'done': False},
                        {'label': 'Release notes reviewed', 'done': False},
                    ],
                    'config': {'source': 'seed-demo-secondary-org'},
                },
            )

        template, _ = Template.objects.get_or_create(
            organization=organization,
            name=template_name,
            defaults={
                'description': f'{name} demo template',
                'category': 'Corporate',
                'status': Template.Status.ACTIVE,
                'created_by': admin,
            },
        )
        version, _ = TemplateVersion.objects.get_or_create(
            template=template,
            version_number=1,
            defaults={
                'field_schema': {'fields': ['signature']},
                'workflow_schema': {'steps': ['signer', 'complete']},
                'changelog': 'Initial seeded version',
                'is_published': True,
                'created_by': admin,
            },
        )
        party, _ = TemplateParty.objects.get_or_create(
            template_version=version,
            role_key='signer',
            defaults={'label': 'Signer', 'routing_order': 1},
        )
        for envelope_name, status, due_date, recipients in envelope_specs:
            envelope, _ = Envelope.objects.get_or_create(
                organization=organization,
                name=envelope_name,
                defaults={
                    'template': template,
                    'template_version': version,
                    'status': status,
                    'sender': admin,
                    'message': f'Please review this {name} document.',
                    'due_date': due_date,
                    'sent_at': timezone.now() if status != Envelope.Status.DRAFT else None,
                    'completed_at': timezone.now() if status == Envelope.Status.COMPLETED else None,
                },
            )
            envelope.template = template
            envelope.template_version = version
            envelope.save(update_fields=['template', 'template_version', 'updated_at'])
            for order, (recipient_name, email, recipient_status) in enumerate(recipients, start=1):
                recipient, _ = Recipient.objects.get_or_create(
                    envelope=envelope,
                    email=email,
                    defaults={
                        'name': recipient_name,
                        'role': Recipient.Role.SIGNER,
                        'status': recipient_status,
                        'routing_order': order,
                    },
                )
                if status != Envelope.Status.DRAFT:
                    SigningSession.objects.get_or_create(envelope=envelope, recipient=recipient)
            FormField.objects.get_or_create(
                envelope=envelope,
                label='Signature',
                defaults={
                    'template_version': version,
                    'party': party,
                    'field_key': f'signature_{envelope.id}',
                    'field_type': FormField.FieldType.SIGNATURE,
                    'required': True,
                    'page': 1,
                    'x': 96,
                    'y': 620,
                    'width': 220,
                    'height': 64,
                },
            )
            AuditEvent.objects.get_or_create(
                organization=organization,
                event_type='envelope.seeded',
                envelope=envelope,
                defaults={
                    'actor': admin,
                    'severity': AuditEvent.Severity.INFO,
                    'message': f'Seeded {envelope.name}',
                    'metadata': {'status': status},
                },
            )
