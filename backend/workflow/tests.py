from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import Membership, Organization
from envelopes.models import Envelope, Recipient
from workflow.models import WorkflowDefinition, WorkflowRun, WorkflowStage

User = get_user_model()


class WorkflowDefinitionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='alice', password='pass')
        self.org = Organization.objects.create(name='Alpha Org', slug='alpha')
        self.other_org = Organization.objects.create(name='Beta Org', slug='beta')
        Membership.objects.create(user=self.user, organization=self.org, role=Membership.Role.ADMIN)
        self.client.force_authenticate(self.user)

        self.workflow = WorkflowDefinition.objects.create(
            organization=self.org,
            name='NDA Approval Flow',
            status=WorkflowDefinition.Status.DRAFT,
            created_by=self.user,
        )

    def test_list_scoped_to_own_org(self):
        other_user = User.objects.create_user(username='bob', password='pass')
        WorkflowDefinition.objects.create(
            organization=self.other_org, name='Their Flow', created_by=other_user,
        )
        response = self.client.get('/api/v1/workflows/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = [w['name'] for w in response.data['results']]
        self.assertIn('NDA Approval Flow', names)
        self.assertNotIn('Their Flow', names)

    def test_create_workflow(self):
        response = self.client.post('/api/v1/workflows/', {
            'organization': self.org.id,
            'name': 'Contract Approval',
            'description': 'Two-stage contract approval',
            'schema': {'stages': [{'key': 'legal', 'type': 'approval'}]},
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['status'], WorkflowDefinition.Status.DRAFT)

    def test_unique_name_per_org_enforced(self):
        with self.assertRaises(IntegrityError):
            WorkflowDefinition.objects.create(
                organization=self.org,
                name='NDA Approval Flow',
                created_by=self.user,
            )

    def test_activate_action(self):
        WorkflowStage.objects.create(
            workflow=self.workflow, key='signing', label='Signing', stage_type='signing', order=1,
        )
        response = self.client.post(f'/api/v1/workflows/{self.workflow.id}/activate/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.workflow.refresh_from_db()
        self.assertEqual(self.workflow.status, WorkflowDefinition.Status.ACTIVE)

    def test_archive_action(self):
        self.workflow.status = WorkflowDefinition.Status.ACTIVE
        self.workflow.save(update_fields=['status'])
        response = self.client.post(f'/api/v1/workflows/{self.workflow.id}/archive/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.workflow.refresh_from_db()
        self.assertEqual(self.workflow.status, WorkflowDefinition.Status.ARCHIVED)

    def test_cannot_access_other_org_workflow(self):
        other_user = User.objects.create_user(username='bob2', password='pass')
        other_workflow = WorkflowDefinition.objects.create(
            organization=self.other_org, name='Private Flow', created_by=other_user,
        )
        response = self.client.get(f'/api/v1/workflows/{other_workflow.id}/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class WorkflowRunTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='alice', password='pass')
        self.org = Organization.objects.create(name='Alpha Org', slug='alpha')
        Membership.objects.create(user=self.user, organization=self.org, role=Membership.Role.ADMIN)
        self.client.force_authenticate(self.user)

        self.workflow = WorkflowDefinition.objects.create(
            organization=self.org, name='My Flow', created_by=self.user,
        )
        self.envelope = Envelope.objects.create(
            organization=self.org, name='NDA', sender=self.user,
        )

    def test_create_workflow_run(self):
        self.workflow.status = WorkflowDefinition.Status.ACTIVE
        self.workflow.save(update_fields=['status'])
        WorkflowStage.objects.create(
            workflow=self.workflow, key='signer', label='Signer', stage_type='signing', order=1,
        )
        Recipient.objects.create(
            envelope=self.envelope,
            name='Signer',
            email='signer@example.com',
            party_key='signer',
        )
        response = self.client.post('/api/v1/workflow-runs/', {
            'envelope': self.envelope.id,
            'workflow': self.workflow.id,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['status'], WorkflowRun.Status.RUNNING)
        self.assertEqual(response.data['current_stage_key'], 'signer')
        self.assertEqual(response.data['stages'][0]['party_key'], 'signer')
        self.assertEqual(response.data['parties'][0]['party_key'], 'signer')
