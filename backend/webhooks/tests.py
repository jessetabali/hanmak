from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import Membership, Organization
from webhooks.models import EventOutbox, WebhookDelivery, WebhookEndpoint


User = get_user_model()


class WebhookEndpointTestActionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='alice', password='pass')
        self.org = Organization.objects.create(name='Test Org', slug='test-org')
        Membership.objects.create(user=self.user, organization=self.org, role=Membership.Role.ADMIN)
        self.client.force_authenticate(self.user)

        self.endpoint = WebhookEndpoint.objects.create(
            organization=self.org,
            name='My Webhook',
            target_url='http://example.com/hook',
        )

    def _test_url(self):
        return f'/api/v1/webhook-endpoints/{self.endpoint.id}/test/'

    def test_successful_delivery_creates_records(self):
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = b'ok'
        mock_resp.__enter__ = lambda s: mock_resp
        mock_resp.__exit__ = MagicMock(return_value=False)

        with patch('webhooks.views.urllib.request.urlopen', return_value=mock_resp):
            response = self.client.post(self._test_url(), {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('delivery_id', response.data)
        self.assertEqual(response.data['status'], WebhookDelivery.Status.DELIVERED)
        self.assertEqual(response.data['response_status'], 200)
        self.assertIsNone(response.data['error_message'])
        self.assertIn('latency_ms', response.data)

    def test_successful_delivery_persists_to_db(self):
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = b'{"received": true}'
        mock_resp.__enter__ = lambda s: mock_resp
        mock_resp.__exit__ = MagicMock(return_value=False)

        with patch('webhooks.views.urllib.request.urlopen', return_value=mock_resp):
            response = self.client.post(self._test_url(), {}, format='json')

        delivery_id = response.data['delivery_id']
        delivery = WebhookDelivery.objects.get(id=delivery_id)
        self.assertEqual(delivery.status, WebhookDelivery.Status.DELIVERED)
        self.assertEqual(delivery.endpoint, self.endpoint)
        self.assertIsNotNone(delivery.delivered_at)

    def test_successful_delivery_creates_outbox_event(self):
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = b'ok'
        mock_resp.__enter__ = lambda s: mock_resp
        mock_resp.__exit__ = MagicMock(return_value=False)

        before_count = EventOutbox.objects.count()
        with patch('webhooks.views.urllib.request.urlopen', return_value=mock_resp):
            self.client.post(self._test_url(), {}, format='json')

        self.assertEqual(EventOutbox.objects.count(), before_count + 1)
        event = EventOutbox.objects.latest('id')
        self.assertEqual(event.organization, self.org)
        self.assertTrue(event.payload.get('test'))

    def test_custom_event_type_in_payload(self):
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = b'ok'
        mock_resp.__enter__ = lambda s: mock_resp
        mock_resp.__exit__ = MagicMock(return_value=False)

        with patch('webhooks.views.urllib.request.urlopen', return_value=mock_resp):
            response = self.client.post(
                self._test_url(),
                {'event_type': 'envelope.signed'},
                format='json',
            )

        delivery = WebhookDelivery.objects.get(id=response.data['delivery_id'])
        self.assertEqual(delivery.request_body['event_type'], 'envelope.signed')

    def test_connection_error_marks_delivery_failed(self):
        with patch('webhooks.views.urllib.request.urlopen', side_effect=ConnectionRefusedError('refused')):
            response = self.client.post(self._test_url(), {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], WebhookDelivery.Status.FAILED)
        self.assertIn('refused', response.data['error_message'])

    def test_http_error_marks_delivery_failed_with_status(self):
        import urllib.error
        exc = urllib.error.HTTPError(url=None, code=500, msg='Server Error', hdrs=None, fp=None)

        with patch('webhooks.views.urllib.request.urlopen', side_effect=exc):
            response = self.client.post(self._test_url(), {}, format='json')

        self.assertEqual(response.data['status'], WebhookDelivery.Status.FAILED)
        self.assertEqual(response.data['response_status'], 500)

    def test_cross_org_endpoint_returns_404(self):
        other_user = User.objects.create_user(username='bob', password='pass')
        other_org = Organization.objects.create(name='Other Org', slug='other')
        Membership.objects.create(user=other_user, organization=other_org, role=Membership.Role.ADMIN)
        other_endpoint = WebhookEndpoint.objects.create(
            organization=other_org,
            name='Their Webhook',
            target_url='http://other.example.com/hook',
        )

        response = self.client.post(f'/api/v1/webhook-endpoints/{other_endpoint.id}/test/', {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
