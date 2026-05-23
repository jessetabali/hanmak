from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from unittest.mock import patch
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import Membership, Organization
from documents.models import Document
from envelopes.models import Envelope, Template, TemplateParty
from messaging.models import EmailMessage
from envelopes.services import create_envelope_from_template, setup_template_version
from workflow.models import WorkflowDefinition, WorkflowRun, WorkflowStage


User = get_user_model()


class TemplateSetupTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='alice', password='pass')
        self.org = Organization.objects.create(name='Test Org', slug='test-org')
        Membership.objects.create(user=self.user, organization=self.org, role=Membership.Role.ADMIN)
        self.client.force_authenticate(self.user)

        self.template = Template.objects.create(organization=self.org, name='NDA Template')
        self.document = Document.objects.create(
            organization=self.org,
            title='nda.pdf',
            file=SimpleUploadedFile('nda.pdf', b'%PDF-1.4', content_type='application/pdf'),
            page_count=1,
        )

    def _make_fields(self, party_key='party-1'):
        return [
            {
                'field_key': 'sig_1',
                'field_type': 'signature',
                'label': 'Signature',
                'required': True,
                'page': 1,
                'x': 10, 'y': 10, 'width': 150, 'height': 40,
                'party_key': party_key,
            }
        ]

    def test_setup_template_version_default_labels(self):
        version = setup_template_version(
            self.template,
            self.document,
            fields=self._make_fields('party-1'),
        )

        party = TemplateParty.objects.get(template_version=version, role_key='party-1')
        self.assertEqual(party.label, 'Party 1')

    def test_setup_template_version_with_custom_party_labels(self):
        version = setup_template_version(
            self.template,
            self.document,
            fields=self._make_fields('party-1'),
            party_labels={'party-1': 'Buyer'},
        )

        party = TemplateParty.objects.get(template_version=version, role_key='party-1')
        self.assertEqual(party.label, 'Buyer')

    def test_setup_template_version_multiple_parties(self):
        fields = [
            {'field_key': 'sig_buyer', 'field_type': 'signature', 'label': 'Buyer Sig',
             'required': True, 'page': 1, 'x': 10, 'y': 10, 'width': 150, 'height': 40, 'party_key': 'party-1'},
            {'field_key': 'sig_seller', 'field_type': 'signature', 'label': 'Seller Sig',
             'required': True, 'page': 1, 'x': 10, 'y': 100, 'width': 150, 'height': 40, 'party_key': 'party-2'},
        ]
        version = setup_template_version(
            self.template,
            self.document,
            fields=fields,
            party_labels={'party-1': 'Buyer', 'party-2': 'Seller'},
        )

        labels = dict(TemplateParty.objects.filter(template_version=version).values_list('role_key', 'label'))
        self.assertEqual(labels['party-1'], 'Buyer')
        self.assertEqual(labels['party-2'], 'Seller')

    def test_api_setup_endpoint_persists_party_labels(self):
        payload = {
            'document': self.document.id,
            'fields': self._make_fields('party-1'),
            'parties': [{'key': 'party-1', 'label': 'Vendor'}],
            'changelog': 'Initial setup',
        }

        response = self.client.post(
            f'/api/v1/templates/{self.template.id}/setup/',
            payload,
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        party = TemplateParty.objects.get(template_version_id=response.data['id'], role_key='party-1')
        self.assertEqual(party.label, 'Vendor')

    def test_api_setup_endpoint_returns_parties_in_response(self):
        payload = {
            'document': self.document.id,
            'fields': self._make_fields('party-1'),
            'parties': [{'key': 'party-1', 'label': 'Tenant'}],
        }

        response = self.client.post(
            f'/api/v1/templates/{self.template.id}/setup/',
            payload,
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        party_labels = {p['role_key']: p['label'] for p in response.data.get('parties', [])}
        self.assertEqual(party_labels.get('party-1'), 'Tenant')

    def test_api_setup_requires_document_in_same_org(self):
        other_org = Organization.objects.create(name='Other Org', slug='other')
        other_doc = Document.objects.create(
            organization=other_org,
            title='other.pdf',
            file=SimpleUploadedFile('other.pdf', b'%PDF-1.4', content_type='application/pdf'),
            page_count=1,
        )

        payload = {
            'document': other_doc.id,
            'fields': self._make_fields('party-1'),
        }

        response = self.client.post(
            f'/api/v1/templates/{self.template.id}/setup/',
            payload,
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_api_setup_with_workflow_persists_stage_parties(self):
        workflow = WorkflowDefinition.objects.create(
            organization=self.org,
            name='Legal Review Flow',
            status=WorkflowDefinition.Status.ACTIVE,
            created_by=self.user,
        )
        WorkflowStage.objects.create(workflow=workflow, key='signer', label='Signer', stage_type='signing', order=1)
        WorkflowStage.objects.create(workflow=workflow, key='legal', label='Legal Approval', stage_type='approval', order=2)

        response = self.client.post(
            f'/api/v1/templates/{self.template.id}/setup/',
            {
                'document': self.document.id,
                'fields': self._make_fields('signer'),
                'workflow_schema': {'workflow_definition_id': workflow.id},
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        version_id = response.data['id']
        labels = dict(TemplateParty.objects.filter(template_version_id=version_id).values_list('role_key', 'label'))
        self.assertEqual(labels['signer'], 'Signer')
        self.assertEqual(labels['legal'], 'Legal Approval')
        self.assertEqual(response.data['workflow_schema']['workflow_definition_id'], workflow.id)

    def test_api_setup_rejects_inactive_workflow(self):
        workflow = WorkflowDefinition.objects.create(
            organization=self.org,
            name='Draft Flow',
            status=WorkflowDefinition.Status.DRAFT,
            created_by=self.user,
        )

        response = self.client.post(
            f'/api/v1/templates/{self.template.id}/setup/',
            {
                'document': self.document.id,
                'fields': self._make_fields('signer'),
                'workflow_schema': {'workflow_definition_id': workflow.id},
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_workflow_template_requires_stage_recipient_and_starts_run_on_send(self):
        workflow = WorkflowDefinition.objects.create(
            organization=self.org,
            name='Legal Review Flow',
            status=WorkflowDefinition.Status.ACTIVE,
            created_by=self.user,
        )
        WorkflowStage.objects.create(workflow=workflow, key='signer', label='Signer', stage_type='signing', order=1)
        WorkflowStage.objects.create(workflow=workflow, key='legal', label='Legal Approval', stage_type='approval', order=2)
        version = setup_template_version(
            self.template,
            self.document,
            fields=self._make_fields('signer'),
            workflow_schema={
                'workflow_definition_id': workflow.id,
                'workflow_name': workflow.name,
                'stages': [
                    {'key': 'signer', 'label': 'Signer', 'stage_type': 'signing', 'order': 1, 'party_key': 'signer'},
                    {'key': 'legal', 'label': 'Legal Approval', 'stage_type': 'approval', 'order': 2, 'party_key': 'legal'},
                ],
            },
        )

        with self.assertRaises(ValueError):
            create_envelope_from_template(
                organization=self.org,
                template_version=version,
                sender=self.user,
                name='Missing Legal',
                recipients=[{'name': 'Signer', 'email': 'signer@example.com', 'party_key': 'signer'}],
            )

        envelope = create_envelope_from_template(
            organization=self.org,
            template_version=version,
            sender=self.user,
            name='With Legal',
            send_status=True,
            recipients=[
                {'name': 'Signer', 'email': 'signer@example.com', 'party_key': 'signer'},
                {'name': 'Legal', 'email': 'legal@example.com', 'party_key': 'legal', 'role': 'approver'},
            ],
        )

        self.assertEqual(envelope.status, Envelope.Status.SENT)
        self.assertEqual(
            dict(envelope.recipients.values_list('party_key', 'name')),
            {'signer': 'Signer', 'legal': 'Legal'},
        )
        run = WorkflowRun.objects.get(envelope=envelope, workflow=workflow)
        self.assertEqual(run.status, WorkflowRun.Status.RUNNING)
        self.assertEqual(run.current_stage_key, 'signer')

    def test_recipient_list_filters_by_envelope(self):
        other_template = Template.objects.create(organization=self.org, name='Other Template')
        version_one = setup_template_version(
            self.template,
            self.document,
            fields=self._make_fields('party-1'),
        )
        version_two = setup_template_version(
            other_template,
            self.document,
            fields=self._make_fields('party-1'),
        )
        envelope_one = create_envelope_from_template(
            organization=self.org,
            template_version=version_one,
            sender=self.user,
            name='Envelope One',
            recipients=[{'name': 'Envelope One Signer', 'email': 'one@example.com', 'party_key': 'party-1'}],
        )
        envelope_two = create_envelope_from_template(
            organization=self.org,
            template_version=version_two,
            sender=self.user,
            name='Envelope Two',
            recipients=[{'name': 'Envelope Two Signer', 'email': 'two@example.com', 'party_key': 'party-1'}],
        )

        response = self.client.get('/api/v1/recipients/', {'envelope': envelope_one.id})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = [recipient['name'] for recipient in response.data['results']]
        self.assertEqual(names, ['Envelope One Signer'])
        self.assertNotIn('Envelope Two Signer', names)
        self.assertEqual(envelope_two.recipients.count(), 1)

    @patch('envelopes.views.deliver_email_message_task.apply_async')
    def test_recipient_remind_endpoint_queues_single_reminder(self, mock_apply_async):
        version = setup_template_version(
            self.template,
            self.document,
            fields=self._make_fields('party-1'),
        )
        envelope = create_envelope_from_template(
            organization=self.org,
            template_version=version,
            sender=self.user,
            name='Reminder Envelope',
            recipients=[{'name': 'Reminder Signer', 'email': 'signer@example.com', 'party_key': 'party-1'}],
        )
        recipient = envelope.recipients.get()

        response = self.client.post(f'/api/v1/recipients/{recipient.id}/remind/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['queued_email_count'], 1)
        message = EmailMessage.objects.get(id=response.data['email_message'])
        self.assertEqual(message.recipient_id, recipient.id)
        self.assertEqual(message.kind, EmailMessage.Kind.REMINDER)
        mock_apply_async.assert_called_once()
