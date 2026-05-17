from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import Membership, Organization
from configcenter.models import FeatureFlag


class FeatureFlagGateTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.user = User.objects.create_user(username='release-admin', password='pass')
        self.organization = Organization.objects.create(name='Release Org', slug='release-org')
        Membership.objects.create(user=self.user, organization=self.organization, role=Membership.Role.ADMIN)
        self.client.force_authenticate(self.user)

    def test_org_scoped_endpoint_is_blocked_when_feature_is_not_released(self):
        FeatureFlag.objects.create(
            organization=self.organization,
            key='workflow_builder',
            name='Workflow Builder',
            is_enabled=False,
            release_stage=FeatureFlag.ReleaseStage.INTERNAL,
            rollout_percentage=0,
        )

        response = self.client.get(f'/api/v1/workflows/?organization={self.organization.id}')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('workflow_builder', str(response.data))

    def test_org_scoped_endpoint_allows_released_feature(self):
        FeatureFlag.objects.create(
            organization=self.organization,
            key='workflow_builder',
            name='Workflow Builder',
            is_enabled=True,
            release_stage=FeatureFlag.ReleaseStage.BETA,
            rollout_percentage=100,
        )

        response = self.client.get(f'/api/v1/workflows/?organization={self.organization.id}')

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_missing_feature_flag_defaults_to_allowed_before_seed(self):
        response = self.client.get(f'/api/v1/envelopes/?organization={self.organization.id}')

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_release_control_returns_all_seeded_features_without_pagination(self):
        self.client.post('/api/v1/feature-flags/seed-defaults/', {'organization': self.organization.id}, format='json')

        response = self.client.get(f'/api/v1/feature-flags/?organization={self.organization.id}')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, list)
        self.assertGreaterEqual(len(response.data), 40)
        self.assertIn('release_control', {item['key'] for item in response.data})
