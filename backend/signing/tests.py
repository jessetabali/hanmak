from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import Membership, Organization
from approvals.models import ApprovalRequest
from envelopes.models import Envelope, FormField, Recipient
from evidence.pdf import field_value_record
from signing.models import EnvelopeFieldValue, SigningSession
from workflow.models import WorkflowDefinition, WorkflowRun, WorkflowStage


User = get_user_model()


class PublicSigningDownloadViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='alice', password='pass')
        self.org = Organization.objects.create(name='Test Org', slug='test-org')
        Membership.objects.create(user=self.user, organization=self.org, role=Membership.Role.ADMIN)

        self.envelope = Envelope.objects.create(
            organization=self.org,
            name='Test NDA',
            sender=self.user,
            status=Envelope.Status.COMPLETED,
        )
        self.recipient = Recipient.objects.create(
            envelope=self.envelope,
            name='Bob Signer',
            email='bob@example.com',
        )
        self.session = SigningSession.objects.create(
            envelope=self.envelope,
            recipient=self.recipient,
        )

    def _download_url(self, token=None):
        token = token or self.session.token
        return f'/api/v1/sign/{token}/download/'

    def test_bad_token_returns_404(self):
        response = self.client.get(self._download_url('bad-token-xyz'))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_draft_envelope_returns_403(self):
        self.envelope.status = Envelope.Status.DRAFT
        self.envelope.save(update_fields=['status'])

        with patch('evidence.pdf.build_signed_pdf', return_value=(b'%PDF', {})):
            response = self.client.get(self._download_url())

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_sent_envelope_returns_403(self):
        self.envelope.status = Envelope.Status.SENT
        self.envelope.save(update_fields=['status'])

        with patch('evidence.pdf.build_signed_pdf', return_value=(b'%PDF', {})):
            response = self.client.get(self._download_url())

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_completed_envelope_returns_pdf(self):
        self.envelope.status = Envelope.Status.COMPLETED
        self.envelope.save(update_fields=['status'])

        with patch('evidence.pdf.build_signed_pdf', return_value=(b'%PDF-fake', {})):
            response = self.client.get(self._download_url())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response['Content-Type'], 'application/pdf')
        self.assertIn('attachment', response['Content-Disposition'])

    def test_partially_signed_envelope_returns_pdf(self):
        self.envelope.status = Envelope.Status.PARTIALLY_SIGNED
        self.envelope.save(update_fields=['status'])

        with patch('evidence.pdf.build_signed_pdf', return_value=(b'%PDF-partial', {})):
            response = self.client.get(self._download_url())

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_no_auth_required(self):
        self.client.logout()
        with patch('evidence.pdf.build_signed_pdf', return_value=(b'%PDF', {})):
            response = self.client.get(self._download_url())
        self.assertNotEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertNotEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_pdf_generation_error_returns_500(self):
        with patch('evidence.pdf.build_signed_pdf', side_effect=RuntimeError('pdf broken')):
            response = self.client.get(self._download_url())

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertIn('pdf broken', response.data['detail'])


class PublicSigningApprovalTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='alice', password='pass')
        self.org = Organization.objects.create(name='Approval Org', slug='approval-org')
        Membership.objects.create(user=self.user, organization=self.org, role=Membership.Role.ADMIN)
        self.envelope = Envelope.objects.create(
            organization=self.org,
            name='Approval Packet',
            sender=self.user,
            status=Envelope.Status.PARTIALLY_SIGNED,
        )
        self.approver = Recipient.objects.create(
            envelope=self.envelope,
            name='Legal Reviewer',
            email='legal@example.com',
            role=Recipient.Role.APPROVER,
            party_key='legal',
            status=Recipient.Status.SENT,
        )
        self.session = SigningSession.objects.create(
            envelope=self.envelope,
            recipient=self.approver,
        )
        self.workflow = WorkflowDefinition.objects.create(
            organization=self.org,
            name='Legal Approval Flow',
            status=WorkflowDefinition.Status.ACTIVE,
            created_by=self.user,
        )
        WorkflowStage.objects.create(workflow=self.workflow, key='legal', label='Legal Approval', stage_type='approval', order=1)
        self.run = WorkflowRun.objects.create(
            envelope=self.envelope,
            workflow=self.workflow,
            status=WorkflowRun.Status.RUNNING,
            current_stage_key='legal',
        )
        self.approval = ApprovalRequest.objects.create(
            envelope=self.envelope,
            approver=self.user,
            recipient=self.approver,
            approval_role='legal',
            status=ApprovalRequest.Status.PENDING,
        )

    @patch('approvals.services.deliver_email_message_task.apply_async')
    def test_approver_public_submit_approves_request_and_workflow(self, _mock_apply_async):
        response = self.client.post(
            f'/api/v1/sign/{self.session.token}/',
            {'field_values': [], 'approval_notes': 'Looks good.'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.approval.refresh_from_db()
        self.approver.refresh_from_db()
        self.envelope.refresh_from_db()
        self.run.refresh_from_db()
        self.assertEqual(self.approval.status, ApprovalRequest.Status.APPROVED)
        self.assertIsNotNone(self.approval.decided_at)
        self.assertEqual(self.approver.status, Recipient.Status.SIGNED)
        self.assertEqual(self.envelope.status, Envelope.Status.COMPLETED)
        self.assertEqual(self.run.status, WorkflowRun.Status.COMPLETED)

    def test_approver_public_decline_rejects_request(self):
        response = self.client.post(
            f'/api/v1/sign/{self.session.token}/',
            {'action': 'decline', 'reason': 'Clause needs review.'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.approval.refresh_from_db()
        self.envelope.refresh_from_db()
        self.assertEqual(self.approval.status, ApprovalRequest.Status.REJECTED)
        self.assertEqual(self.envelope.status, Envelope.Status.DECLINED)


class PublicSigningFieldIdentityTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='alice', password='pass')
        self.org = Organization.objects.create(name='Fields Org', slug='fields-org')
        Membership.objects.create(user=self.user, organization=self.org, role=Membership.Role.ADMIN)
        self.envelope = Envelope.objects.create(
            organization=self.org,
            name='Signature Packet',
            sender=self.user,
            status=Envelope.Status.SENT,
        )
        self.recipient = Recipient.objects.create(
            envelope=self.envelope,
            name='Alice Signer',
            email='alice.signer@example.com',
            status=Recipient.Status.SENT,
        )
        self.session = SigningSession.objects.create(
            envelope=self.envelope,
            recipient=self.recipient,
        )

    @patch('signing.views.deliver_email_message_task.apply_async')
    def test_submit_uses_field_id_when_signature_keys_are_duplicated(self, _mock_apply_async):
        first_signature = FormField.objects.create(
            envelope=self.envelope,
            recipient=self.recipient,
            field_key='signature',
            field_type=FormField.FieldType.SIGNATURE,
            label='Signature',
            required=True,
        )
        second_signature = FormField.objects.create(
            envelope=self.envelope,
            recipient=self.recipient,
            field_key='signature',
            field_type=FormField.FieldType.SIGNATURE,
            label='Second Signature',
            required=True,
            y=80,
        )

        response = self.client.post(
            f'/api/v1/sign/{self.session.token}/',
            {
                'field_values': [
                    {'field': first_signature.id, 'field_key': 'signature', 'value': 'First mark'},
                    {'field': second_signature.id, 'field_key': 'signature', 'value': 'Second mark'},
                ],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(EnvelopeFieldValue.objects.filter(envelope=self.envelope, field_key='signature').count(), 2)
        self.assertEqual(EnvelopeFieldValue.objects.get(field=first_signature).value, 'First mark')
        self.assertEqual(EnvelopeFieldValue.objects.get(field=second_signature).value, 'Second mark')

    def test_pdf_field_lookup_prefers_exact_field_and_recipient(self):
        other_recipient = Recipient.objects.create(
            envelope=self.envelope,
            name='Bob Signer',
            email='bob.signer@example.com',
        )
        first_signature = FormField.objects.create(
            envelope=self.envelope,
            recipient=self.recipient,
            field_key='signature',
            field_type=FormField.FieldType.SIGNATURE,
            label='Alice Signature',
        )
        second_signature = FormField.objects.create(
            envelope=self.envelope,
            recipient=other_recipient,
            field_key='signature',
            field_type=FormField.FieldType.SIGNATURE,
            label='Bob Signature',
        )
        EnvelopeFieldValue.objects.create(
            envelope=self.envelope,
            recipient=self.recipient,
            field=first_signature,
            field_key='signature',
            value='Alice mark',
        )
        EnvelopeFieldValue.objects.create(
            envelope=self.envelope,
            recipient=other_recipient,
            field=second_signature,
            field_key='signature',
            value='Bob mark',
        )

        self.assertEqual(field_value_record(self.envelope, first_signature).value, 'Alice mark')
        self.assertEqual(field_value_record(self.envelope, second_signature).value, 'Bob mark')
