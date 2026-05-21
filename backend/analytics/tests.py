from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import Membership, Organization

User = get_user_model()


class AnalyticsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='alice', password='pass')
        self.org = Organization.objects.create(name='Alpha Org', slug='alpha')
        Membership.objects.create(user=self.user, organization=self.org, role=Membership.Role.ADMIN)
        self.client.force_authenticate(self.user)

    def test_approval_bottlenecks_returns_200(self):
        response = self.client.get(
            f'/api/v1/analytics/approval-bottlenecks/?organization={self.org.id}'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_approval_bottlenecks_requires_auth(self):
        self.client.logout()
        response = self.client.get(
            f'/api/v1/analytics/approval-bottlenecks/?organization={self.org.id}'
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
