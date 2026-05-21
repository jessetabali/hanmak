from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import Membership, Organization
from envelopes.models import Envelope
from evidence.models import EvidenceBundle

User = get_user_model()


class EvidenceBundleTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='alice', password='pass')
        self.org = Organization.objects.create(name='Alpha Org', slug='alpha')
        self.other_org = Organization.objects.create(name='Beta Org', slug='beta')
        Membership.objects.create(user=self.user, organization=self.org, role=Membership.Role.ADMIN)
        self.client.force_authenticate(self.user)

        self.envelope = Envelope.objects.create(
            organization=self.org, name='NDA', sender=self.user,
            status=Envelope.Status.COMPLETED,
        )
        self.bundle = EvidenceBundle.objects.create(
            envelope=self.envelope,
            status=EvidenceBundle.Status.PENDING,
        )

    def test_create_bundle_for_own_org_envelope(self):
        response = self.client.post('/api/v1/evidence-bundles/', {
            'envelope': self.envelope.id,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['envelope'], self.envelope.id)

    def test_list_scoped_to_own_org(self):
        other_envelope = Envelope.objects.create(
            organization=self.other_org, name='Other NDA',
            sender=User.objects.create_user(username='bob', password='pass'),
        )
        EvidenceBundle.objects.create(envelope=other_envelope)
        response = self.client.get('/api/v1/evidence-bundles/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        envelope_ids = {b['envelope'] for b in response.data['results']}
        self.assertNotIn(other_envelope.id, envelope_ids)
        self.assertIn(self.envelope.id, envelope_ids)

    def test_generate_action_produces_manifest(self):
        response = self.client.post(f'/api/v1/evidence-bundles/{self.bundle.id}/generate/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.bundle.refresh_from_db()
        self.assertEqual(self.bundle.status, EvidenceBundle.Status.READY)
        self.assertTrue(bool(self.bundle.sha256))

    def test_generate_signed_pdf_action(self):
        with patch('evidence.views.build_signed_pdf', return_value=(b'%PDF-stamped', 'abc123')):
            response = self.client.post(f'/api/v1/evidence-bundles/{self.bundle.id}/generate-signed-pdf/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.bundle.refresh_from_db()
        self.assertEqual(self.bundle.status, EvidenceBundle.Status.READY)
        self.assertEqual(self.bundle.signed_pdf_sha256, 'abc123')

    def test_cannot_access_other_org_bundle(self):
        other_user = User.objects.create_user(username='bob2', password='pass')
        other_envelope = Envelope.objects.create(
            organization=self.other_org, name='Other', sender=other_user,
        )
        other_bundle = EvidenceBundle.objects.create(envelope=other_envelope)
        response = self.client.get(f'/api/v1/evidence-bundles/{other_bundle.id}/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
