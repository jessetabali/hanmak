from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import Membership, Organization
from api_keys.models import APIKey

User = get_user_model()


class APIKeyTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='alice', password='pass')
        self.other_user = User.objects.create_user(username='bob', password='pass')
        self.org = Organization.objects.create(name='Alpha Org', slug='alpha')
        self.other_org = Organization.objects.create(name='Beta Org', slug='beta')
        Membership.objects.create(user=self.user, organization=self.org, role=Membership.Role.ADMIN)
        Membership.objects.create(user=self.other_user, organization=self.other_org, role=Membership.Role.ADMIN)
        self.client.force_authenticate(self.user)

    def _create_key(self, name='Test Key'):
        return self.client.post('/api/v1/api-keys/', {
            'organization': self.org.id,
            'name': name,
            'scopes': ['envelopes:read'],
        }, format='json')

    def test_create_returns_plaintext_key(self):
        response = self._create_key()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('key', response.data)
        self.assertTrue(response.data['key'].startswith('hm_'))

    def test_create_stores_hashed_key_not_plaintext(self):
        response = self._create_key()
        key_obj = APIKey.objects.get(id=response.data['id'])
        self.assertNotEqual(key_obj.key_hash, response.data['key'])
        self.assertEqual(len(key_obj.key_hash), 64)

    def test_create_sets_key_prefix(self):
        response = self._create_key()
        key_obj = APIKey.objects.get(id=response.data['id'])
        self.assertEqual(key_obj.key_prefix, response.data['key'][:12])

    def test_list_returns_only_own_org_keys(self):
        self._create_key('My Key')
        APIKey.objects.create(
            organization=self.other_org, name='Their Key',
            key_prefix='hm_other_key', key_hash='x' * 64,
        )
        response = self.client.get('/api/v1/api-keys/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = [k['name'] for k in response.data['results']]
        self.assertIn('My Key', names)
        self.assertNotIn('Their Key', names)

    def test_revoke_sets_status_revoked(self):
        key_id = self._create_key().data['id']
        response = self.client.post(f'/api/v1/api-keys/{key_id}/revoke/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], APIKey.Status.REVOKED)

    def test_rotate_creates_new_key_and_revokes_old(self):
        key_id = self._create_key().data['id']
        response = self.client.post(f'/api/v1/api-keys/{key_id}/rotate/')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertNotEqual(response.data['id'], key_id)
        self.assertEqual(APIKey.objects.get(id=key_id).status, APIKey.Status.REVOKED)

    def test_cannot_access_other_org_key(self):
        other_key = APIKey.objects.create(
            organization=self.other_org, name='Their Key',
            key_prefix='hm_other123', key_hash='y' * 64,
        )
        self.assertEqual(self.client.get(f'/api/v1/api-keys/{other_key.id}/').status_code, status.HTTP_404_NOT_FOUND)

    def test_cannot_revoke_other_org_key(self):
        other_key = APIKey.objects.create(
            organization=self.other_org, name='Their Key',
            key_prefix='hm_other456', key_hash='z' * 64,
        )
        self.assertEqual(self.client.post(f'/api/v1/api-keys/{other_key.id}/revoke/').status_code, status.HTTP_404_NOT_FOUND)
