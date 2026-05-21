from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import Membership, Organization
from tasks.models import TaskDefinition, TaskRun

User = get_user_model()


class TaskRunTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='alice', password='pass')
        self.org = Organization.objects.create(name='Alpha Org', slug='alpha')
        self.other_org = Organization.objects.create(name='Beta Org', slug='beta')
        Membership.objects.create(user=self.user, organization=self.org, role=Membership.Role.ADMIN)
        self.client.force_authenticate(self.user)

        self.definition = TaskDefinition.objects.create(
            name='generate_evidence_bundle', queue_name='default',
        )
        self.run = TaskRun.objects.create(
            organization=self.org,
            definition=self.definition,
            task_name='generate_evidence_bundle',
            status=TaskRun.Status.SUCCEEDED,
            created_by=self.user,
        )

    def test_list_scoped_to_own_org(self):
        other_user = User.objects.create_user(username='bob', password='pass')
        TaskRun.objects.create(
            organization=self.other_org,
            task_name='other_task',
            status=TaskRun.Status.QUEUED,
            created_by=other_user,
        )
        response = self.client.get('/api/v1/task-runs/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        task_names = [t['task_name'] for t in response.data['results']]
        self.assertIn('generate_evidence_bundle', task_names)
        self.assertNotIn('other_task', task_names)

    def test_summary_endpoint(self):
        TaskRun.objects.create(
            organization=self.org, task_name='send_email',
            status=TaskRun.Status.FAILED, created_by=self.user,
        )
        response = self.client.get('/api/v1/task-runs/summary/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('total', response.data)
        self.assertIn('failed', response.data)
        self.assertIn('succeeded', response.data)
        self.assertIn('queues', response.data)
        self.assertEqual(response.data['total'], 2)

    def test_restart_creates_new_run(self):
        failed_run = TaskRun.objects.create(
            organization=self.org,
            definition=self.definition,
            task_name='generate_evidence_bundle',
            status=TaskRun.Status.FAILED,
            created_by=self.user,
            max_attempts=3,
            attempt_number=1,
        )
        response = self.client.post(f'/api/v1/task-runs/{failed_run.id}/restart/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        new_id = response.data['id']
        self.assertNotEqual(new_id, failed_run.id)
        new_run = TaskRun.objects.get(id=new_id)
        self.assertEqual(new_run.restarted_from_id, failed_run.id)

    def test_cancel_sets_status_cancelled(self):
        queued_run = TaskRun.objects.create(
            organization=self.org,
            task_name='slow_task',
            status=TaskRun.Status.RUNNING,
            created_by=self.user,
        )
        response = self.client.post(f'/api/v1/task-runs/{queued_run.id}/cancel/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        queued_run.refresh_from_db()
        self.assertEqual(queued_run.status, TaskRun.Status.CANCELLED)

    def test_cannot_access_other_org_task_run(self):
        other_user = User.objects.create_user(username='bob2', password='pass')
        other_run = TaskRun.objects.create(
            organization=self.other_org,
            task_name='other_task',
            status=TaskRun.Status.QUEUED,
            created_by=other_user,
        )
        response = self.client.get(f'/api/v1/task-runs/{other_run.id}/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class TaskDefinitionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='alice', password='pass')
        self.org = Organization.objects.create(name='Alpha Org', slug='alpha')
        Membership.objects.create(user=self.user, organization=self.org, role=Membership.Role.ADMIN)
        self.client.force_authenticate(self.user)

    def test_list_task_definitions(self):
        TaskDefinition.objects.create(name='send_reminder', queue_name='email')
        response = self.client.get('/api/v1/task-definitions/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = [d['name'] for d in response.data['results']]
        self.assertIn('send_reminder', names)
