from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import Membership, Organization
from documents.models import Document
from envelopes.models import Template, TemplateParty
from envelopes.services import setup_template_version


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
