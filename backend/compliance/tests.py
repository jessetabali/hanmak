from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import Membership, Organization
from compliance.models import LegalHold, RetentionPolicy

User = get_user_model()


class LegalHoldTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='alice', password='pass')
        self.org = Organization.objects.create(name='Alpha Org', slug='alpha')
        self.other_org = Organization.objects.create(name='Beta Org', slug='beta')
        Membership.objects.create(user=self.user, organization=self.org, role=Membership.Role.ADMIN)
        self.client.force_authenticate(self.user)

        self.hold = LegalHold.objects.create(
            organization=self.org,
            name='SEC Investigation Hold',
            matter='SEC-2026-001',
            status=LegalHold.Status.ACTIVE,
        )

    def test_list_scoped_to_own_org(self):
        LegalHold.objects.create(organization=self.other_org, name='Other Hold')
        response = self.client.get('/api/v1/legal-holds/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = [h['name'] for h in response.data['results']]
        self.assertIn('SEC Investigation Hold', names)
        self.assertNotIn('Other Hold', names)

    def test_create_legal_hold(self):
        response = self.client.post('/api/v1/legal-holds/', {
            'organization': self.org.id,
            'name': 'GDPR Audit Hold',
            'matter': 'GDPR-2026',
            'reason': 'Regulatory audit',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['status'], LegalHold.Status.ACTIVE)

    def test_release_action(self):
        response = self.client.post(f'/api/v1/legal-holds/{self.hold.id}/release/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.hold.refresh_from_db()
        self.assertEqual(self.hold.status, LegalHold.Status.RELEASED)
        self.assertIsNotNone(self.hold.released_at)

    def test_cannot_release_other_org_hold(self):
        other_hold = LegalHold.objects.create(organization=self.other_org, name='Other Hold')
        response = self.client.post(f'/api/v1/legal-holds/{other_hold.id}/release/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class RetentionPolicyTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='alice', password='pass')
        self.org = Organization.objects.create(name='Alpha Org', slug='alpha')
        self.other_org = Organization.objects.create(name='Beta Org', slug='beta')
        Membership.objects.create(user=self.user, organization=self.org, role=Membership.Role.ADMIN)
        self.client.force_authenticate(self.user)

    def test_create_retention_policy(self):
        response = self.client.post('/api/v1/retention-policies/', {
            'organization': self.org.id,
            'name': '7-Year Archive',
            'applies_to': 'envelopes',
            'retention_days': 2555,
            'action': 'archive',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['retention_days'], 2555)

    def test_list_scoped_to_own_org(self):
        RetentionPolicy.objects.create(organization=self.org, name='My Policy', retention_days=365)
        RetentionPolicy.objects.create(organization=self.other_org, name='Their Policy', retention_days=180)
        response = self.client.get('/api/v1/retention-policies/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = [p['name'] for p in response.data['results']]
        self.assertIn('My Policy', names)
        self.assertNotIn('Their Policy', names)

    def test_update_retention_policy(self):
        policy = RetentionPolicy.objects.create(
            organization=self.org, name='Old Policy', retention_days=365,
        )
        response = self.client.patch(f'/api/v1/retention-policies/{policy.id}/', {
            'retention_days': 730,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['retention_days'], 730)
