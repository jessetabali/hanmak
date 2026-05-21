from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import Membership, Organization
from approvals.models import ApprovalRequest
from envelopes.models import Envelope, Recipient
from signing.models import SigningSession

User = get_user_model()


class MyInboxViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='alice', email='alice@example.com', password='pass')
        self.org = Organization.objects.create(name='Alpha Org', slug='alpha')
        Membership.objects.create(user=self.user, organization=self.org, role=Membership.Role.ADMIN)
        self.client.force_authenticate(self.user)

    def test_inbox_returns_200(self):
        response = self.client.get('/api/v1/inbox/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_inbox_has_required_sections(self):
        response = self.client.get('/api/v1/inbox/')
        self.assertIn('approvals', response.data)
        self.assertIn('signing', response.data)
        self.assertIn('completed', response.data)
        self.assertIn('counts', response.data)

    def test_inbox_includes_pending_approval(self):
        envelope = Envelope.objects.create(
            organization=self.org, name='NDA', sender=self.user,
        )
        ApprovalRequest.objects.create(
            envelope=envelope,
            approver=self.user,
            approval_role='legal',
            status=ApprovalRequest.Status.PENDING,
        )
        response = self.client.get('/api/v1/inbox/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreater(len(response.data.get('approvals', [])), 0)
        self.assertGreater(response.data['counts']['approvals'], 0)

    def test_inbox_includes_pending_signing(self):
        envelope = Envelope.objects.create(
            organization=self.org, name='Contract', sender=self.user,
        )
        recipient = Recipient.objects.create(
            envelope=envelope, name='Alice', email='alice@example.com',
        )
        SigningSession.objects.create(
            envelope=envelope,
            recipient=recipient,
            status=SigningSession.Status.CREATED,
        )
        response = self.client.get('/api/v1/inbox/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreater(len(response.data.get('signing', [])), 0)
        self.assertGreater(response.data['counts']['signing'], 0)

    def test_unauthenticated_returns_401(self):
        self.client.logout()
        response = self.client.get('/api/v1/inbox/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
