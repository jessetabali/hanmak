from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import Membership, Organization
from billing.models import LicenseKey, Plan, Subscription

User = get_user_model()


class PlanTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='alice', password='pass')
        self.org = Organization.objects.create(name='Alpha Org', slug='alpha')
        Membership.objects.create(user=self.user, organization=self.org, role=Membership.Role.ADMIN)
        self.client.force_authenticate(self.user)

        self.plan = Plan.objects.create(name='Starter', code='starter', monthly_price='29.00')

    def test_list_plans(self):
        response = self.client.get('/api/v1/plans/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        codes = [p['code'] for p in response.data['results']]
        self.assertIn('starter', codes)

    def test_retrieve_plan(self):
        response = self.client.get(f'/api/v1/plans/{self.plan.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Starter')
        self.assertEqual(response.data['code'], 'starter')


class SubscriptionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='alice', password='pass')
        self.org = Organization.objects.create(name='Alpha Org', slug='alpha')
        self.other_org = Organization.objects.create(name='Beta Org', slug='beta')
        Membership.objects.create(user=self.user, organization=self.org, role=Membership.Role.ADMIN)
        self.client.force_authenticate(self.user)

        self.plan = Plan.objects.create(name='Pro', code='pro', monthly_price='99.00')
        self.subscription = Subscription.objects.create(
            organization=self.org, plan=self.plan, status=Subscription.Status.ACTIVE,
        )

    def test_list_returns_own_org_subscription(self):
        other_plan = Plan.objects.create(name='Enterprise', code='enterprise', monthly_price='299.00')
        Subscription.objects.create(
            organization=self.other_org, plan=other_plan, status=Subscription.Status.TRIALING,
        )
        response = self.client.get('/api/v1/subscriptions/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        org_ids = {s['organization'] for s in response.data['results']}
        self.assertEqual(org_ids, {self.org.id})

    def test_retrieve_own_subscription(self):
        response = self.client.get(f'/api/v1/subscriptions/{self.subscription.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], Subscription.Status.ACTIVE)


class LicenseKeyTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='alice', password='pass')
        self.org = Organization.objects.create(name='Alpha Org', slug='alpha')
        self.other_org = Organization.objects.create(name='Beta Org', slug='beta')
        Membership.objects.create(user=self.user, organization=self.org, role=Membership.Role.ADMIN)
        self.client.force_authenticate(self.user)

    def test_create_license_key(self):
        response = self.client.post('/api/v1/license-keys/', {
            'organization': self.org.id,
            'key': 'AAAA-BBBB-CCCC-DDDD',
            'edition': 'Enterprise',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['edition'], 'Enterprise')

    def test_activate_sets_activated_at(self):
        license_key = LicenseKey.objects.create(
            organization=self.org, key='TEST-1234-5678-9ABC', edition='Pro',
        )
        response = self.client.post(f'/api/v1/license-keys/{license_key.id}/activate/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        license_key.refresh_from_db()
        self.assertIsNotNone(license_key.activated_at)

    def test_list_scoped_to_own_org(self):
        LicenseKey.objects.create(organization=self.org, key='MINE-1111', edition='Pro')
        LicenseKey.objects.create(organization=self.other_org, key='THEIRS-2222', edition='Community')
        response = self.client.get('/api/v1/license-keys/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        keys = [k['key'] for k in response.data['results']]
        self.assertIn('MINE-1111', keys)
        self.assertNotIn('THEIRS-2222', keys)
