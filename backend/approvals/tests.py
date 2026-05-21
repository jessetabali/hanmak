from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import Membership, Organization
from approvals.models import ApprovalRequest
from envelopes.models import Envelope, Recipient

User = get_user_model()


class ApprovalRequestTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.approver = User.objects.create_user(username='approver', password='pass')
        self.other_user = User.objects.create_user(username='other', password='pass')
        self.org = Organization.objects.create(name='Alpha Org', slug='alpha')
        self.other_org = Organization.objects.create(name='Beta Org', slug='beta')
        Membership.objects.create(user=self.approver, organization=self.org, role=Membership.Role.ADMIN)
        Membership.objects.create(user=self.other_user, organization=self.other_org, role=Membership.Role.ADMIN)
        self.client.force_authenticate(self.approver)

        self.envelope = Envelope.objects.create(
            organization=self.org, name='NDA', sender=self.approver,
        )
        self.approval = ApprovalRequest.objects.create(
            envelope=self.envelope,
            approver=self.approver,
            approval_role='legal',
            status=ApprovalRequest.Status.PENDING,
        )

    def test_list_returns_own_org_approvals(self):
        other_envelope = Envelope.objects.create(
            organization=self.other_org, name='Other NDA', sender=self.other_user,
        )
        ApprovalRequest.objects.create(
            envelope=other_envelope, approver=self.other_user, approval_role='cfo',
        )
        response = self.client.get('/api/v1/approval-requests/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {r['id'] for r in response.data['results']}
        self.assertIn(self.approval.id, ids)
        self.assertEqual(len(ids), 1)

    def test_filter_by_status(self):
        ApprovalRequest.objects.create(
            envelope=self.envelope, approver=self.approver,
            approval_role='cfo', status=ApprovalRequest.Status.APPROVED,
        )
        response = self.client.get('/api/v1/approval-requests/?status=pending')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        statuses = {r['status'] for r in response.data['results']}
        self.assertEqual(statuses, {'pending'})

    def test_approve_action_sets_status(self):
        response = self.client.post(f'/api/v1/approval-requests/{self.approval.id}/approve/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.approval.refresh_from_db()
        self.assertEqual(self.approval.status, ApprovalRequest.Status.APPROVED)
        self.assertIsNotNone(self.approval.decided_at)

    def test_reject_action_sets_status(self):
        response = self.client.post(
            f'/api/v1/approval-requests/{self.approval.id}/reject/',
            {'notes': 'Needs revision'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.approval.refresh_from_db()
        self.assertEqual(self.approval.status, ApprovalRequest.Status.REJECTED)
        self.assertEqual(self.approval.notes, 'Needs revision')

    def test_request_changes_action(self):
        response = self.client.post(f'/api/v1/approval-requests/{self.approval.id}/request-changes/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.approval.refresh_from_db()
        self.assertEqual(self.approval.status, ApprovalRequest.Status.CHANGES_REQUESTED)

    def test_delegate_action(self):
        delegate_target = User.objects.create_user(username='delegate', password='pass')
        response = self.client.post(
            f'/api/v1/approval-requests/{self.approval.id}/delegate/',
            {'user': delegate_target.id},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.approval.refresh_from_db()
        self.assertEqual(self.approval.status, ApprovalRequest.Status.DELEGATED)
        self.assertEqual(self.approval.delegated_to_id, delegate_target.id)

    def test_cannot_approve_other_org_approval(self):
        other_envelope = Envelope.objects.create(
            organization=self.other_org, name='Other', sender=self.other_user,
        )
        other_approval = ApprovalRequest.objects.create(
            envelope=other_envelope, approver=self.other_user, approval_role='cfo',
        )
        response = self.client.post(f'/api/v1/approval-requests/{other_approval.id}/approve/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
