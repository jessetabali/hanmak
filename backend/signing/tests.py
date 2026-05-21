from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import Membership, Organization
from envelopes.models import Envelope, Recipient
from signing.models import SigningSession


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
