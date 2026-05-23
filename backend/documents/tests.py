from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import Membership, Organization
from documents.models import Document, EnvelopeDocument
from envelopes.models import Envelope

User = get_user_model()


class DocumentTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='alice', password='pass')
        self.org = Organization.objects.create(name='Alpha Org', slug='alpha')
        self.other_org = Organization.objects.create(name='Beta Org', slug='beta')
        Membership.objects.create(user=self.user, organization=self.org, role=Membership.Role.ADMIN)
        self.client.force_authenticate(self.user)

        self.doc = Document.objects.create(
            organization=self.org,
            uploaded_by=self.user,
            title='Contract.pdf',
            file=SimpleUploadedFile('contract.pdf', b'%PDF-1.4', content_type='application/pdf'),
            page_count=2,
            status=Document.Status.READY,
        )

    def test_list_scoped_to_own_org(self):
        Document.objects.create(
            organization=self.other_org,
            title='Other.pdf',
            file=SimpleUploadedFile('other.pdf', b'%PDF-1.4', content_type='application/pdf'),
        )
        response = self.client.get('/api/v1/documents/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = [d['title'] for d in response.data['results']]
        self.assertIn('Contract.pdf', titles)
        self.assertNotIn('Other.pdf', titles)

    def test_retrieve_document(self):
        response = self.client.get(f'/api/v1/documents/{self.doc.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['title'], 'Contract.pdf')
        self.assertEqual(response.data['page_count'], 2)

    def test_create_document_via_upload(self):
        pdf = SimpleUploadedFile('new.pdf', b'%PDF-1.4', content_type='application/pdf')
        response = self.client.post('/api/v1/documents/', {
            'organization': self.org.id,
            'title': 'New Document.pdf',
            'file': pdf,
        }, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['title'], 'New Document.pdf')

    def test_summary_endpoint(self):
        response = self.client.get('/api/v1/documents/summary/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('total', response.data)
        self.assertIn('ready', response.data)
        self.assertEqual(response.data['total'], 1)
        self.assertEqual(response.data['ready'], 1)

    def test_cannot_access_other_org_document(self):
        other_doc = Document.objects.create(
            organization=self.other_org,
            title='Private.pdf',
            file=SimpleUploadedFile('private.pdf', b'%PDF-1.4', content_type='application/pdf'),
        )
        response = self.client.get(f'/api/v1/documents/{other_doc.id}/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_update_document_title(self):
        response = self.client.patch(f'/api/v1/documents/{self.doc.id}/', {
            'title': 'Renamed Contract.pdf',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['title'], 'Renamed Contract.pdf')

    def test_delete_document(self):
        response = self.client.delete(f'/api/v1/documents/{self.doc.id}/')
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Document.objects.filter(id=self.doc.id).exists())

    def test_envelope_document_list_filters_by_envelope(self):
        envelope_one = Envelope.objects.create(
            organization=self.org,
            sender=self.user,
            name='Envelope One',
        )
        envelope_two = Envelope.objects.create(
            organization=self.org,
            sender=self.user,
            name='Envelope Two',
        )
        other_doc = Document.objects.create(
            organization=self.org,
            uploaded_by=self.user,
            title='Other Contract.pdf',
            file=SimpleUploadedFile('other-contract.pdf', b'%PDF-1.4', content_type='application/pdf'),
            page_count=1,
            status=Document.Status.READY,
        )
        EnvelopeDocument.objects.create(envelope=envelope_one, document=self.doc, order=1)
        EnvelopeDocument.objects.create(envelope=envelope_two, document=other_doc, order=1)

        response = self.client.get('/api/v1/envelope-documents/', {'envelope': envelope_one.id})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        document_ids = [item['document'] for item in response.data['results']]
        self.assertEqual(document_ids, [self.doc.id])
        self.assertNotIn(other_doc.id, document_ids)

    # ── prepare-for-builder multi-page tests ───────────────────────────────────

    def test_prepare_for_builder_uses_client_page_count_when_pypdf_cannot_read(self):
        """When the stored PDF bytes aren't a real PDF (pypdf fails), the endpoint
        must use the page_count supplied by the client rather than defaulting to 1.
        This replicates the production scenario where a browser uses PDF.js to
        count pages and passes the result in the request body.
        """
        doc = Document.objects.create(
            organization=self.org,
            uploaded_by=self.user,
            title='fake-5page.pdf',
            # Not a real PDF — pypdf will raise and detected_count stays 0.
            file=SimpleUploadedFile('fake.pdf', b'not-a-real-pdf', content_type='application/pdf'),
            page_count=0,
        )
        response = self.client.post(
            f'/api/v1/documents/{doc.id}/prepare-for-builder/',
            {'page_count': 5, 'width': 1040},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        doc.refresh_from_db()
        self.assertEqual(doc.page_count, 5, 'page_count must be updated to the client-supplied value')
        from documents.models import DocumentPage
        stored_pages = DocumentPage.objects.filter(document=doc).count()
        self.assertEqual(stored_pages, 5, 'one DocumentPage row must be created per page')

    def test_prepare_for_builder_never_lowers_page_count(self):
        """If page_count is already correctly stored (e.g. 5) and a stale caller
        sends page_count=1, the stored count must NOT be overwritten with 1."""
        doc = Document.objects.create(
            organization=self.org,
            uploaded_by=self.user,
            title='five-page.pdf',
            file=SimpleUploadedFile('five.pdf', b'not-a-real-pdf', content_type='application/pdf'),
            page_count=5,
        )
        # Simulate a stale call that only knows about 1 page.
        response = self.client.post(
            f'/api/v1/documents/{doc.id}/prepare-for-builder/',
            {'page_count': 1, 'width': 1040},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        doc.refresh_from_db()
        self.assertGreaterEqual(doc.page_count, 5, 'page_count must not be lowered below the stored value')

    def test_prepare_for_builder_creates_all_page_stubs(self):
        """DocumentPage rows must be created for every page, not just page 1."""
        doc = Document.objects.create(
            organization=self.org,
            uploaded_by=self.user,
            title='multi.pdf',
            file=SimpleUploadedFile('multi.pdf', b'not-a-real-pdf', content_type='application/pdf'),
            page_count=0,
        )
        self.client.post(
            f'/api/v1/documents/{doc.id}/prepare-for-builder/',
            {'page_count': 3, 'width': 1040},
            format='json',
        )
        from documents.models import DocumentPage
        page_numbers = list(
            DocumentPage.objects.filter(document=doc).values_list('page_number', flat=True).order_by('page_number')
        )
        self.assertEqual(page_numbers, [1, 2, 3], 'pages 1, 2, and 3 must all be stored')

    def test_prepare_for_builder_rendered_pages_matches_page_count(self):
        """The rendered_pages list in the response must contain one entry per page."""
        doc = Document.objects.create(
            organization=self.org,
            uploaded_by=self.user,
            title='rend.pdf',
            file=SimpleUploadedFile('rend.pdf', b'not-a-real-pdf', content_type='application/pdf'),
            page_count=0,
        )
        response = self.client.post(
            f'/api/v1/documents/{doc.id}/prepare-for-builder/',
            {'page_count': 4, 'width': 1040},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rendered = response.data.get('rendered_pages', [])
        self.assertEqual(len(rendered), 4, 'rendered_pages must contain one entry for every page')
