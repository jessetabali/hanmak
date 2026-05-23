from django.contrib.auth import get_user_model
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient
import json
import re

from accounts.models import (
    AccountRecoveryRequest,
    ImpersonationRequest,
    Invitation,
    MFADevice,
    Membership,
    NotificationPreference,
    ObjectPermission,
    Organization,
    OrganizationDomain,
    RecoveryCode,
    Role,
    Team,
    UserSession,
)
from auditlog.models import AuditEvent
from approvals.models import ApprovalRequest
from billing.models import Invoice, LicenseKey, PaymentMethod, PaymentPortalSession, PaymentWebhookEvent, Plan, Subscription
from compliance.models import DataResidencyRegion, LegalHold, LegalHoldItem, OrganizationDataResidencyPolicy
from configcenter.models import AppSetting, EmailSettings, FeatureFlag, GeneralSettings, HealthCheck, Incident
from documents.models import Document, DocumentPage, DocumentScan, EnvelopeDocument
from evidence.models import EvidenceBundle
from evidence.pdf import can_stamp_source_pdf, field_geometry_for_page
from envelopes.models import Envelope, FormField, Recipient, Template
from messaging.models import EmailMessage, EmailTemplate, ReminderSchedule
from oauth_apps.models import OAuthApplication
from search.models import SearchIndex
from signing.models import EnvelopeFieldValue, SigningSession
from tasks.models import TaskDefinition, TaskRun, TaskRunEvent
from identity.models import JITProvisioningSettings, LDAPConnection, SCIMExternalIdentity, SocialProvider, SSOConnection
from workflow.models import WorkflowDefinition, WorkflowEvent, WorkflowRun, WorkflowStage


@override_settings(CELERY_TASK_ALWAYS_EAGER=True, EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend', HANMAK_LOGIN_LOCKOUT_FAILURES=3, HANMAK_LOGIN_LOCKOUT_MINUTES=15)
class TenantScopedAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.user_a = User.objects.create_user(username='alice', password='alice-pass')
        self.user_b = User.objects.create_user(username='bob', password='bob-pass')
        self.viewer = User.objects.create_user(username='val', password='viewer-pass')
        self.superuser = User.objects.create_superuser(username='root', password='root-pass')

        self.org_a = Organization.objects.create(name='Alpha Legal', slug='alpha')
        self.org_b = Organization.objects.create(name='Beta Finance', slug='beta')
        Membership.objects.create(user=self.user_a, organization=self.org_a, role=Membership.Role.ADMIN)
        Membership.objects.create(user=self.user_b, organization=self.org_b, role=Membership.Role.ADMIN)
        Membership.objects.create(user=self.viewer, organization=self.org_a, role=Membership.Role.VIEWER)

        self.envelope_a = Envelope.objects.create(
            organization=self.org_a,
            name='Alpha NDA',
            sender=self.user_a,
        )
        self.envelope_b = Envelope.objects.create(
            organization=self.org_b,
            name='Beta Contract',
            sender=self.user_b,
        )
        self.recipient_a = Recipient.objects.create(
            envelope=self.envelope_a,
            name='Alice Signer',
            email='signer@example.com',
        )

    def ids_from_paginated_response(self, response):
        return {item['id'] for item in response.data['results']}

    def token_from_latest_email(self, email):
        message = EmailMessage.objects.filter(to_email=email).latest('id')
        match = re.search(r'(?:token|invite_token)=([^&\s]+)', message.body)
        self.assertIsNotNone(match)
        return match.group(1)

    def add_signature_field(self, envelope=None, recipient=None, field_key='signature'):
        envelope = envelope or self.envelope_a
        recipient = recipient or self.recipient_a
        return FormField.objects.create(
            envelope=envelope,
            recipient=recipient,
            field_key=field_key,
            field_type=FormField.FieldType.SIGNATURE,
            label='Signature',
            required=True,
            page=1,
            x=10,
            y=10,
            width=150,
            height=40,
        )

    def test_user_only_sees_their_organization_records(self):
        self.client.force_authenticate(self.user_a)

        organizations = self.client.get('/api/v1/organizations/')
        envelopes = self.client.get('/api/v1/envelopes/')

        self.assertEqual(organizations.status_code, status.HTTP_200_OK)
        self.assertEqual(envelopes.status_code, status.HTTP_200_OK)
        self.assertEqual(self.ids_from_paginated_response(organizations), {self.org_a.id})
        self.assertEqual(self.ids_from_paginated_response(envelopes), {self.envelope_a.id})

    def test_user_cannot_retrieve_another_organization_envelope(self):
        self.client.force_authenticate(self.user_a)

        response = self.client.get(f'/api/v1/envelopes/{self.envelope_b.id}/')

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_user_cannot_create_record_in_another_organization(self):
        self.client.force_authenticate(self.user_a)

        response = self.client.post('/api/v1/envelopes/', {
            'organization': self.org_b.id,
            'name': 'Cross-tenant envelope',
            'sender': self.user_a.id,
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(Envelope.objects.filter(name='Cross-tenant envelope').count(), 0)

    def test_superuser_can_see_all_organization_records(self):
        self.client.force_authenticate(self.superuser)

        response = self.client.get('/api/v1/envelopes/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.ids_from_paginated_response(response), {self.envelope_a.id, self.envelope_b.id})

    def test_jwt_login_returns_tokens(self):
        response = self.client.post('/api/v1/auth/login/', {
            'username': 'alice',
            'password': 'alice-pass',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)

    def test_revoke_sessions_invalidates_existing_jwt_tokens(self):
        login_response = self.client.post('/api/v1/auth/login/', {
            'username': 'alice',
            'password': 'alice-pass',
        }, format='json')
        access = login_response.data['access']
        refresh = login_response.data['refresh']

        authenticated_client = APIClient()
        authenticated_client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')
        before_response = authenticated_client.get('/api/v1/profiles/me/')
        revoke_response = authenticated_client.post(f'/api/v1/users/{self.user_a.id}/revoke_sessions/')
        after_response = authenticated_client.get('/api/v1/profiles/me/')
        refresh_response = self.client.post('/api/v1/auth/refresh/', {'refresh': refresh}, format='json')

        self.assertEqual(before_response.status_code, status.HTTP_200_OK)
        self.assertEqual(revoke_response.status_code, status.HTTP_200_OK)
        self.assertEqual(after_response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(refresh_response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_lockout_after_repeated_failures_and_recovery_after_window(self):
        for _ in range(3):
            self.client.post('/api/v1/auth/login/', {
                'username': 'alice',
                'password': 'wrong-pass',
            }, format='json')
        profile = self.user_a.hanmak_profile
        profile.refresh_from_db()

        locked_response = self.client.post('/api/v1/auth/login/', {
            'username': 'alice',
            'password': 'alice-pass',
        }, format='json')
        profile.locked_until = timezone.now() - timezone.timedelta(minutes=1)
        profile.save(update_fields=['locked_until', 'updated_at'])
        recovered_response = self.client.post('/api/v1/auth/login/', {
            'username': 'alice',
            'password': 'alice-pass',
        }, format='json')
        profile.refresh_from_db()

        self.assertIsNotNone(profile.last_failed_login_at)
        self.assertEqual(locked_response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(recovered_response.status_code, status.HTTP_200_OK)
        self.assertEqual(profile.failed_login_count, 0)
        self.assertIsNone(profile.locked_until)

    def test_public_password_reset_request_queues_email_without_user_enumeration(self):
        self.user_a.email = 'alice@example.com'
        self.user_a.save(update_fields=['email'])

        response = self.client.post('/api/v1/account-recovery/request_reset/', {'email': self.user_a.email}, format='json')
        missing = self.client.post('/api/v1/account-recovery/request_reset/', {'email': 'missing@example.com'}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(missing.status_code, status.HTTP_200_OK)
        self.assertEqual(AccountRecoveryRequest.objects.filter(user=self.user_a, status=AccountRecoveryRequest.Status.PENDING).count(), 1)
        self.assertTrue(EmailMessage.objects.filter(to_email=self.user_a.email).exists())

    def test_profile_me_endpoint_creates_current_user_profile(self):
        self.client.force_authenticate(self.user_a)

        response = self.client.patch('/api/v1/profiles/me/', {
            'display_name': 'Alice Admin',
            'timezone': 'Pacific/Port_Moresby',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['display_name'], 'Alice Admin')
        self.assertEqual(response.data['user'], self.user_a.id)

    def test_profile_activity_includes_user_security_timeline(self):
        AuditEvent.objects.create(
            organization=self.org_a,
            actor=self.user_a,
            event_type='profile.updated',
            message='Profile updated',
        )
        UserSession.objects.create(user=self.user_a, session_key='session-1')
        self.client.force_authenticate(self.user_a)

        response = self.client.get('/api/v1/profiles/activity/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['audit_events'][0]['event_type'], 'profile.updated')
        self.assertEqual(response.data['sessions'][0]['session_key'], 'session-1')

    def test_notification_preference_create_uses_current_user_when_user_is_omitted(self):
        self.client.force_authenticate(self.user_a)

        response = self.client.post('/api/v1/notification-preferences/', {
            'event_type': 'envelope.completed',
            'email_enabled': True,
            'in_app_enabled': False,
            'digest_enabled': True,
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['user'], self.user_a.id)
        self.assertTrue(NotificationPreference.objects.filter(user=self.user_a, event_type='envelope.completed').exists())

    def test_inbox_mark_read_and_snooze_actions_update_profile_preferences(self):
        ApprovalRequest.objects.create(
            envelope=self.envelope_a,
            approver=self.user_a,
            approval_role='Finance',
        )
        self.client.force_authenticate(self.user_a)

        inbox = self.client.get('/api/v1/inbox/')
        snooze = self.client.post('/api/v1/inbox/', {
            'action': 'snooze',
            'key': f'approval:{inbox.data["approvals"][0]["id"]}',
            'minutes': 30,
        }, format='json')
        snoozed_inbox = self.client.get('/api/v1/inbox/')
        mark_read = self.client.post('/api/v1/inbox/', {
            'action': 'mark_all_read',
        }, format='json')
        self.user_a.hanmak_profile.refresh_from_db()

        self.assertEqual(inbox.status_code, status.HTTP_200_OK)
        self.assertEqual(snooze.status_code, status.HTTP_200_OK)
        self.assertEqual(snoozed_inbox.data['counts']['approvals'], 0)
        self.assertEqual(mark_read.status_code, status.HTTP_200_OK)
        self.assertIn('inbox_marked_read_at', self.user_a.hanmak_profile.preferences)

    def test_approval_request_can_be_delegated_from_inbox_flow(self):
        approval = ApprovalRequest.objects.create(
            envelope=self.envelope_a,
            approver=self.user_a,
            approval_role='Finance',
        )
        self.client.force_authenticate(self.user_a)

        response = self.client.post(f'/api/v1/approval-requests/{approval.id}/delegate/', {
            'user': self.viewer.id,
            'notes': 'Please review this while I am away.',
        }, format='json')
        approval.refresh_from_db()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(approval.status, ApprovalRequest.Status.DELEGATED)
        self.assertEqual(approval.delegated_to, self.viewer)

    def test_inbox_only_shows_signing_tasks_for_current_user_email(self):
        self.user_a.email = 'alice@example.com'
        self.user_a.save(update_fields=['email'])
        matching_recipient = Recipient.objects.create(envelope=self.envelope_a, name='Alice', email='alice@example.com')
        other_recipient = Recipient.objects.create(envelope=self.envelope_a, name='Other', email='other@example.com')
        SigningSession.objects.create(envelope=self.envelope_a, recipient=matching_recipient)
        SigningSession.objects.create(envelope=self.envelope_a, recipient=other_recipient)
        self.client.force_authenticate(self.user_a)

        response = self.client.get('/api/v1/inbox/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['counts']['signing'], 1)
        self.assertEqual(response.data['signing'][0]['recipient_email'], 'alice@example.com')

    def test_inbox_can_restart_and_cancel_failed_tasks(self):
        task = TaskRun.objects.create(
            organization=self.org_a,
            task_name='send_envelope_email',
            queue_name='email',
            status=TaskRun.Status.FAILED,
            error_message='SMTP timeout',
            created_by=self.user_a,
        )
        self.client.force_authenticate(self.user_a)

        restart = self.client.post('/api/v1/inbox/', {
            'action': 'restart_task',
            'id': task.id,
        }, format='json')
        cancel = self.client.post('/api/v1/inbox/', {
            'action': 'cancel_task',
            'id': task.id,
        }, format='json')
        task.refresh_from_db()

        self.assertEqual(restart.status_code, status.HTTP_200_OK)
        self.assertTrue(TaskRun.objects.filter(restarted_from=task, status=TaskRun.Status.QUEUED).exists())
        self.assertEqual(cancel.status_code, status.HTTP_200_OK)
        self.assertEqual(task.status, TaskRun.Status.CANCELLED)
        delete = self.client.delete(f'/api/v1/task-runs/{task.id}/')
        self.assertEqual(delete.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(TaskRun.objects.filter(id=task.id).exists())

    def test_envelope_download_and_bulk_send_are_backend_backed(self):
        FormField.objects.create(envelope=self.envelope_a, recipient=self.recipient_a, field_key='signature', field_type='signature', label='Signature')
        self.client.force_authenticate(self.user_a)

        download = self.client.get(f'/api/v1/envelopes/{self.envelope_a.id}/download/')
        bulk = self.client.post('/api/v1/envelopes/bulk-action/', {
            'action': 'send',
            'ids': [self.envelope_a.id],
        }, format='json')
        self.envelope_a.refresh_from_db()

        self.assertEqual(download.status_code, status.HTTP_200_OK)
        self.assertEqual(download['Content-Type'], 'application/pdf')
        self.assertEqual(bulk.status_code, status.HTTP_200_OK)
        self.assertEqual(bulk.data['updated'], 1)
        self.assertEqual(self.envelope_a.status, Envelope.Status.SENT)

    def test_envelope_bulk_delete_supports_selected_non_drafts(self):
        sent_envelope = Envelope.objects.create(
            organization=self.org_a,
            name='Sent Bulk Delete',
            sender=self.user_a,
            status=Envelope.Status.SENT,
        )
        completed_envelope = Envelope.objects.create(
            organization=self.org_a,
            name='Completed Bulk Delete',
            sender=self.user_a,
            status=Envelope.Status.COMPLETED,
        )
        self.client.force_authenticate(self.user_a)

        drafts_only = self.client.post('/api/v1/envelopes/bulk-action/', {
            'action': 'delete_drafts',
            'ids': [sent_envelope.id, completed_envelope.id],
        }, format='json')
        delete_selected = self.client.post('/api/v1/envelopes/bulk-action/', {
            'action': 'delete',
            'ids': [sent_envelope.id, completed_envelope.id],
        }, format='json')

        self.assertEqual(drafts_only.status_code, status.HTTP_200_OK)
        self.assertEqual(drafts_only.data['deleted'], 0)
        self.assertEqual(delete_selected.status_code, status.HTTP_200_OK)
        self.assertEqual(delete_selected.data['deleted'], 2)
        self.assertFalse(Envelope.objects.filter(id__in=[sent_envelope.id, completed_envelope.id]).exists())

    def test_document_library_crud_process_scan_and_render_pages(self):
        self.client.force_authenticate(self.user_a)
        upload = SimpleUploadedFile('contract.pdf', b'%PDF-1.4 test document', content_type='application/pdf')

        create = self.client.post('/api/v1/documents/', {
            'organization': self.org_a.id,
            'title': 'Vendor Contract',
            'mime_type': 'application/pdf',
            'file': upload,
        }, format='multipart')
        document_id = create.data['id']
        update = self.client.patch(f'/api/v1/documents/{document_id}/', {'title': 'Updated Contract'}, format='json')
        process = self.client.post(f'/api/v1/documents/{document_id}/process/', {'page_count': 2}, format='json')
        scan = self.client.post(f'/api/v1/documents/{document_id}/scan/', {}, format='json')
        render = self.client.post(f'/api/v1/documents/{document_id}/render_pages/', {'width': 320}, format='json')
        ordered = self.client.get('/api/v1/documents/?ordering=title')
        delete = self.client.delete(f'/api/v1/documents/{document_id}/')

        self.assertEqual(create.status_code, status.HTTP_201_CREATED)
        self.assertEqual(update.status_code, status.HTTP_200_OK)
        self.assertEqual(update.data['title'], 'Updated Contract')
        self.assertEqual(process.status_code, status.HTTP_200_OK)
        self.assertEqual(process.data['status'], Document.Status.READY)
        self.assertEqual(process.data['page_count'], 2)
        self.assertEqual(scan.status_code, status.HTTP_200_OK)
        self.assertEqual(render.status_code, status.HTTP_200_OK)
        self.assertEqual(len(render.data), 2)
        self.assertEqual(ordered.status_code, status.HTTP_200_OK)
        self.assertEqual(delete.status_code, status.HTTP_204_NO_CONTENT)

    def test_document_library_summary_prepare_for_builder_and_duplicate(self):
        self.client.force_authenticate(self.user_a)
        upload = SimpleUploadedFile('builder.pdf', b'%PDF-1.4 builder source', content_type='application/pdf')
        create = self.client.post('/api/v1/documents/', {
            'organization': self.org_a.id,
            'title': 'Builder Source',
            'mime_type': 'application/pdf',
            'file': upload,
        }, format='multipart')
        document_id = create.data['id']

        prepare = self.client.post(f'/api/v1/documents/{document_id}/prepare-for-builder/', {'width': 320}, format='json')
        duplicate = self.client.post(f'/api/v1/documents/{document_id}/duplicate/', {'title': 'Builder Copy'}, format='json')
        summary = self.client.get(f'/api/v1/documents/summary/?organization={self.org_a.id}')

        self.assertEqual(create.status_code, status.HTTP_201_CREATED)
        self.assertEqual(prepare.status_code, status.HTTP_200_OK)
        self.assertEqual(prepare.data['status'], Document.Status.READY)
        self.assertGreaterEqual(len(prepare.data['rendered_pages']), 1)
        self.assertTrue(DocumentPage.objects.filter(document_id=document_id, image__endswith='.png').exists())
        self.assertEqual(duplicate.status_code, status.HTTP_201_CREATED)
        self.assertEqual(duplicate.data['title'], 'Builder Copy')
        self.assertEqual(duplicate.data['page_count'], prepare.data['page_count'])
        self.assertEqual(summary.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(summary.data['total'], 2)
        self.assertGreaterEqual(summary.data['ready'], 1)

    def test_template_crud_setup_and_delete_flow(self):
        self.client.force_authenticate(self.user_a)
        document = Document.objects.create(
            organization=self.org_a,
            uploaded_by=self.user_a,
            title='Template Source',
            mime_type='application/pdf',
            page_count=1,
            status=Document.Status.READY,
        )

        create = self.client.post('/api/v1/templates/', {
            'organization': self.org_a.id,
            'name': 'Service Agreement',
            'category': 'Legal',
            'description': 'Reusable agreement',
            'status': Template.Status.DRAFT,
        }, format='json')
        template_id = create.data['id']
        update = self.client.patch(f'/api/v1/templates/{template_id}/', {
            'name': 'Updated Service Agreement',
            'status': Template.Status.ACTIVE,
        }, format='json')
        setup = self.client.post(f'/api/v1/templates/{template_id}/setup/', {
            'document': document.id,
            'fields': [
                {'field_key': 'signer-name', 'field_type': 'text', 'label': 'Signer Name', 'required': True, 'party_key': 'party-2', 'page': 1, 'x': 10, 'y': 20, 'width': 120, 'height': 24},
                {'field_key': 'choice', 'field_type': 'select', 'label': 'Choice', 'required': True, 'party_key': 'party-2', 'page': 1, 'x': 10, 'y': 60, 'width': 120, 'height': 24, 'options': ['A', 'B']},
            ],
        }, format='json')
        detail = self.client.get(f'/api/v1/templates/{template_id}/')
        duplicate = self.client.post(f'/api/v1/templates/{template_id}/duplicate/', {'name': 'Copied Service Agreement'}, format='json')
        archive = self.client.post(f'/api/v1/templates/{template_id}/archive/', {}, format='json')
        activate = self.client.post(f'/api/v1/templates/{template_id}/activate/', {}, format='json')
        delete = self.client.delete(f'/api/v1/templates/{template_id}/')

        self.assertEqual(create.status_code, status.HTTP_201_CREATED)
        self.assertEqual(update.status_code, status.HTTP_200_OK)
        self.assertEqual(update.data['name'], 'Updated Service Agreement')
        self.assertEqual(setup.status_code, status.HTTP_201_CREATED)
        self.assertEqual(detail.status_code, status.HTTP_200_OK)
        self.assertEqual(len(detail.data['fields']), 2)
        self.assertEqual(detail.data['fields'][1]['options'], ['A', 'B'])
        self.assertEqual(detail.data['field_count'], 2)
        self.assertEqual(duplicate.status_code, status.HTTP_201_CREATED)
        self.assertEqual(duplicate.data['name'], 'Copied Service Agreement')
        self.assertEqual(archive.data['status'], Template.Status.ARCHIVED)
        self.assertEqual(activate.data['status'], Template.Status.ACTIVE)
        self.assertEqual(delete.status_code, status.HTTP_204_NO_CONTENT)

    def test_public_signing_workflow_handles_typed_select_date_and_completion(self):
        recipient = Recipient.objects.create(
            envelope=self.envelope_a,
            name='Public Signer',
            email='public@example.com',
        )
        self.envelope_a.status = Envelope.Status.SENT
        self.envelope_a.save(update_fields=['status', 'updated_at'])
        self.recipient_a.status = Recipient.Status.SIGNED
        self.recipient_a.signed_at = timezone.now()
        self.recipient_a.save(update_fields=['status', 'signed_at'])
        FormField.objects.create(envelope=self.envelope_a, recipient=recipient, field_key='signature', field_type='signature', label='Signature', required=True, page=1, x=10, y=10, width=150, height=40)
        FormField.objects.create(envelope=self.envelope_a, recipient=recipient, field_key='effective-date', field_type='date', label='Effective Date', required=True, page=1, x=10, y=60, width=150, height=24)
        FormField.objects.create(envelope=self.envelope_a, recipient=recipient, field_key='choice', field_type='select', label='Choice', required=True, page=1, x=10, y=90, width=150, height=24, options=['A', 'B'])
        session = SigningSession.objects.create(envelope=self.envelope_a, recipient=recipient)

        open_response = self.client.get(f'/api/v1/sign/{session.token}/')
        submit = self.client.post(f'/api/v1/sign/{session.token}/', {
            'consent_text': 'Accepted electronic signature consent.',
            'signature': {'signature_type': 'typed', 'typed_name': 'Public Signer'},
            'field_values': [
                {'field_key': 'signature', 'value': 'Public Signer', 'metadata': {'field_type': 'signature'}},
                {'field_key': 'effective-date', 'value': '2026-05-12', 'metadata': {'field_type': 'date'}},
                {'field_key': 'choice', 'value': 'B', 'metadata': {'field_type': 'select'}},
            ],
        }, format='json')
        repeat = self.client.post(f'/api/v1/sign/{session.token}/', {
            'field_values': [],
        }, format='json')
        self.envelope_a.refresh_from_db()
        recipient.refresh_from_db()

        self.assertEqual(open_response.status_code, status.HTTP_200_OK)
        self.assertEqual(open_response.data['fields'][2]['options'], ['A', 'B'])
        self.assertEqual(submit.status_code, status.HTTP_200_OK)
        self.assertTrue(submit.data['is_completed'])
        self.assertEqual(self.envelope_a.status, Envelope.Status.COMPLETED)
        self.assertEqual(recipient.status, Recipient.Status.SIGNED)
        self.assertEqual(EnvelopeFieldValue.objects.get(envelope=self.envelope_a, field_key='choice').value, 'B')
        self.assertEqual(repeat.status_code, status.HTTP_200_OK)

    def test_audit_filters_support_mock_search_prefix_and_date_range(self):
        AuditEvent.objects.create(
            organization=self.org_a,
            actor=self.user_a,
            envelope=self.envelope_a,
            event_type='envelope.sent',
            message='Envelope sent to signer',
        )
        AuditEvent.objects.create(
            organization=self.org_a,
            actor=self.user_a,
            event_type='profile.updated',
            message='Profile updated',
        )
        self.client.force_authenticate(self.user_a)

        response = self.client.get('/api/v1/audit-events/', {
            'organization': self.org_a.id,
            'event_type__startswith': 'envelope',
            'search': 'signer',
            'created_at__gte': (timezone.now() - timezone.timedelta(days=1)).isoformat(),
            'created_at__lte': (timezone.now() + timezone.timedelta(days=1)).isoformat(),
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['event_type'], 'envelope.sent')

    def test_workflow_builder_crud_and_advance_flow(self):
        self.client.force_authenticate(self.user_a)

        create = self.client.post('/api/v1/workflows/', {
            'organization': self.org_a.id,
            'name': 'Contract Review',
            'description': 'Signing and approval',
            'status': WorkflowDefinition.Status.DRAFT,
            'schema': {'steps': ['signer', 'legal']},
        }, format='json')
        workflow_id = create.data['id']
        self.client.post('/api/v1/workflow-stages/', {
            'workflow': workflow_id,
            'key': 'signer',
            'label': 'Signer',
            'stage_type': 'signing',
            'order': 1,
            'config': {},
        }, format='json')
        self.client.post('/api/v1/workflow-stages/', {
            'workflow': workflow_id,
            'key': 'legal',
            'label': 'Legal',
            'stage_type': 'approval',
            'order': 2,
            'config': {},
        }, format='json')
        update = self.client.patch(f'/api/v1/workflows/{workflow_id}/', {
            'description': 'Updated workflow',
        }, format='json')
        activate = self.client.post(f'/api/v1/workflows/{workflow_id}/activate/')
        simulate = self.client.post(f'/api/v1/workflows/{workflow_id}/simulate/')
        run = self.client.post('/api/v1/workflow-runs/', {
            'envelope': self.envelope_a.id,
            'workflow': workflow_id,
            'status': WorkflowRun.Status.RUNNING,
            'current_stage_key': 'signer',
        }, format='json')
        advance = self.client.post(f'/api/v1/workflow-runs/{run.data["id"]}/advance/', {
            'message': 'Move forward',
        }, format='json')
        archive = self.client.post(f'/api/v1/workflows/{workflow_id}/archive/')
        delete = self.client.delete(f'/api/v1/workflows/{workflow_id}/')

        self.assertEqual(create.status_code, status.HTTP_201_CREATED)
        self.assertEqual(update.status_code, status.HTTP_200_OK)
        self.assertEqual(activate.data['status'], WorkflowDefinition.Status.ACTIVE)
        self.assertTrue(simulate.data['valid'])
        self.assertEqual(advance.status_code, status.HTTP_200_OK)
        self.assertEqual(advance.data['current_stage_key'], 'legal')
        self.assertEqual(archive.data['status'], WorkflowDefinition.Status.ARCHIVED)
        self.assertEqual(delete.status_code, status.HTTP_204_NO_CONTENT)

    def test_workflow_builder_replace_stages_and_validation(self):
        self.client.force_authenticate(self.user_a)
        workflow = WorkflowDefinition.objects.create(organization=self.org_a, name='Replacement Flow', created_by=self.user_a)

        invalid_activation = self.client.post(f'/api/v1/workflows/{workflow.id}/activate/')
        replace = self.client.post(f'/api/v1/workflows/{workflow.id}/replace-stages/', {
            'stages': [
                {'label': 'Signer Review', 'stage_type': 'signing', 'order': 1, 'config': {'sla_days': 2}},
                {'label': 'Manager Approval', 'stage_type': 'approval', 'order': 2, 'config': {'assignee': 'manager'}},
            ],
        }, format='json')
        simulate = self.client.post(f'/api/v1/workflows/{workflow.id}/simulate/')
        inactive_run = self.client.post('/api/v1/workflow-runs/', {
            'envelope': self.envelope_a.id,
            'workflow': workflow.id,
            'status': WorkflowRun.Status.RUNNING,
            'current_stage_key': 'signer_review',
        }, format='json')
        activation = self.client.post(f'/api/v1/workflows/{workflow.id}/activate/')
        invalid_stage_run = self.client.post('/api/v1/workflow-runs/', {
            'envelope': self.envelope_a.id,
            'workflow': workflow.id,
            'status': WorkflowRun.Status.RUNNING,
            'current_stage_key': 'missing_stage',
        }, format='json')

        self.assertEqual(invalid_activation.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(replace.status_code, status.HTTP_200_OK)
        self.assertEqual(len(replace.data['stages']), 2)
        self.assertEqual(replace.data['schema']['stages'][0]['key'], 'signer_review')
        self.assertTrue(simulate.data['valid'])
        self.assertEqual(simulate.data['stage_count'], 2)
        self.assertEqual(inactive_run.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(activation.status_code, status.HTTP_200_OK)
        self.assertEqual(activation.data['status'], WorkflowDefinition.Status.ACTIVE)
        self.assertEqual(invalid_stage_run.status_code, status.HTTP_400_BAD_REQUEST)

    def test_viewer_cannot_create_workflow_definition(self):
        self.client.force_authenticate(self.viewer)

        response = self.client.post('/api/v1/workflows/', {
            'organization': self.org_a.id,
            'name': 'Blocked workflow',
            'status': WorkflowDefinition.Status.DRAFT,
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(WorkflowDefinition.objects.filter(name='Blocked workflow').exists())

    def test_admin_impersonation_request_lifecycle_can_issue_audited_session_after_second_admin_approval(self):
        self.client.force_authenticate(self.user_a)

        preview = self.client.post(f'/api/v1/users/{self.viewer.id}/impersonation_preview/', {
            'reason': 'Support troubleshooting',
        }, format='json')
        request_id = preview.data['request']['id']
        self.client.force_authenticate(self.superuser)
        approve = self.client.post(f'/api/v1/impersonation-requests/{request_id}/approve/')
        self.client.force_authenticate(self.user_a)
        start = self.client.post(f'/api/v1/impersonation-requests/{request_id}/start/')

        self.assertEqual(preview.status_code, status.HTTP_200_OK)
        self.assertEqual(approve.status_code, status.HTTP_200_OK)
        self.assertEqual(approve.data['status'], ImpersonationRequest.Status.APPROVED)
        self.assertEqual(start.status_code, status.HTTP_200_OK)
        self.assertIn('access', start.data)
        self.assertEqual(start.data['target_user']['id'], self.viewer.id)
        self.assertTrue(AuditEvent.objects.filter(event_type='admin.impersonation_approved').exists())
        self.assertTrue(AuditEvent.objects.filter(event_type='admin.impersonation_started').exists())

    def test_specialized_settings_are_upserted_per_organization(self):
        self.client.force_authenticate(self.user_a)

        general = self.client.post('/api/v1/general-settings/', {
            'organization': self.org_a.id,
            'default_timezone': 'Pacific/Port_Moresby',
            'support_email': 'support@example.com',
        }, format='json')
        email = self.client.post('/api/v1/email-settings/', {
            'organization': self.org_a.id,
            'from_email': 'hello@example.com',
            'smtp_host': 'smtp.example.com',
            'smtp_port': 2525,
        }, format='json')
        update = self.client.post('/api/v1/general-settings/', {
            'organization': self.org_a.id,
            'default_timezone': 'UTC',
        }, format='json')

        self.assertEqual(general.status_code, status.HTTP_201_CREATED)
        self.assertEqual(email.status_code, status.HTTP_201_CREATED)
        self.assertEqual(update.status_code, status.HTTP_200_OK)
        self.assertEqual(GeneralSettings.objects.filter(organization=self.org_a).count(), 1)
        self.assertEqual(GeneralSettings.objects.get(organization=self.org_a).default_timezone, 'UTC')
        self.assertEqual(EmailSettings.objects.get(organization=self.org_a).smtp_host, 'smtp.example.com')

    def test_oauth_apps_are_tenant_scoped(self):
        OAuthApplication.objects.create(organization=self.org_a, name='Alpha Portal')
        OAuthApplication.objects.create(organization=self.org_b, name='Beta Portal')
        self.client.force_authenticate(self.user_a)

        response = self.client.get('/api/v1/oauth-apps/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.ids_from_paginated_response(response), {OAuthApplication.objects.get(name='Alpha Portal').id})

    def test_oauth_app_secret_rotation_returns_secret_once_and_hashes_storage(self):
        app = OAuthApplication.objects.create(organization=self.org_a, name='Alpha Portal')
        self.client.force_authenticate(self.user_a)

        response = self.client.post(f'/api/v1/oauth-apps/{app.id}/rotate-secret/')
        app.refresh_from_db()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('client_secret', response.data)
        self.assertTrue(response.data['client_secret'].startswith('hm_oauth_'))
        self.assertNotEqual(app.client_secret_hash, response.data['client_secret'])
        self.assertNotIn('client_secret_hash', response.data)

    def test_oauth_app_create_edit_toggle_and_legacy_rotation_contracts(self):
        self.client.force_authenticate(self.user_a)

        create_response = self.client.post('/api/v1/oauth-apps/', {
            'organization': self.org_a.id,
            'name': 'Partner Portal',
            'description': 'Partner integration',
            'redirect_uris': ['https://partner.example.com/oauth/callback'],
            'scopes': ['read', 'signing'],
        }, format='json')
        app = OAuthApplication.objects.get(name='Partner Portal')
        edit_response = self.client.patch(f'/api/v1/oauth-apps/{app.id}/', {
            'description': 'Updated integration',
            'status': OAuthApplication.Status.DISABLED,
        }, format='json')
        legacy_rotate_response = self.client.post(f'/api/v1/oauth-apps/{app.id}/rotate_secret/')
        app.refresh_from_db()

        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        self.assertIn('client_secret', create_response.data)
        self.assertEqual(create_response.data['description'], 'Partner integration')
        self.assertTrue(create_response.data['is_enabled'])
        self.assertEqual(edit_response.status_code, status.HTTP_200_OK)
        self.assertFalse(edit_response.data['is_enabled'])
        self.assertEqual(app.description, 'Updated integration')
        self.assertEqual(app.status, OAuthApplication.Status.DISABLED)
        self.assertEqual(legacy_rotate_response.status_code, status.HTTP_200_OK)
        self.assertTrue(legacy_rotate_response.data['client_secret'].startswith('hm_oauth_'))

    def test_license_creation_seeds_backend_feature_list_for_ui(self):
        self.client.force_authenticate(self.user_a)

        response = self.client.post('/api/v1/license-keys/', {
            'organization': self.org_a.id,
            'key': 'HM-ALPHA-2026',
            'edition': 'Business',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertGreater(len(response.data['features']), 0)
        self.assertIn('name', response.data['features'][0])

    def test_data_residency_policy_is_tenant_scoped(self):
        region = DataResidencyRegion.objects.create(code='us', name='United States')
        policy_a = OrganizationDataResidencyPolicy.objects.create(organization=self.org_a, primary_region=region)
        OrganizationDataResidencyPolicy.objects.create(organization=self.org_b, primary_region=region)
        self.client.force_authenticate(self.user_a)

        response = self.client.get('/api/v1/data-residency-policies/')
        summary_response = self.client.get('/api/v1/data-residency-policies/summary/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.ids_from_paginated_response(response), {policy_a.id})
        self.assertEqual(summary_response.status_code, status.HTTP_200_OK)
        self.assertEqual(summary_response.data['total'], 1)

    def test_data_residency_enforcement_blocks_creation_without_policy(self):
        self.client.force_authenticate(self.user_a)
        AppSetting.objects.create(
            organization=None,
            namespace='compliance',
            key='data_residency',
            value={'require_policy': True},
        )

        blocked_response = self.client.post('/api/v1/documents/', {
            'organization': self.org_a.id,
            'title': 'Blocked Residency Doc',
        }, format='json')
        region = DataResidencyRegion.objects.create(code='pg', name='Papua New Guinea')
        OrganizationDataResidencyPolicy.objects.create(
            organization=self.org_a,
            primary_region=region,
            enforcement_mode=OrganizationDataResidencyPolicy.EnforcementMode.BLOCK,
        )
        allowed_response = self.client.post('/api/v1/documents/', {
            'organization': self.org_a.id,
            'title': 'Allowed Residency Doc',
            'file': SimpleUploadedFile('allowed.pdf', b'%PDF-1.4 demo', content_type='application/pdf'),
        }, format='multipart')

        self.assertEqual(blocked_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(allowed_response.status_code, status.HTTP_201_CREATED)

    def test_scim_provision_user_creates_updates_and_deactivates_membership(self):
        self.client.force_authenticate(self.user_a)

        create_response = self.client.post('/api/v1/scim-identities/provision-user/', {
            'organization': self.org_a.id,
            'externalId': 'scim-123',
            'userName': 'scim.user@example.com',
            'active': True,
            'role': Membership.Role.VIEWER,
        }, format='json')
        deactivate_response = self.client.post('/api/v1/scim-identities/provision-user/', {
            'organization': self.org_a.id,
            'externalId': 'scim-123',
            'userName': 'scim.user@example.com',
            'active': False,
        }, format='json')

        self.assertEqual(create_response.status_code, status.HTTP_200_OK)
        self.assertEqual(create_response.data['membership']['role'], Membership.Role.VIEWER)
        self.assertEqual(deactivate_response.status_code, status.HTTP_200_OK)
        self.assertFalse(deactivate_response.data['membership']['is_active'])
        self.assertEqual(SCIMExternalIdentity.objects.get(external_id='scim-123').user_email, 'scim.user@example.com')

    def test_sso_validate_config_reports_missing_provider_fields(self):
        self.client.force_authenticate(self.user_a)
        connection = SSOConnection.objects.create(
            organization=self.org_a,
            name='OIDC Missing',
            provider_type=SSOConnection.ProviderType.OIDC,
            config={'client_id': 'client-1'},
        )

        response = self.client.get(f'/api/v1/sso-connections/{connection.id}/validate_config/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['ok'])
        self.assertIn('issuer', response.data['missing_fields'])
        self.assertIn('token_endpoint', response.data['missing_fields'])

    def test_search_is_tenant_scoped(self):
        self.client.force_authenticate(self.user_a)

        response = self.client.get('/api/v1/search/?q=Contract')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = {item['title'] for item in response.data['results']}
        self.assertNotIn('Beta Contract', titles)

    def test_evidence_bundle_generate_sets_ready_hash(self):
        bundle = EvidenceBundle.objects.create(envelope=self.envelope_a)
        self.client.force_authenticate(self.user_a)

        response = self.client.post(f'/api/v1/evidence-bundles/{bundle.id}/generate/')
        bundle.refresh_from_db()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(bundle.status, EvidenceBundle.Status.READY)
        self.assertEqual(len(bundle.sha256), 64)

    def test_evidence_bundle_generate_signed_pdf_creates_pdf_artifact(self):
        bundle = EvidenceBundle.objects.create(envelope=self.envelope_a)
        self.client.force_authenticate(self.user_a)

        response = self.client.post(f'/api/v1/evidence-bundles/{bundle.id}/generate-signed-pdf/')
        bundle.refresh_from_db()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(bundle.signed_pdf.name.endswith('.pdf'))
        self.assertEqual(len(bundle.signed_pdf_sha256), 64)
        with bundle.signed_pdf.open('rb') as pdf_file:
            self.assertEqual(pdf_file.read(5), b'%PDF-')

    def test_evidence_bundle_verify_hashes_manifest_and_signed_pdf(self):
        bundle = EvidenceBundle.objects.create(envelope=self.envelope_a)
        self.client.force_authenticate(self.user_a)
        self.client.post(f'/api/v1/evidence-bundles/{bundle.id}/generate/')
        self.client.post(f'/api/v1/evidence-bundles/{bundle.id}/generate-signed-pdf/')

        response = self.client.post(f'/api/v1/evidence-bundles/{bundle.id}/verify/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['valid'])
        self.assertTrue(response.data['manifest']['valid'])
        self.assertTrue(response.data['signed_pdf']['valid'])

    def test_active_legal_hold_blocks_envelope_delete_until_released(self):
        hold = LegalHold.objects.create(organization=self.org_a, name='Litigation hold', status=LegalHold.Status.ACTIVE)
        LegalHoldItem.objects.create(legal_hold=hold, object_type='envelope', object_id=str(self.envelope_a.id))
        self.client.force_authenticate(self.user_a)

        blocked = self.client.delete(f'/api/v1/envelopes/{self.envelope_a.id}/')
        hold.status = LegalHold.Status.RELEASED
        hold.save(update_fields=['status'])
        released = self.client.delete(f'/api/v1/envelopes/{self.envelope_a.id}/')

        self.assertEqual(blocked.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(released.status_code, status.HTTP_204_NO_CONTENT)

    def test_workflow_run_advance_moves_through_stages_and_completes(self):
        workflow = WorkflowDefinition.objects.create(organization=self.org_a, name='Finance Review', status=WorkflowDefinition.Status.ACTIVE)
        WorkflowStage.objects.create(workflow=workflow, key='signer', label='Signer', order=1)
        WorkflowStage.objects.create(workflow=workflow, key='legal', label='Legal Review', order=2)
        run = WorkflowRun.objects.create(envelope=self.envelope_a, workflow=workflow)
        self.client.force_authenticate(self.user_a)

        first = self.client.post(f'/api/v1/workflow-runs/{run.id}/advance/', {'message': 'Start signer stage'}, format='json')
        second = self.client.post(f'/api/v1/workflow-runs/{run.id}/advance/', {'message': 'Move to legal'}, format='json')
        third = self.client.post(f'/api/v1/workflow-runs/{run.id}/advance/', {'message': 'Done'}, format='json')

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(first.data['current_stage_key'], 'signer')
        self.assertEqual(second.data['current_stage_key'], 'legal')
        self.assertEqual(third.data['status'], WorkflowRun.Status.COMPLETED)
        self.assertEqual(WorkflowEvent.objects.filter(run=run).count(), 3)

    def test_viewer_cannot_create_envelope(self):
        self.client.force_authenticate(self.viewer)

        response = self.client.post('/api/v1/envelopes/', {
            'organization': self.org_a.id,
            'name': 'Viewer envelope',
            'sender': self.viewer.id,
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Envelope.objects.filter(name='Viewer envelope').count(), 0)

    def test_custom_role_permission_allows_matching_endpoint_write(self):
        custom_role = Role.objects.create(
            organization=self.org_a,
            name='Envelope Operator',
            permissions=['envelopes:create'],
        )
        Membership.objects.filter(user=self.viewer, organization=self.org_a).update(custom_role=custom_role)
        self.client.force_authenticate(self.viewer)

        response = self.client.post('/api/v1/envelopes/', {
            'organization': self.org_a.id,
            'name': 'Custom role envelope',
            'sender': self.viewer.id,
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Envelope.objects.filter(name='Custom role envelope', sender=self.viewer).exists())

    def test_custom_role_delete_permission_is_required_for_delete(self):
        custom_role = Role.objects.create(
            organization=self.org_a,
            name='Envelope Cleaner',
            permissions=['envelopes:create'],
        )
        Membership.objects.filter(user=self.viewer, organization=self.org_a).update(custom_role=custom_role)
        self.client.force_authenticate(self.viewer)

        denied_response = self.client.delete(f'/api/v1/envelopes/{self.envelope_a.id}/')
        custom_role.permissions = ['envelopes:delete']
        custom_role.save(update_fields=['permissions'])
        allowed_response = self.client.delete(f'/api/v1/envelopes/{self.envelope_a.id}/')

        self.assertEqual(denied_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(allowed_response.status_code, status.HTTP_204_NO_CONTENT)

    def test_send_envelope_queues_signing_email_and_public_link_works(self):
        self.client.force_authenticate(self.user_a)
        self.add_signature_field()

        send_response = self.client.post(f'/api/v1/envelopes/{self.envelope_a.id}/send/')
        message = EmailMessage.objects.get(envelope=self.envelope_a)
        public_response = self.client.get(f'/api/v1/sign/{message.signing_session.token}/')

        self.assertEqual(send_response.status_code, status.HTTP_200_OK)
        self.assertEqual(send_response.data['queued_email_count'], 1)
        self.assertEqual(public_response.status_code, status.HTTP_200_OK)
        self.assertEqual(public_response.data['status'], 'opened')

    def test_email_message_contains_branded_html_and_signing_url(self):
        self.client.force_authenticate(self.user_a)
        self.add_signature_field()

        self.client.post(f'/api/v1/envelopes/{self.envelope_a.id}/send/')
        message = EmailMessage.objects.get(envelope=self.envelope_a)
        response = self.client.get(f'/api/v1/email-messages/{message.id}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('HanMak', message.html_body)
        self.assertIn('Open and sign', message.html_body)
        self.assertIn(message.signing_session.token, response.data['signing_url'])

    def test_deliver_email_message_sends_html_alternative(self):
        self.client.force_authenticate(self.user_a)
        self.add_signature_field()
        self.client.post(f'/api/v1/envelopes/{self.envelope_a.id}/send/')
        message = EmailMessage.objects.get(envelope=self.envelope_a)

        response = self.client.post(f'/api/v1/email-messages/{message.id}/deliver/')
        message.refresh_from_db()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(message.status, EmailMessage.Status.SENT)
        self.assertEqual(len(mail.outbox), 2)
        self.assertTrue(mail.outbox[-1].alternatives)

    def test_public_signing_link_submit_marks_recipient_signed(self):
        self.client.force_authenticate(self.user_a)
        self.add_signature_field()
        self.client.post(f'/api/v1/envelopes/{self.envelope_a.id}/send/')
        message = EmailMessage.objects.get(envelope=self.envelope_a)
        self.client.force_authenticate(user=None)

        response = self.client.post(f'/api/v1/sign/{message.signing_session.token}/', {
            'consent_text': 'I accept.',
            'signature': {'signature_type': 'typed', 'typed_name': 'Alice Signer'},
            'field_values': [{'field_key': 'signature', 'value': 'Alice Signer'}],
        }, format='json')
        message.recipient.refresh_from_db()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(message.recipient.status, 'signed')
        returned_values = {value['field_key']: value['value'] for value in response.data['field_values']}
        self.assertEqual(returned_values.get('signature'), 'Alice Signer')
        self.assertTrue(any(
            value['field_key'] == 'signature' and value['recipient'] == message.recipient_id
            for value in response.data['field_values']
        ))

    def test_email_template_overrides_invite_rendering(self):
        EmailTemplate.objects.create(
            organization=self.org_a,
            kind=EmailMessage.Kind.ENVELOPE_INVITE,
            name='Custom Invite',
            subject_template='Please sign {{ envelope_name }}',
            body_template='Hello {{ recipient_name }}, open {{ signing_url }}',
        )
        self.client.force_authenticate(self.user_a)
        self.add_signature_field()

        self.client.post(f'/api/v1/envelopes/{self.envelope_a.id}/send/')
        message = EmailMessage.objects.get(envelope=self.envelope_a)

        self.assertEqual(message.subject, 'Please sign Alpha NDA')
        self.assertIn('Hello Alice Signer', message.body)

    def test_public_signing_completed_link_returns_readonly_state(self):
        self.client.force_authenticate(self.user_a)
        self.add_signature_field()
        self.client.post(f'/api/v1/envelopes/{self.envelope_a.id}/send/')
        message = EmailMessage.objects.get(envelope=self.envelope_a)
        self.client.force_authenticate(user=None)
        self.client.post(f'/api/v1/sign/{message.signing_session.token}/', {
            'consent_text': 'I accept.',
            'signature': {'signature_type': 'typed', 'typed_name': 'Alice Signer'},
            'field_values': [{'field_key': 'signature', 'value': 'Alice Signer'}],
        }, format='json')

        response = self.client.get(f'/api/v1/sign/{message.signing_session.token}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['is_completed'])
        self.assertIn('completed', response.data['readonly_reason'].lower())

    def test_public_signing_resubmit_does_not_duplicate_completion_email(self):
        self.client.force_authenticate(self.user_a)
        self.add_signature_field()
        self.client.post(f'/api/v1/envelopes/{self.envelope_a.id}/send/')
        message = EmailMessage.objects.get(envelope=self.envelope_a, kind=EmailMessage.Kind.ENVELOPE_INVITE)
        payload = {
            'consent_text': 'I accept.',
            'signature': {'signature_type': 'typed', 'typed_name': 'Alice Signer'},
            'field_values': [{'field_key': 'signature', 'value': 'Alice Signer'}],
        }
        self.client.force_authenticate(user=None)

        first = self.client.post(f'/api/v1/sign/{message.signing_session.token}/', payload, format='json')
        second = self.client.post(f'/api/v1/sign/{message.signing_session.token}/', payload, format='json')

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(EmailMessage.objects.filter(envelope=self.envelope_a, kind=EmailMessage.Kind.COMPLETED).count(), 1)

    def test_public_signing_rejects_fields_assigned_to_another_recipient(self):
        other_recipient = Recipient.objects.create(
            envelope=self.envelope_a,
            name='Bob Signer',
            email='bob-signer@example.com',
            routing_order=2,
        )
        FormField.objects.create(
            envelope=self.envelope_a,
            recipient=other_recipient,
            field_key='bob-signature',
            field_type=FormField.FieldType.SIGNATURE,
            label='Bob Signature',
        )
        self.client.force_authenticate(self.user_a)
        self.client.post(f'/api/v1/envelopes/{self.envelope_a.id}/send/')
        message = EmailMessage.objects.get(envelope=self.envelope_a, recipient=self.recipient_a)
        self.client.force_authenticate(user=None)

        response = self.client.post(f'/api/v1/sign/{message.signing_session.token}/', {
            'consent_text': 'I accept.',
            'signature': {'signature_type': 'typed', 'typed_name': 'Alice Signer'},
            'field_values': [{'field_key': 'bob-signature', 'value': 'Alice Signer'}],
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(EnvelopeFieldValue.objects.filter(field_key='bob-signature').count(), 0)

    def test_public_signing_rejects_missing_required_fields(self):
        FormField.objects.create(
            envelope=self.envelope_a,
            recipient=self.recipient_a,
            field_key='required-name',
            field_type=FormField.FieldType.TEXT,
            label='Required Name',
            required=True,
        )
        self.client.force_authenticate(self.user_a)
        self.client.post(f'/api/v1/envelopes/{self.envelope_a.id}/send/')
        message = EmailMessage.objects.get(envelope=self.envelope_a, recipient=self.recipient_a)
        self.client.force_authenticate(user=None)

        response = self.client.post(f'/api/v1/sign/{message.signing_session.token}/', {
            'consent_text': 'I accept.',
            'signature': {'signature_type': 'typed', 'typed_name': 'Alice Signer'},
            'field_values': [{'field_key': 'required-name', 'value': ''}],
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Required field', response.data['detail'])

    def test_public_signing_accepts_attachment_field_upload(self):
        FormField.objects.create(
            envelope=self.envelope_a,
            recipient=self.recipient_a,
            field_key='supporting-file',
            field_type=FormField.FieldType.ATTACHMENT,
            label='Supporting File',
            required=True,
        )
        self.client.force_authenticate(self.user_a)
        self.client.post(f'/api/v1/envelopes/{self.envelope_a.id}/send/')
        message = EmailMessage.objects.get(envelope=self.envelope_a, recipient=self.recipient_a)
        self.client.force_authenticate(user=None)

        upload = SimpleUploadedFile('supporting-note.txt', b'Attached evidence', content_type='text/plain')
        response = self.client.post(f'/api/v1/sign/{message.signing_session.token}/', {
            'payload': json.dumps({
                'consent_text': 'I accept.',
                'signature': {'signature_type': 'typed', 'typed_name': 'Alice Signer'},
                'field_values': [{'field_key': 'supporting-file', 'value': 'supporting-note.txt', 'metadata': {'field_type': 'attachment'}}],
            }),
            'attachment__supporting-file': upload,
        }, format='multipart')
        saved_value = EnvelopeFieldValue.objects.get(field_key='supporting-file')
        self.client.force_authenticate(self.user_a)
        detail = self.client.get(f'/api/v1/envelopes/{self.envelope_a.id}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(saved_value.attachment.name)
        self.assertEqual(saved_value.metadata['filename'], 'supporting-note.txt')
        self.assertIn('attachment_url', response.data['field_values'][0])
        self.assertTrue(detail.data['field_values'][0]['attachment_url'])

    def test_public_signing_decline_marks_envelope_and_revokes_other_links(self):
        other_recipient = Recipient.objects.create(
            envelope=self.envelope_a,
            name='Second Signer',
            email='second@example.com',
            routing_order=1,
        )
        session = SigningSession.objects.create(envelope=self.envelope_a, recipient=self.recipient_a)
        other_session = SigningSession.objects.create(envelope=self.envelope_a, recipient=other_recipient)

        response = self.client.post(f'/api/v1/sign/{session.token}/', {
            'action': 'decline',
            'reason': 'Terms need revision.',
        }, format='json')
        self.envelope_a.refresh_from_db()
        self.recipient_a.refresh_from_db()
        session.refresh_from_db()
        other_session.refresh_from_db()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(session.status, SigningSession.Status.DECLINED)
        self.assertEqual(other_session.status, SigningSession.Status.REVOKED)
        self.assertEqual(self.recipient_a.status, Recipient.Status.DECLINED)
        self.assertEqual(self.envelope_a.status, Envelope.Status.DECLINED)
        self.assertIn('Terms need revision', self.envelope_a.void_reason)

    def test_recipient_delegation_moves_fields_and_revokes_old_link(self):
        field = FormField.objects.create(
            envelope=self.envelope_a,
            recipient=self.recipient_a,
            field_key='alice-signature',
            field_type=FormField.FieldType.SIGNATURE,
            label='Alice Signature',
        )
        self.client.force_authenticate(self.user_a)
        self.client.post(f'/api/v1/envelopes/{self.envelope_a.id}/send/')
        old_session = SigningSession.objects.get(envelope=self.envelope_a, recipient=self.recipient_a)

        response = self.client.post(f'/api/v1/recipients/{self.recipient_a.id}/delegate/', {
            'name': 'Dana Delegate',
            'email': 'dana@example.com',
            'reason': 'Alice is unavailable.',
        }, format='json')
        self.recipient_a.refresh_from_db()
        field.refresh_from_db()
        old_session.refresh_from_db()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(self.recipient_a.status, Recipient.Status.DELEGATED)
        self.assertEqual(field.recipient_id, response.data['id'])
        self.assertEqual(old_session.status, SigningSession.Status.REVOKED)
        self.assertTrue(EmailMessage.objects.filter(recipient_id=response.data['id']).exists())

        self.client.force_authenticate(user=None)
        revoked_response = self.client.get(f'/api/v1/sign/{old_session.token}/')
        self.assertEqual(revoked_response.status_code, status.HTTP_410_GONE)

    def test_public_signer_can_delegate_own_signing_task(self):
        field = FormField.objects.create(
            envelope=self.envelope_a,
            recipient=self.recipient_a,
            field_key='alice-signature-public',
            field_type=FormField.FieldType.SIGNATURE,
            label='Alice Signature',
        )
        self.client.force_authenticate(self.user_a)
        self.client.post(f'/api/v1/envelopes/{self.envelope_a.id}/send/')
        old_session = SigningSession.objects.get(envelope=self.envelope_a, recipient=self.recipient_a)

        self.client.force_authenticate(user=None)
        response = self.client.post(f'/api/v1/sign/{old_session.token}/', {
            'action': 'delegate',
            'name': 'Public Delegate',
            'email': 'public.delegate@example.com',
            'reason': 'Please sign on my behalf.',
        }, format='json')
        self.recipient_a.refresh_from_db()
        old_session.refresh_from_db()
        field.refresh_from_db()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(self.recipient_a.status, Recipient.Status.DELEGATED)
        self.assertEqual(old_session.status, SigningSession.Status.REVOKED)
        self.assertEqual(field.recipient.email, 'public.delegate@example.com')
        self.assertTrue(EmailMessage.objects.filter(recipient=field.recipient).exists())

    def test_routing_order_invites_next_recipient_after_current_signs(self):
        second_recipient = Recipient.objects.create(
            envelope=self.envelope_a,
            name='Second Signer',
            email='second@example.com',
            routing_order=2,
        )
        self.add_signature_field(field_key='typed_signature')
        self.client.force_authenticate(self.user_a)
        send_response = self.client.post(f'/api/v1/envelopes/{self.envelope_a.id}/send/')

        self.assertEqual(send_response.status_code, status.HTTP_200_OK)
        self.assertEqual(send_response.data['queued_email_count'], 1)
        self.assertFalse(EmailMessage.objects.filter(recipient=second_recipient).exists())

        first_message = EmailMessage.objects.get(recipient=self.recipient_a)
        self.client.force_authenticate(user=None)
        sign_response = self.client.post(f'/api/v1/sign/{first_message.signing_session.token}/', {
            'consent_text': 'I accept.',
            'signature': {'signature_type': 'typed', 'typed_name': 'Alice Signer'},
            'field_values': [{'field_key': 'typed_signature', 'value': 'Alice Signer'}],
        }, format='json')

        self.assertEqual(sign_response.status_code, status.HTTP_200_OK)
        self.assertTrue(EmailMessage.objects.filter(recipient=second_recipient).exists())

    def test_document_process_creates_page_metadata(self):
        self.client.force_authenticate(self.user_a)
        upload = SimpleUploadedFile('agreement.pdf', b'%PDF-1.4 demo', content_type='application/pdf')
        create_response = self.client.post('/api/v1/documents/', {
            'organization': self.org_a.id,
            'title': 'Uploaded Agreement',
            'file': upload,
        }, format='multipart')

        process_response = self.client.post(f"/api/v1/documents/{create_response.data['id']}/process/", {'page_count': 2}, format='json')

        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(process_response.status_code, status.HTTP_200_OK)
        self.assertEqual(process_response.data['status'], 'ready')
        self.assertEqual(DocumentPage.objects.filter(document_id=create_response.data['id']).count(), 2)

    def test_backend_native_template_setup_and_create_envelope_from_template(self):
        self.client.force_authenticate(self.user_a)
        document = Document.objects.create(
            organization=self.org_a,
            uploaded_by=self.user_a,
            title='Native Agreement',
            file=SimpleUploadedFile('native.pdf', b'%PDF-1.4 demo', content_type='application/pdf'),
            status=Document.Status.READY,
            page_count=1,
        )
        template = Template.objects.create(organization=self.org_a, name='Native Template')

        setup_response = self.client.post(f'/api/v1/templates/{template.id}/setup/', {
            'document': document.id,
            'fields': [
                {'field_key': 'party-two-signature', 'field_type': 'signature', 'label': 'Party Two Signature', 'party_key': 'party-2', 'page': 1, 'x': 80, 'y': 600, 'width': 220, 'height': 64},
            ],
        }, format='json')

        self.assertEqual(setup_response.status_code, status.HTTP_201_CREATED)
        create_response = self.client.post('/api/v1/envelopes/create-from-template/', {
            'organization': self.org_a.id,
            'template_version': setup_response.data['id'],
            'name': 'Native Envelope',
            'recipients': [
                {'name': 'Native Signer', 'email': 'native@example.com', 'role': 'signer', 'party_key': 'party-2'},
            ],
        }, format='json')

        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        envelope = Envelope.objects.get(id=create_response.data['id'])
        self.assertEqual(envelope.envelope_documents.count(), 1)
        self.assertEqual(envelope.fields.get().recipient.email, 'native@example.com')

    def test_envelope_summary_and_template_send_validation(self):
        self.client.force_authenticate(self.user_a)
        summary = self.client.get('/api/v1/envelopes/summary/')
        invalid_send = self.client.post(f'/api/v1/envelopes/{self.envelope_a.id}/send/', {}, format='json')

        self.assertEqual(summary.status_code, status.HTTP_200_OK)
        self.assertEqual(summary.data['total'], 1)
        self.assertEqual(summary.data['draft'], 1)
        self.assertEqual(invalid_send.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Add at least one field', str(invalid_send.data))

    def test_document_render_pages_stores_png_preview(self):
        self.client.force_authenticate(self.user_a)
        document = Document.objects.create(
            organization=self.org_a,
            uploaded_by=self.user_a,
            title='Preview Agreement',
            file=SimpleUploadedFile('preview.pdf', b'%PDF-1.4 demo', content_type='application/pdf'),
            status=Document.Status.READY,
            page_count=1,
        )

        response = self.client.post(f'/api/v1/documents/{document.id}/render_pages/', {'width': 320}, format='json')
        page = DocumentPage.objects.get(document=document, page_number=1)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(page.image.name.endswith('.png'))
        self.assertEqual(page.width, 320)

    def test_search_index_rebuild_and_query(self):
        self.client.force_authenticate(self.user_a)
        response = self.client.post('/api/v1/search-index/rebuild/', {'organization': self.org_a.id}, format='json')
        search_response = self.client.get('/api/v1/search/?q=Alpha')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreater(SearchIndex.objects.filter(organization=self.org_a).count(), 0)
        self.assertEqual(search_response.status_code, status.HTTP_200_OK)
        self.assertTrue(search_response.data['results'])
        self.assertIn(search_response.data['ranking']['strategy'], ['weighted_terms', 'postgres_full_text'])
        self.assertIn('rank_details', search_response.data['results'][0])

    def test_search_ranking_prefers_exact_title_matches(self):
        self.client.force_authenticate(self.user_a)
        SearchIndex.objects.create(
            organization=self.org_a,
            object_type='template',
            object_id=101,
            title='Vendor NDA',
            body='A short vendor agreement',
            keywords=['vendor'],
            weight=1,
        )
        SearchIndex.objects.create(
            organization=self.org_a,
            object_type='template',
            object_id=102,
            title='NDA',
            body='Exact title match',
            keywords=['agreement'],
            weight=1,
        )

        response = self.client.get('/api/v1/search/?q=NDA')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['results'][0]['title'], 'NDA')

    def test_search_index_updates_incrementally_on_save_and_delete(self):
        envelope = Envelope.objects.create(
            organization=self.org_a,
            name='Incremental Search Contract',
            sender=self.user_a,
        )

        self.assertTrue(SearchIndex.objects.filter(object_type='envelope', object_id=envelope.id, title='Incremental Search Contract').exists())
        envelope.name = 'Incremental Search Contract Updated'
        envelope.save(update_fields=['name', 'updated_at'])
        self.assertTrue(SearchIndex.objects.filter(object_type='envelope', object_id=envelope.id, title='Incremental Search Contract Updated').exists())
        envelope.delete()
        self.assertFalse(SearchIndex.objects.filter(object_type='envelope', object_id=envelope.id).exists())

    def test_recovery_codes_and_object_permission_records(self):
        self.client.force_authenticate(self.user_a)
        rotate_response = self.client.post('/api/v1/recovery-codes/rotate/')

        self.assertEqual(rotate_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(rotate_response.data['codes']), 10)
        self.assertEqual(RecoveryCode.objects.filter(user=self.user_a).count(), 10)

        from django.contrib.contenttypes.models import ContentType
        content_type = ContentType.objects.get_for_model(Envelope)
        permission_response = self.client.post('/api/v1/object-permissions/', {
            'organization': self.org_a.id,
            'user': self.viewer.id,
            'content_type': content_type.id,
            'object_id': self.envelope_a.id,
            'scope': ObjectPermission.Scope.VIEW,
        }, format='json')

        self.assertEqual(permission_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ObjectPermission.objects.get().granted_by, self.user_a)

    def test_non_admin_cannot_grant_object_permissions(self):
        from django.contrib.contenttypes.models import ContentType
        content_type = ContentType.objects.get_for_model(Envelope)
        self.client.force_authenticate(self.viewer)

        response = self.client.post('/api/v1/object-permissions/', {
            'organization': self.org_a.id,
            'user': self.viewer.id,
            'content_type': content_type.id,
            'object_id': self.envelope_a.id,
            'scope': ObjectPermission.Scope.OWNER,
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(ObjectPermission.objects.count(), 0)

    def test_object_permission_grants_limit_non_admin_object_access(self):
        from django.contrib.contenttypes.models import ContentType
        private_envelope = Envelope.objects.create(
            organization=self.org_a,
            name='Private Alpha Contract',
            sender=self.user_a,
        )
        content_type = ContentType.objects.get_for_model(Envelope)
        ObjectPermission.objects.create(
            organization=self.org_a,
            user=self.viewer,
            content_type=content_type,
            object_id=self.envelope_a.id,
            scope=ObjectPermission.Scope.VIEW,
            granted_by=self.user_a,
        )
        self.client.force_authenticate(self.viewer)

        list_response = self.client.get('/api/v1/envelopes/')
        private_response = self.client.get(f'/api/v1/envelopes/{private_envelope.id}/')

        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.ids_from_paginated_response(list_response), {self.envelope_a.id})
        self.assertEqual(private_response.status_code, status.HTTP_404_NOT_FOUND)

    def test_passkey_begin_registration_returns_serialized_public_key_options(self):
        self.client.force_authenticate(self.user_a)

        response = self.client.post('/api/v1/mfa-devices/passkey_begin_registration/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('challenge', response.data)
        self.assertIn('publicKey', response.data['options'])
        self.assertEqual(MFADevice.objects.filter(user=self.user_a, method=MFADevice.Method.WEBAUTHN).count(), 0)

    def test_public_passkey_login_rejects_missing_account_and_invalid_challenge(self):
        missing = self.client.post('/api/v1/mfa-devices/public_passkey_begin/', {'username': 'nobody@example.com'}, format='json')
        invalid_finish = self.client.post('/api/v1/mfa-devices/public_passkey_finish/', {'challenge': 'missing', 'credential': {}}, format='json')

        self.assertEqual(missing.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(invalid_finish.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertNotIn('access', invalid_finish.data)

    def test_reminder_schedule_and_email_bounce_metadata(self):
        self.client.force_authenticate(self.user_a)
        schedule_response = self.client.post('/api/v1/reminder-schedules/', {
            'organization': self.org_a.id,
            'envelope': self.envelope_a.id,
            'interval_days': 1,
            'max_reminders': 2,
        }, format='json')
        message = EmailMessage.objects.create(
            organization=self.org_a,
            envelope=self.envelope_a,
            recipient=self.recipient_a,
            kind=EmailMessage.Kind.REMINDER,
            to_email='bad@example.com',
            subject='Reminder',
            body='Reminder',
            status=EmailMessage.Status.SENT,
        )
        bounce_response = self.client.post(f'/api/v1/email-messages/{message.id}/mark_bounced/', {'reason': 'Mailbox unavailable'}, format='json')
        summary_response = self.client.get('/api/v1/email-messages/summary/')

        self.assertEqual(schedule_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(ReminderSchedule.objects.get().created_by, self.user_a)
        self.assertEqual(bounce_response.status_code, status.HTTP_200_OK)
        self.assertEqual(bounce_response.data['status'], EmailMessage.Status.FAILED)
        self.assertEqual(summary_response.status_code, status.HTTP_200_OK)
        self.assertEqual(summary_response.data['failed'], 1)
        self.assertEqual(summary_response.data['bounced'], 1)
        self.assertEqual(summary_response.data['active_reminder_schedules'], 1)

    def test_email_messages_filter_by_status_alias_kind_search_and_scope(self):
        self.client.force_authenticate(self.user_a)
        queued = EmailMessage.objects.create(
            organization=self.org_a,
            envelope=self.envelope_a,
            recipient=self.recipient_a,
            kind=EmailMessage.Kind.REMINDER,
            to_email='center@example.com',
            subject='Center renewal reminder',
            body='Please renew.',
            status=EmailMessage.Status.QUEUED,
        )
        sent = EmailMessage.objects.create(
            organization=self.org_a,
            envelope=self.envelope_a,
            recipient=self.recipient_a,
            kind=EmailMessage.Kind.ENVELOPE_INVITE,
            to_email='signer@example.com',
            subject='Signature request',
            body='Please sign.',
            status=EmailMessage.Status.SENT,
        )
        EmailMessage.objects.create(
            organization=self.org_b,
            envelope=self.envelope_b,
            kind=EmailMessage.Kind.REMINDER,
            to_email='other@example.com',
            subject='Other org reminder',
            body='Hidden.',
            status=EmailMessage.Status.QUEUED,
        )

        pending_response = self.client.get('/api/v1/email-messages/?status=pending&kind=reminder&search=center')
        delivered_response = self.client.get('/api/v1/email-messages/?status=delivered')
        hidden_response = self.client.get('/api/v1/email-messages/?search=other')

        self.assertEqual(pending_response.status_code, status.HTTP_200_OK)
        self.assertEqual(delivered_response.status_code, status.HTTP_200_OK)
        self.assertEqual(hidden_response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.ids_from_paginated_response(pending_response), {queued.id})
        self.assertEqual(self.ids_from_paginated_response(delivered_response), {sent.id})
        self.assertEqual(self.ids_from_paginated_response(hidden_response), set())

    def test_public_bounce_webhook_marks_matching_email_failed(self):
        message = EmailMessage.objects.create(
            organization=self.org_a,
            envelope=self.envelope_a,
            recipient=self.recipient_a,
            kind=EmailMessage.Kind.REMINDER,
            to_email='bounce@example.com',
            subject='Reminder',
            body='Reminder',
            status=EmailMessage.Status.SENT,
        )

        response = self.client.post('/api/v1/email/bounce/', {
            'message_id': message.id,
            'event': 'bounce',
            'reason': 'Mailbox rejected the message.',
        }, format='json')
        message.refresh_from_db()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(message.status, EmailMessage.Status.FAILED)
        self.assertEqual(message.bounce_reason, 'Mailbox rejected the message.')

    def test_document_scan_creates_clean_scan_record(self):
        self.client.force_authenticate(self.user_a)
        upload = SimpleUploadedFile('scan.pdf', b'%PDF-1.4 demo', content_type='application/pdf')
        create_response = self.client.post('/api/v1/documents/', {
            'organization': self.org_a.id,
            'title': 'Scan Agreement',
            'file': upload,
        }, format='multipart')

        response = self.client.post(f"/api/v1/documents/{create_response.data['id']}/scan/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], DocumentScan.Status.CLEAN)

    def test_signed_pdf_includes_document_field_placement(self):
        document = Document.objects.create(
            organization=self.org_a,
            uploaded_by=self.user_a,
            title='Placement Agreement',
            file=SimpleUploadedFile('placement.pdf', b'%PDF-1.4 demo', content_type='application/pdf'),
            status=Document.Status.READY,
            page_count=1,
        )
        page = DocumentPage.objects.create(document=document, page_number=1, width=612, height=792)
        EnvelopeDocument.objects.create(envelope=self.envelope_a, document=document)
        FormField.objects.create(
            envelope=self.envelope_a,
            document_page=page,
            field_key='signature',
            field_type=FormField.FieldType.SIGNATURE,
            label='Signature',
            x=80,
            y=640,
            width=220,
            height=64,
        )
        bundle = EvidenceBundle.objects.create(envelope=self.envelope_a)
        self.client.force_authenticate(self.user_a)

        response = self.client.post(f'/api/v1/evidence-bundles/{bundle.id}/generate-signed-pdf/')
        bundle.refresh_from_db()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        with bundle.signed_pdf.open('rb') as pdf_file:
            content = pdf_file.read().decode(errors='ignore')
        self.assertIn('Document Placement Map', content)
        self.assertIn('x=80', content)

    def test_signed_pdf_appends_public_signer_attachment_pages(self):
        document = Document.objects.create(
            organization=self.org_a,
            uploaded_by=self.user_a,
            title='Attachment Agreement',
            status=Document.Status.READY,
            page_count=1,
        )
        DocumentPage.objects.create(document=document, page_number=1, width=1040, height=1471)
        EnvelopeDocument.objects.create(envelope=self.envelope_a, document=document)
        field = FormField.objects.create(
            envelope=self.envelope_a,
            recipient=self.recipient_a,
            field_key='supporting_file',
            field_type=FormField.FieldType.ATTACHMENT,
            label='Supporting File',
            page=1,
            x=80,
            y=900,
            width=360,
            height=80,
        )
        EnvelopeFieldValue.objects.create(
            envelope=self.envelope_a,
            recipient=self.recipient_a,
            field=field,
            field_key='supporting_file',
            value='supporting-note.txt',
            attachment=SimpleUploadedFile('supporting-note.txt', b'Attachment contents', content_type='text/plain'),
            metadata={'filename': 'supporting-note.txt', 'content_type': 'text/plain'},
        )
        bundle = EvidenceBundle.objects.create(envelope=self.envelope_a)
        self.client.force_authenticate(self.user_a)

        response = self.client.post(f'/api/v1/evidence-bundles/{bundle.id}/generate-signed-pdf/')
        bundle.refresh_from_db()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        with bundle.signed_pdf.open('rb') as pdf_file:
            raw_pdf = pdf_file.read()
        try:
            from pypdf import PdfReader
            reader = PdfReader(SimpleUploadedFile('signed.pdf', raw_pdf, content_type='application/pdf'))
            content = '\n'.join(page.extract_text() or '' for page in reader.pages)
        except Exception:
            content = raw_pdf.decode(errors='ignore')
        self.assertIn('Signer Attachment', content)
        self.assertIn('supporting-note.txt', content)

    def test_pdf_field_geometry_uses_saved_page_height_basis(self):
        field = FormField.objects.create(
            envelope=self.envelope_a,
            field_key='billing-cycle',
            field_type=FormField.FieldType.SELECT,
            label='Billing Cycle',
            page=1,
            x=520,
            y=400,
            width=180,
            height=44,
            page_width=1040,
            page_height=800,
        )

        x, y, width, height = field_geometry_for_page(field, page_width=1040, page_height=800)

        self.assertEqual(x, 520)
        self.assertEqual(width, 180)
        self.assertEqual(height, 44)
        self.assertEqual(y, 356)

    def test_pdf_stamping_engine_reports_optional_dependency_state(self):
        self.assertIsInstance(can_stamp_source_pdf(), bool)

    def test_admin_console_backend_actions_cover_mock_admin_surfaces(self):
        self.client.force_authenticate(self.user_a)

        domain_response = self.client.post('/api/v1/organization-domains/', {
            'organization': self.org_a.id,
            'domain': 'alpha.example.com',
        }, format='json')
        verify_response = self.client.post(f"/api/v1/organization-domains/{domain_response.data['id']}/verify/")
        subsidiary_response = self.client.post('/api/v1/organizations/', {
            'parent': self.org_a.id,
            'name': 'Alpha Subsidiary',
            'slug': 'alpha-subsidiary',
        }, format='json')
        team_response = self.client.post('/api/v1/teams/', {
            'organization': self.org_a.id,
            'name': 'Legal Operations',
            'description': 'Routes contracts and approvals.',
        }, format='json')
        role_response = self.client.post('/api/v1/roles/', {
            'organization': self.org_a.id,
            'name': 'Finance Approver',
            'permissions': ['approvals:view'],
        }, format='json')
        invite_response = self.client.post('/api/v1/invitations/', {
            'organization': self.org_a.id,
            'email': 'new.person@example.com',
            'full_name': 'New Person',
            'role': Membership.Role.SIGNER,
            'team': team_response.data['id'],
        }, format='json')
        team_update_response = self.client.patch(f"/api/v1/teams/{team_response.data['id']}/", {
            'name': 'Legal Ops',
            'description': 'Updated routing team.',
        }, format='json')
        role_update_response = self.client.patch(f"/api/v1/roles/{role_response.data['id']}/", {
            'permissions': ['approvals:view', 'approvals:approve'],
        }, format='json')

        self.assertEqual(domain_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(verify_response.status_code, status.HTTP_200_OK)
        self.assertEqual(OrganizationDomain.objects.get().status, OrganizationDomain.Status.VERIFIED)
        self.assertEqual(subsidiary_response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Membership.objects.filter(user=self.user_a, organization_id=subsidiary_response.data['id'], role=Membership.Role.ADMIN).exists())
        self.assertEqual(team_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(role_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(invite_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(team_update_response.status_code, status.HTTP_200_OK)
        self.assertEqual(role_update_response.status_code, status.HTTP_200_OK)
        self.assertEqual(Invitation.objects.get(email='new.person@example.com').invited_by, self.user_a)
        self.assertTrue(AuditEvent.objects.filter(event_type='admin.team_created', organization=self.org_a).exists())
        self.assertTrue(AuditEvent.objects.filter(event_type='admin.team_updated', organization=self.org_a).exists())
        self.assertTrue(AuditEvent.objects.filter(event_type='admin.role_created', organization=self.org_a).exists())
        self.assertTrue(AuditEvent.objects.filter(event_type='admin.role_updated', organization=self.org_a).exists())

        UserSession.objects.create(user=self.viewer, session_key='viewer-session')
        reset_response = self.client.post(f'/api/v1/users/{self.viewer.id}/reset_password/')
        cancel_setup_response = self.client.post(f'/api/v1/users/{self.viewer.id}/cancel_setup_tokens/')
        revoke_response = self.client.post(f'/api/v1/users/{self.viewer.id}/revoke_sessions/')
        suspend_response = self.client.post(f'/api/v1/users/{self.viewer.id}/suspend/')
        self.viewer.refresh_from_db()
        activate_response = self.client.post(f'/api/v1/users/{self.viewer.id}/activate/')

        self.assertEqual(reset_response.status_code, status.HTTP_200_OK)
        self.assertNotIn('token', reset_response.data)
        self.assertEqual(cancel_setup_response.status_code, status.HTTP_200_OK)
        self.assertEqual(cancel_setup_response.data['revoked_count'], 1)
        self.assertEqual(AccountRecoveryRequest.objects.filter(user=self.viewer, status=AccountRecoveryRequest.Status.REVOKED).count(), 1)
        self.assertEqual(AccountRecoveryRequest.objects.filter(user=self.viewer).count(), 1)
        self.assertEqual(revoke_response.data['revoked_count'], 1)
        self.assertEqual(suspend_response.status_code, status.HTTP_200_OK)
        self.assertFalse(self.viewer.is_active)
        self.assertEqual(activate_response.status_code, status.HTTP_200_OK)
        self.assertTrue(type(self.viewer).objects.get(id=self.viewer.id).is_active)
        role_delete_response = self.client.delete(f"/api/v1/roles/{role_response.data['id']}/")
        team_delete_response = self.client.delete(f"/api/v1/teams/{team_response.data['id']}/")
        self.assertEqual(role_delete_response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(team_delete_response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertTrue(AuditEvent.objects.filter(event_type='admin.role_deleted', organization=self.org_a).exists())
        self.assertTrue(AuditEvent.objects.filter(event_type='admin.team_deleted', organization=self.org_a).exists())

    def test_only_super_admin_can_create_root_organization(self):
        self.client.force_authenticate(self.user_a)

        blocked = self.client.post('/api/v1/organizations/', {
            'name': 'Unparented Tenant',
            'slug': 'unparented-tenant',
        }, format='json')

        global_admin = get_user_model().objects.create_user(username='root-admin', password='root-pass')
        Membership.objects.create(user=global_admin, organization=self.org_a, role=Membership.Role.SUPER_ADMIN)
        self.client.force_authenticate(global_admin)
        allowed = self.client.post('/api/v1/organizations/', {
            'name': 'Root Tenant',
            'slug': 'root-tenant',
        }, format='json')

        self.assertEqual(blocked.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(Organization.objects.filter(slug='unparented-tenant').exists())
        self.assertEqual(allowed.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Organization.objects.filter(slug='root-tenant').exists())

    def test_organization_admin_export_transfer_and_deletion_request(self):
        self.client.force_authenticate(self.user_a)
        self.org_a.primary_contact_email = 'owner@alpha.example.com'
        self.org_a.save(update_fields=['primary_contact_email'])

        export_response = self.client.get(f'/api/v1/organizations/{self.org_a.id}/export_data/')
        transfer_response = self.client.post(f'/api/v1/organizations/{self.org_a.id}/transfer_ownership/', {
            'user': self.viewer.id,
        }, format='json')
        deletion_response = self.client.post(f'/api/v1/organizations/{self.org_a.id}/request_deletion/', {
            'reason': 'Tenant cleanup test',
        }, format='json')

        self.assertEqual(export_response.status_code, status.HTTP_200_OK)
        self.assertIn('memberships', export_response.data)
        self.assertEqual(transfer_response.status_code, status.HTTP_200_OK)
        self.assertEqual(Membership.objects.get(user=self.viewer, organization=self.org_a).role, Membership.Role.ADMIN)
        self.assertEqual(deletion_response.status_code, status.HTTP_200_OK)
        self.assertNotIn('confirmation_token_hash', deletion_response.data['deletion_request'])
        deletion_setting = AppSetting.objects.get(organization=self.org_a, namespace='admin', key='deletion_request')
        self.assertEqual(deletion_setting.value['status'], 'pending_confirmation')
        self.assertEqual(deletion_setting.value['confirmation_sent_to'], 'owner@alpha.example.com')
        self.assertTrue(deletion_setting.value['export_recommended'])
        self.assertTrue(EmailMessage.objects.filter(to_email='owner@alpha.example.com', subject__icontains='Confirm deletion').exists())

        token_match = re.search(r'deletion_token=([^&\s]+)', EmailMessage.objects.get(to_email='owner@alpha.example.com').body)
        self.assertIsNotNone(token_match)
        early_confirm = self.client.post(f'/api/v1/organizations/{self.org_a.id}/confirm_deletion_request/', {
            'token': token_match.group(1),
        }, format='json')
        deletion_setting.value = {**deletion_setting.value, 'cooling_off_until': (timezone.now() - timezone.timedelta(minutes=1)).isoformat()}
        deletion_setting.save(update_fields=['value'])
        confirm_response = self.client.post(f'/api/v1/organizations/{self.org_a.id}/confirm_deletion_request/', {
            'token': token_match.group(1),
        }, format='json')

        self.assertEqual(early_confirm.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(confirm_response.status_code, status.HTTP_200_OK)
        self.assertEqual(confirm_response.data['deletion_request']['status'], 'confirmed')
        self.assertNotIn('confirmation_token_hash', confirm_response.data['deletion_request'])

    def test_background_task_and_health_live_admin_endpoints(self):
        self.client.force_authenticate(self.user_a)
        definition = TaskDefinition.objects.create(name='deliver_webhook', queue_name='webhooks')
        failed = TaskRun.objects.create(
            organization=self.org_a,
            definition=definition,
            task_name='deliver_webhook',
            queue_name='webhooks',
            status=TaskRun.Status.FAILED,
            error_message='Timeout',
        )
        TaskRunEvent.objects.create(task_run=failed, event_type='failed', message='Timeout')
        TaskRun.objects.create(
            organization=self.org_a,
            task_name='send_email',
            queue_name='email',
            status=TaskRun.Status.QUEUED,
        )

        summary_response = self.client.get('/api/v1/task-runs/summary/')
        restart_response = self.client.post(f'/api/v1/task-runs/{failed.id}/restart/')
        health_response = self.client.post('/api/v1/health-checks/run_checks/')
        health_summary_response = self.client.get('/api/v1/health-checks/summary/')
        readiness_response = self.client.get('/api/v1/health-checks/deployment-readiness/')
        incident_response = self.client.post('/api/v1/incidents/', {
            'title': 'Email Delivery Delay',
            'severity': Incident.Severity.MINOR,
            'status': Incident.Status.INVESTIGATING,
            'affected_services': ['email'],
            'description': 'Synthetic test incident.',
            'started_at': timezone.now().isoformat(),
        }, format='json')
        resolve_incident_response = self.client.post(f"/api/v1/incidents/{incident_response.data['id']}/resolve/")
        purge_response = self.client.post('/api/v1/task-runs/purge_failed/')

        self.assertEqual(summary_response.status_code, status.HTTP_200_OK)
        self.assertEqual(summary_response.data['failed'], 1)
        self.assertEqual(summary_response.data['queued'], 1)
        self.assertEqual(restart_response.status_code, status.HTTP_200_OK)
        self.assertEqual(restart_response.data['status'], TaskRun.Status.QUEUED)
        self.assertEqual(health_response.status_code, status.HTTP_200_OK)
        self.assertTrue(HealthCheck.objects.filter(name='database').exists())
        self.assertEqual(health_summary_response.status_code, status.HTTP_200_OK)
        self.assertIn('metrics', health_summary_response.data)
        self.assertIn('memory_used_percent', health_summary_response.data['metrics'])
        self.assertIn('apm', health_summary_response.data)
        self.assertEqual(readiness_response.status_code, status.HTTP_200_OK)
        self.assertIn('checks', readiness_response.data)
        self.assertEqual(incident_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resolve_incident_response.status_code, status.HTTP_200_OK)
        self.assertEqual(resolve_incident_response.data['status'], Incident.Status.RESOLVED)
        self.assertEqual(purge_response.status_code, status.HTTP_200_OK)
        self.assertEqual(purge_response.data['purged_count'], 1)

    def test_admin_can_create_managed_user_with_setup_email_or_temporary_password(self):
        self.client.force_authenticate(self.user_a)
        team = Team.objects.create(organization=self.org_a, name='Onboarding')

        setup_response = self.client.post('/api/v1/users/create_managed/', {
            'organization': self.org_a.id,
            'team': team.id,
            'email': 'created@example.com',
            'first_name': 'Created',
            'last_name': 'User',
            'role': Membership.Role.SIGNER,
            'setup_mode': 'setup_email',
        }, format='json')
        temporary_response = self.client.post('/api/v1/users/create_managed/', {
            'organization': self.org_a.id,
            'email': 'temp@example.com',
            'username': 'temp-user',
            'role': Membership.Role.VIEWER,
            'setup_mode': 'temporary_password',
            'temporary_password': 'temporary-pass-123',
        }, format='json')

        self.assertEqual(setup_response.status_code, status.HTTP_201_CREATED)
        self.assertNotIn('setup_token', setup_response.data)
        self.assertEqual(setup_response.data['email'], 'created@example.com')
        self.assertEqual(setup_response.data['membership']['team'], team.id)
        self.assertTrue(AccountRecoveryRequest.objects.filter(user_id=setup_response.data['id']).exists())
        self.assertTrue(EmailMessage.objects.filter(to_email='created@example.com', kind=EmailMessage.Kind.INVITATION).exists())

        self.assertEqual(temporary_response.status_code, status.HTTP_201_CREATED)
        created_temp_user = type(self.user_a).objects.get(email='temp@example.com')
        self.assertTrue(created_temp_user.check_password('temporary-pass-123'))
        self.assertFalse(AccountRecoveryRequest.objects.filter(user=created_temp_user).exists())
        self.assertTrue(AuditEvent.objects.filter(event_type='admin.user_created', organization=self.org_a).exists())

    def test_setup_token_completion_and_invitation_acceptance_flow(self):
        self.client.force_authenticate(self.user_a)
        setup_response = self.client.post('/api/v1/users/create_managed/', {
            'organization': self.org_a.id,
            'email': 'setup@example.com',
            'setup_mode': 'setup_email',
        }, format='json')
        self.assertNotIn('setup_token', setup_response.data)
        setup_token = self.token_from_latest_email('setup@example.com')
        self.client.force_authenticate(None)

        inspect_response = self.client.post('/api/v1/account-recovery/inspect_token/', {'token': setup_token}, format='json')
        complete_response = self.client.post('/api/v1/account-recovery/complete/', {
            'token': setup_token,
            'password': 'setup-pass-123',
        }, format='json')

        setup_user = get_user_model().objects.get(email='setup@example.com')
        self.assertEqual(inspect_response.status_code, status.HTTP_200_OK)
        self.assertEqual(complete_response.status_code, status.HTTP_200_OK)
        self.assertTrue(setup_user.check_password('setup-pass-123'))

        self.client.force_authenticate(self.user_a)
        invite_response = self.client.post('/api/v1/invitations/', {
            'organization': self.org_a.id,
            'email': 'invitee@example.com',
            'full_name': 'Invitee User',
            'role': Membership.Role.VIEWER,
        }, format='json')
        self.assertNotIn('token', invite_response.data)
        resend_response = self.client.post(f"/api/v1/invitations/{invite_response.data['id']}/resend/")
        self.assertEqual(resend_response.status_code, status.HTTP_200_OK)
        self.assertNotIn('token', resend_response.data)
        invite_token = self.token_from_latest_email('invitee@example.com')
        self.client.force_authenticate(None)
        invite_inspect_response = self.client.post('/api/v1/invitations/inspect_token/', {'token': invite_token}, format='json')
        accept_response = self.client.post('/api/v1/invitations/accept/', {
            'token': invite_token,
            'password': 'invite-pass-123',
            'username': 'invitee',
        }, format='json')

        invitee = get_user_model().objects.get(email='invitee@example.com')
        self.assertEqual(invite_inspect_response.status_code, status.HTTP_200_OK)
        self.assertEqual(accept_response.status_code, status.HTTP_200_OK)
        self.assertTrue(invitee.check_password('invite-pass-123'))
        self.assertEqual(Membership.objects.get(user=invitee, organization=self.org_a).role, Membership.Role.VIEWER)
        self.assertEqual(Invitation.objects.get(email='invitee@example.com').status, Invitation.Status.ACCEPTED)

    def test_invitation_acceptance_rejects_duplicate_username_without_crashing(self):
        self.client.force_authenticate(self.user_a)
        invite_response = self.client.post('/api/v1/invitations/', {
            'organization': self.org_a.id,
            'email': 'duplicate-name@example.com',
            'role': Membership.Role.VIEWER,
        }, format='json')
        invite_token = self.token_from_latest_email('duplicate-name@example.com')
        self.client.force_authenticate(None)

        response = self.client.post('/api/v1/invitations/accept/', {
            'token': invite_token,
            'password': 'invite-pass-123',
            'username': self.user_a.username,
        }, format='json')

        self.assertEqual(invite_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('username', response.data)
        self.assertFalse(get_user_model().objects.filter(email='duplicate-name@example.com').exists())

    def test_branding_logo_and_health_status_controls(self):
        self.client.force_authenticate(self.user_a)
        logo = SimpleUploadedFile('logo.png', b'fake-logo', content_type='image/png')

        logo_response = self.client.post(f'/api/v1/organizations/{self.org_a.id}/upload_logo/', {'logo': logo}, format='multipart')
        branding_response = self.client.patch(f'/api/v1/organizations/{self.org_a.id}/branding/', {
            'brand_name': 'Alpha Sign',
            'primary_color': '#123456',
        }, format='json')
        thresholds_response = self.client.patch('/api/v1/health-checks/alert_thresholds/', {'queue_depth': 50}, format='json')
        subscription_response = self.client.post('/api/v1/health-checks/alert_subscriptions/', {
            'email': 'ops@example.com',
            'events': ['degraded', 'recovered'],
        }, format='json')
        publish_response = self.client.post('/api/v1/health-checks/publish_status/')
        public_response = self.client.get('/api/v1/health-checks/public_status/')

        self.assertEqual(logo_response.status_code, status.HTTP_200_OK)
        self.assertIn('logo', Organization.objects.get(id=self.org_a.id).logo.name)
        self.assertEqual(branding_response.status_code, status.HTTP_200_OK)
        self.assertEqual(branding_response.data['value']['brand_name'], 'Alpha Sign')
        self.assertEqual(thresholds_response.status_code, status.HTTP_200_OK)
        self.assertEqual(thresholds_response.data['value']['queue_depth'], 50)
        self.assertEqual(subscription_response.status_code, status.HTTP_200_OK)
        self.assertEqual(subscription_response.data['value']['subscriptions'][0]['email'], 'ops@example.com')
        self.assertEqual(publish_response.status_code, status.HTTP_200_OK)
        self.assertEqual(public_response.status_code, status.HTTP_200_OK)

    def test_health_status_change_queues_alert_subscription_email(self):
        self.client.force_authenticate(self.user_a)
        self.client.post('/api/v1/health-checks/alert_subscriptions/', {
            'email': 'ops@example.com',
            'events': ['degraded', 'recovered'],
        }, format='json')
        HealthCheck.objects.create(name='api', status='healthy')
        TaskRun.objects.create(
            organization=self.org_a,
            task_name='failed_task',
            queue_name='default',
            status=TaskRun.Status.FAILED,
        )

        response = self.client.post('/api/v1/health-checks/run_checks/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'degraded')
        self.assertEqual(response.data['queued_alerts'], 1)
        self.assertTrue(EmailMessage.objects.filter(to_email='ops@example.com', subject__icontains='degraded').exists())

    def test_non_admin_cannot_write_admin_console_resources(self):
        self.client.force_authenticate(self.viewer)

        responses = [
            self.client.post('/api/v1/organization-domains/', {'organization': self.org_a.id, 'domain': 'blocked.example.com'}, format='json'),
            self.client.post('/api/v1/teams/', {'organization': self.org_a.id, 'name': 'Blocked'}, format='json'),
            self.client.post('/api/v1/roles/', {'organization': self.org_a.id, 'name': 'Blocked'}, format='json'),
            self.client.post('/api/v1/invitations/', {'organization': self.org_a.id, 'email': 'blocked@example.com'}, format='json'),
            self.client.post('/api/v1/users/create_managed/', {'organization': self.org_a.id, 'email': 'blocked@example.com'}, format='json'),
            self.client.post('/api/v1/app-settings/', {'organization': self.org_a.id, 'namespace': 'smtp', 'key': 'host', 'value': {'host': 'smtp.example.com'}}, format='json'),
            self.client.post('/api/v1/feature-flags/', {'organization': self.org_a.id, 'key': 'blocked_feature', 'is_enabled': True}, format='json'),
            self.client.post('/api/v1/api-keys/', {'organization': self.org_a.id, 'name': 'Blocked key', 'scopes': ['envelopes:read']}, format='json'),
            self.client.post('/api/v1/webhook-endpoints/', {'organization': self.org_a.id, 'name': 'Blocked hook', 'target_url': 'https://example.com/hook', 'events': ['envelope.completed']}, format='json'),
            self.client.post('/api/v1/legal-holds/', {'organization': self.org_a.id, 'name': 'Blocked hold', 'matter': 'Matter'}, format='json'),
            self.client.post('/api/v1/payment-portal-sessions/', {'organization': self.org_a.id, 'session_type': 'portal', 'url': 'https://billing.example/session'}, format='json'),
        ]

        self.assertEqual([item.status_code for item in responses], [
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_403_FORBIDDEN,
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_400_BAD_REQUEST,
        ])
        self.assertFalse(OrganizationDomain.objects.filter(domain='blocked.example.com').exists())
        self.assertFalse(Team.objects.filter(name='Blocked').exists())
        self.assertFalse(Role.objects.filter(name='Blocked').exists())
        self.assertFalse(Invitation.objects.filter(email='blocked@example.com').exists())
        self.assertFalse(type(self.user_a).objects.filter(email='blocked@example.com').exists())
        self.assertFalse(AppSetting.objects.filter(namespace='smtp', key='host').exists())
        self.assertFalse(FeatureFlag.objects.filter(key='blocked_feature').exists())

    def test_release_control_seed_review_and_release_flow(self):
        self.client.force_authenticate(self.user_a)

        seed = self.client.post('/api/v1/feature-flags/seed-defaults/', {'organization': self.org_a.id}, format='json')
        workflow_flag = FeatureFlag.objects.get(organization=self.org_a, key='workflow_builder')
        review = self.client.post(f'/api/v1/feature-flags/{workflow_flag.id}/review/', {
            'qa_checklist': [
                {'label': 'Backend endpoint verified', 'done': True},
                {'label': 'Frontend flow verified', 'done': True},
            ],
            'release_notes': 'Workflow builder checked for beta release.',
        }, format='json')
        release = self.client.post(f'/api/v1/feature-flags/{workflow_flag.id}/release/', {
            'release_stage': FeatureFlag.ReleaseStage.RELEASED,
            'rollout_percentage': 100,
        }, format='json')
        summary = self.client.get('/api/v1/feature-flags/summary/')
        workflow_flag.refresh_from_db()

        self.assertEqual(seed.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(seed.data['total'], 1)
        self.assertEqual(workflow_flag.module, FeatureFlag.Module.WORKFLOW)
        self.assertEqual(review.status_code, status.HTTP_200_OK)
        self.assertTrue(review.data['qa_checklist'][0]['done'])
        self.assertEqual(release.status_code, status.HTTP_200_OK)
        self.assertTrue(workflow_flag.is_enabled)
        self.assertEqual(workflow_flag.release_stage, FeatureFlag.ReleaseStage.RELEASED)
        self.assertEqual(workflow_flag.rollout_percentage, 100)
        self.assertTrue(summary.data['modules'])
        self.assertTrue(AuditEvent.objects.filter(event_type='admin.feature_released', organization=self.org_a).exists())

    def test_app_setting_create_upserts_existing_setting(self):
        self.client.force_authenticate(self.user_a)

        response = self.client.post('/api/v1/app-settings/', {
            'organization': None,
            'namespace': 'compliance',
            'key': 'data_residency',
            'value': {'require_policy': False},
        }, format='json')
        update = self.client.post('/api/v1/app-settings/', {
            'organization': None,
            'namespace': 'compliance',
            'key': 'data_residency',
            'value': {'require_policy': True},
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(update.status_code, status.HTTP_200_OK)
        self.assertEqual(AppSetting.objects.filter(organization=None, namespace='compliance', key='data_residency').count(), 1)
        self.assertTrue(AppSetting.objects.get(organization=None, namespace='compliance', key='data_residency').value['require_policy'])

    def test_new_admin_surfaces_are_routed_and_tenant_scoped(self):
        self.client.force_authenticate(self.user_a)
        invoice = Invoice.objects.create(
            organization=self.org_a,
            invoice_number='INV-ALPHA-001',
            amount='299.00',
            currency='USD',
            status=Invoice.Status.PAID,
            period_start=timezone.now().date(),
            period_end=timezone.now().date(),
        )
        PaymentMethod.objects.create(
            organization=self.org_a,
            method_type=PaymentMethod.MethodType.CARD,
            brand='visa',
            last4='4242',
            exp_month=9,
            exp_year=2028,
        )

        invoices = self.client.get('/api/v1/invoices/')
        payment_methods = self.client.get('/api/v1/payment-methods/')

        self.assertEqual(invoices.status_code, status.HTTP_200_OK)
        self.assertEqual(payment_methods.status_code, status.HTTP_200_OK)
        self.assertEqual(self.ids_from_paginated_response(invoices), {invoice.id})
        self.assertEqual(payment_methods.data['results'][0]['last4'], '4242')

    def test_super_admin_membership_can_manage_cross_organization_billing_and_licenses(self):
        global_admin = get_user_model().objects.create_user(username='global-admin', password='global-pass')
        Membership.objects.create(user=global_admin, organization=self.org_a, role=Membership.Role.SUPER_ADMIN)
        plan = Plan.objects.create(name='Enterprise', code='enterprise', monthly_price='499.00', features=['All modules'])
        self.client.force_authenticate(global_admin)

        organizations = self.client.get('/api/v1/organizations/')
        subscription = self.client.post('/api/v1/subscriptions/', {
            'organization': self.org_b.id,
            'plan': plan.id,
            'status': Subscription.Status.ACTIVE,
            'current_period_start': timezone.now().date(),
            'current_period_end': timezone.now().date() + timezone.timedelta(days=30),
        }, format='json')
        license_key = self.client.post('/api/v1/license-keys/', {
            'organization': self.org_b.id,
            'key': 'HM-GLOBAL-BETA-001',
            'edition': 'Enterprise',
            'status': 'active',
            'features': [{'name': 'All modules', 'enabled': True}],
        }, format='json')

        self.assertEqual(organizations.status_code, status.HTTP_200_OK)
        self.assertIn(self.org_b.id, self.ids_from_paginated_response(organizations))
        self.assertEqual(subscription.status_code, status.HTTP_201_CREATED)
        self.assertEqual(license_key.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Subscription.objects.filter(organization=self.org_b, plan=plan).exists())
        self.assertTrue(LicenseKey.objects.filter(organization=self.org_b, key='HM-GLOBAL-BETA-001').exists())

    def test_envelope_defaults_and_digest_content_preferences_persist(self):
        self.client.force_authenticate(self.user_a)

        settings_response = self.client.post('/api/v1/general-settings/', {
            'organization': self.org_a.id,
            'application_name': 'HanMak',
            'default_envelope_expiration_days': 14,
            'default_reminder_schedule': 'daily',
            'default_signing_order': 'parallel',
            'require_email_verification': False,
            'allow_mobile_signing': True,
            'enable_completion_certificates': True,
            'send_audit_trail_on_completion': False,
            'allow_bulk_send': False,
        }, format='json')
        envelope_response = self.client.post('/api/v1/envelopes/', {
            'organization': self.org_a.id,
            'name': 'Defaulted Envelope',
        }, format='json')
        profile_response = self.client.patch('/api/v1/profiles/me/', {
            'preferences': {
                'digest_frequency': 'weekly_monday',
                'digest_include_pending_signatures': False,
                'digest_include_overdue': True,
                'digest_include_completed': False,
                'digest_include_team_activity': True,
            },
        }, format='json')

        self.assertEqual(settings_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(settings_response.data['default_envelope_expiration_days'], 14)
        self.assertEqual(settings_response.data['default_signing_order'], 'parallel')
        self.assertEqual(envelope_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(envelope_response.data['due_date'], (timezone.now().date() + timezone.timedelta(days=14)).isoformat())
        self.assertEqual(profile_response.status_code, status.HTTP_200_OK)
        self.assertFalse(profile_response.data['preferences']['digest_include_pending_signatures'])
        self.assertTrue(profile_response.data['preferences']['digest_include_team_activity'])

    def test_billing_checkout_and_portal_sessions_are_created(self):
        self.client.force_authenticate(self.user_a)
        plan = Plan.objects.create(name='Pro', code='pro', monthly_price='99.00', features=['api'], limits={'users': 10})

        checkout = self.client.post('/api/v1/subscriptions/checkout-session/', {
            'organization': self.org_a.id,
            'plan': plan.id,
        }, format='json')
        portal = self.client.post('/api/v1/subscriptions/billing-portal/', {
            'organization': self.org_a.id,
        }, format='json')

        self.assertEqual(checkout.status_code, status.HTTP_201_CREATED)
        self.assertEqual(checkout.data['session_type'], PaymentPortalSession.SessionType.CHECKOUT)
        self.assertIn('session=chk_', checkout.data['url'])
        self.assertEqual(portal.status_code, status.HTTP_201_CREATED)
        self.assertEqual(portal.data['session_type'], PaymentPortalSession.SessionType.PORTAL)
        self.assertEqual(PaymentPortalSession.objects.filter(organization=self.org_a).count(), 2)

    def test_payment_provider_webhook_reconciles_checkout_subscription(self):
        plan = Plan.objects.create(name='Team', code='team', monthly_price='49.00', features=['workflow'], limits={'users': 5})
        session = PaymentPortalSession.objects.create(
            organization=self.org_a,
            plan=plan,
            session_type=PaymentPortalSession.SessionType.CHECKOUT,
            provider='stripe',
            provider_session_id='cs_test_alpha',
            url='https://checkout.example/cs_test_alpha',
            metadata={'plan_code': plan.code},
            expires_at=timezone.now() + timezone.timedelta(hours=1),
        )
        payload = {
            'id': 'evt_checkout_alpha',
            'type': 'checkout.session.completed',
            'data': {
                'object': {
                    'id': 'cs_test_alpha',
                    'status': 'complete',
                    'metadata': {'organization_id': self.org_a.id, 'plan_code': plan.code},
                },
            },
        }

        response = self.client.post('/api/v1/billing/payment-webhook/?provider=stripe', payload, format='json')
        duplicate = self.client.post('/api/v1/billing/payment-webhook/?provider=stripe', payload, format='json')
        session.refresh_from_db()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['ok'])
        self.assertEqual(duplicate.data['duplicate'], True)
        self.assertEqual(session.status, PaymentPortalSession.Status.COMPLETED)
        self.assertEqual(PaymentWebhookEvent.objects.get(provider_event_id='evt_checkout_alpha').status, PaymentWebhookEvent.Status.PROCESSED)
        self.assertEqual(Subscription.objects.get(organization=self.org_a).plan, plan)

    @override_settings(HANMAK_PAYMENT_WEBHOOK_SECRET='secret-value')
    def test_payment_webhook_rejects_missing_generic_signature(self):
        response = self.client.post('/api/v1/billing/payment-webhook/?provider=mock', {
            'event_type': 'checkout.completed',
            'organization_id': self.org_a.id,
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('signature', response.data['detail'].lower())

    def test_identity_configuration_endpoints_are_routed(self):
        self.client.force_authenticate(self.user_a)

        ldap_response = self.client.post('/api/v1/ldap-connections/', {
            'organization': self.org_a.id,
            'host': 'ldap.example.com',
            'port': 389,
            'bind_dn': 'cn=hanmak,dc=example,dc=com',
            'bind_password': 'secret',
            'base_dn': 'dc=example,dc=com',
            'user_filter': '(objectClass=person)',
            'email_attribute': 'mail',
            'is_enabled': True,
        }, format='json')
        jit_response = self.client.post('/api/v1/jit-settings/', {
            'organization': self.org_a.id,
            'is_enabled': True,
            'auto_create_user': True,
            'update_on_login': True,
            'default_role': Membership.Role.SIGNER,
            'allowed_domains': ['example.com'],
            'require_domain_match': True,
        }, format='json')
        social_response = self.client.post('/api/v1/social-providers/', {
            'organization': self.org_a.id,
            'provider_type': SocialProvider.ProviderType.GOOGLE,
            'client_id': 'google-client',
            'client_secret': 'google-secret',
            'allowed_domains': ['example.com'],
            'is_enabled': True,
        }, format='json')

        self.assertEqual(ldap_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(jit_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(social_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(LDAPConnection.objects.get(organization=self.org_a).bind_password, 'secret')
        self.assertTrue(JITProvisioningSettings.objects.get(organization=self.org_a).is_enabled)
        self.assertEqual(SocialProvider.objects.get(organization=self.org_a).client_secret, 'google-secret')

    def test_incident_endpoint_lists_and_resolves_incidents(self):
        self.client.force_authenticate(self.user_a)
        incident = Incident.objects.create(
            title='Email delay',
            severity=Incident.Severity.MINOR,
            status=Incident.Status.INVESTIGATING,
            affected_services=['email'],
            description='Provider latency is elevated.',
            started_at=timezone.now(),
        )

        list_response = self.client.get('/api/v1/incidents/')
        resolve_response = self.client.post(f'/api/v1/incidents/{incident.id}/resolve/')

        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.ids_from_paginated_response(list_response), {incident.id})
        self.assertEqual(resolve_response.status_code, status.HTTP_200_OK)
        self.assertEqual(resolve_response.data['status'], Incident.Status.RESOLVED)
