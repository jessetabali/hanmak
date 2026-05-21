from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import Membership, Organization
from envelopes.models import Envelope
from risk.models import PolicyRule, RiskFinding

User = get_user_model()


class RiskFindingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='alice', password='pass')
        self.org = Organization.objects.create(name='Alpha Org', slug='alpha')
        self.other_org = Organization.objects.create(name='Beta Org', slug='beta')
        Membership.objects.create(user=self.user, organization=self.org, role=Membership.Role.ADMIN)
        self.client.force_authenticate(self.user)

        self.envelope = Envelope.objects.create(
            organization=self.org, name='NDA', sender=self.user,
        )
        self.finding = RiskFinding.objects.create(
            organization=self.org,
            envelope=self.envelope,
            title='Missing signature field',
            severity=RiskFinding.Severity.HIGH,
        )

    def test_list_scoped_to_own_org(self):
        other_user = User.objects.create_user(username='bob', password='pass')
        other_envelope = Envelope.objects.create(
            organization=self.other_org, name='Other', sender=other_user,
        )
        RiskFinding.objects.create(
            organization=self.other_org, title='Other finding', envelope=other_envelope,
        )
        response = self.client.get('/api/v1/risk-findings/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = [f['title'] for f in response.data['results']]
        self.assertIn('Missing signature field', titles)
        self.assertNotIn('Other finding', titles)

    def test_create_risk_finding(self):
        response = self.client.post('/api/v1/risk-findings/', {
            'organization': self.org.id,
            'title': 'Expired document',
            'severity': RiskFinding.Severity.MEDIUM,
            'description': 'Document past expiry date',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['title'], 'Expired document')
        self.assertEqual(response.data['status'], RiskFinding.Status.OPEN)

    def test_resolve_action(self):
        response = self.client.post(f'/api/v1/risk-findings/{self.finding.id}/resolve/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.finding.refresh_from_db()
        self.assertEqual(self.finding.status, RiskFinding.Status.RESOLVED)

    def test_cannot_resolve_other_org_finding(self):
        other_user = User.objects.create_user(username='bob2', password='pass')
        other_envelope = Envelope.objects.create(
            organization=self.other_org, name='Other', sender=other_user,
        )
        other_finding = RiskFinding.objects.create(
            organization=self.other_org, title='Other', envelope=other_envelope,
        )
        response = self.client.post(f'/api/v1/risk-findings/{other_finding.id}/resolve/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class PolicyRuleTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='alice', password='pass')
        self.org = Organization.objects.create(name='Alpha Org', slug='alpha')
        self.other_org = Organization.objects.create(name='Beta Org', slug='beta')
        Membership.objects.create(user=self.user, organization=self.org, role=Membership.Role.ADMIN)
        self.client.force_authenticate(self.user)

    def test_create_policy_rule(self):
        response = self.client.post('/api/v1/policy-rules/', {
            'organization': self.org.id,
            'name': 'Require Two Signers',
            'rule_type': 'min_signers',
            'config': {'min': 2},
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], 'Require Two Signers')

    def test_list_scoped_to_own_org(self):
        PolicyRule.objects.create(organization=self.org, name='My Rule', rule_type='min_signers')
        PolicyRule.objects.create(organization=self.other_org, name='Their Rule', rule_type='max_duration')
        response = self.client.get('/api/v1/policy-rules/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = [r['name'] for r in response.data['results']]
        self.assertIn('My Rule', names)
        self.assertNotIn('Their Rule', names)
