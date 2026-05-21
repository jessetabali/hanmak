from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import Membership, Organization
from auditlog.models import AuditEvent
from envelopes.models import Envelope

User = get_user_model()


class AuditEventTests(TestCase):
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
        self.event = AuditEvent.objects.create(
            organization=self.org,
            envelope=self.envelope,
            actor=self.user,
            event_type='envelope.created',
            message='Envelope was created',
        )
        AuditEvent.objects.create(
            organization=self.other_org,
            event_type='envelope.sent',
            message='Other org event',
        )

    def test_list_scoped_to_own_org(self):
        response = self.client.get('/api/v1/audit-events/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        event_types = {e['event_type'] for e in response.data['results']}
        self.assertIn('envelope.created', event_types)
        self.assertNotIn('envelope.sent', event_types)

    def test_filter_by_event_type(self):
        AuditEvent.objects.create(
            organization=self.org, event_type='envelope.sent', message='Sent',
        )
        response = self.client.get('/api/v1/audit-events/?event_type=envelope.created')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        event_types = {e['event_type'] for e in response.data['results']}
        self.assertEqual(event_types, {'envelope.created'})

    def test_filter_by_event_type_prefix(self):
        AuditEvent.objects.create(
            organization=self.org, event_type='user.login', message='Login',
        )
        response = self.client.get('/api/v1/audit-events/?event_type__startswith=envelope')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for e in response.data['results']:
            self.assertTrue(e['event_type'].startswith('envelope'))

    def test_search_by_message(self):
        AuditEvent.objects.create(
            organization=self.org, event_type='user.login', message='Login from IP 1.2.3.4',
        )
        response = self.client.get('/api/v1/audit-events/?search=created')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        messages = [e['message'] for e in response.data['results']]
        self.assertTrue(any('created' in m.lower() for m in messages))

    def test_filter_by_envelope(self):
        other_envelope = Envelope.objects.create(
            organization=self.org, name='Contract', sender=self.user,
        )
        AuditEvent.objects.create(
            organization=self.org, envelope=other_envelope,
            event_type='envelope.sent', message='Other envelope',
        )
        response = self.client.get(f'/api/v1/audit-events/?envelope={self.envelope.id}')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for e in response.data['results']:
            self.assertEqual(e['envelope'], self.envelope.id)

    def test_create_audit_event(self):
        response = self.client.post('/api/v1/audit-events/', {
            'organization': self.org.id,
            'event_type': 'template.created',
            'message': 'Template was created',
            'severity': AuditEvent.Severity.INFO,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['event_type'], 'template.created')
