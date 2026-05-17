import hashlib

from django.core.files.base import ContentFile
from django.db.models import Count, Sum
from django.utils import timezone
from rest_framework import decorators, permissions, response, viewsets

from accounts.permissions import OrganizationRolePermission, OrganizationScopedQuerySetMixin
from compliance.services import assert_not_under_active_legal_hold, validate_data_residency_for_organization

from .models import Document, DocumentPage, DocumentScan, EnvelopeDocument, StoredFile
from .rendering import CANONICAL_PAGE_WIDTH, DEFAULT_PAGE_HEIGHT, generate_document_page_images, rasterization_capabilities
from .serializers import DocumentPageSerializer, DocumentScanSerializer, DocumentSerializer, EnvelopeDocumentSerializer, StoredFileSerializer


class StoredFileViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'file_library'
    write_roles = OrganizationRolePermission.write_roles
    queryset = StoredFile.objects.select_related('organization', 'uploaded_by').all().order_by('-created_at')
    serializer_class = StoredFileSerializer
    permission_classes = [OrganizationRolePermission]


class DocumentViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'file_library'
    write_roles = OrganizationRolePermission.write_roles
    queryset = Document.objects.select_related('organization', 'uploaded_by').all().order_by('-created_at')
    serializer_class = DocumentSerializer
    permission_classes = [OrganizationRolePermission]

    @decorators.action(detail=False, methods=['get'])
    def summary(self, request):
        queryset = self.filter_queryset(self.get_queryset())
        status_counts = dict(queryset.values_list('status').annotate(total=Count('id')))
        totals = queryset.aggregate(file_size=Sum('file_size'), pages=Sum('page_count'))
        return response.Response({
            'total': queryset.count(),
            'uploaded': status_counts.get(Document.Status.UPLOADED, 0),
            'processing': status_counts.get(Document.Status.PROCESSING, 0),
            'ready': status_counts.get(Document.Status.READY, 0),
            'failed': status_counts.get(Document.Status.FAILED, 0),
            'file_size': totals.get('file_size') or 0,
            'pages': totals.get('pages') or 0,
        })

    def get_queryset(self):
        queryset = super().get_queryset()
        organization_id = self.request.query_params.get('organization')
        status_value = self.request.query_params.get('status')
        search = self.request.query_params.get('search')
        ordering = self.request.query_params.get('ordering')
        if organization_id:
            queryset = queryset.filter(organization_id=organization_id)
        if status_value:
            queryset = queryset.filter(status=status_value)
        if search:
            queryset = queryset.filter(title__icontains=search)
        allowed_ordering = {
            'title': 'title',
            '-title': '-title',
            'created_at': 'created_at',
            '-created_at': '-created_at',
            'file_size': 'file_size',
            '-file_size': '-file_size',
        }
        if ordering in allowed_ordering:
            queryset = queryset.order_by(allowed_ordering[ordering])
        return queryset

    def perform_create(self, serializer):
        self._assert_related_organization_access(serializer)
        validate_data_residency_for_organization(serializer.validated_data['organization'])
        document = serializer.save(uploaded_by=self.request.user)
        if document.file:
            document.file_size = document.file.size
            document.mime_type = getattr(document.file.file, 'content_type', document.mime_type)
            hasher = hashlib.sha256()
            for chunk in document.file.chunks():
                hasher.update(chunk)
            document.sha256 = hasher.hexdigest()
            document.save(update_fields=['uploaded_by', 'file_size', 'mime_type', 'sha256'])

    def perform_destroy(self, instance):
        assert_not_under_active_legal_hold('document', instance.id)
        return super().perform_destroy(instance)

    @decorators.action(detail=True, methods=['post'])
    def process(self, request, pk=None):
        document = self.get_object()
        document.status = Document.Status.READY
        document.page_count = max(document.page_count, int(request.data.get('page_count') or 1))
        document.processing_error = ''
        document.processed_at = timezone.now()
        document.save(update_fields=['status', 'page_count', 'processing_error', 'processed_at'])
        for page_number in range(1, document.page_count + 1):
            DocumentPage.objects.get_or_create(
                document=document,
                page_number=page_number,
                defaults={'width': CANONICAL_PAGE_WIDTH, 'height': DEFAULT_PAGE_HEIGHT},
            )
        return response.Response(self.get_serializer(document).data)

    @decorators.action(detail=True, methods=['post'], url_path='prepare-for-builder')
    def prepare_for_builder(self, request, pk=None):
        document = self.get_object()
        if not document.page_count:
            document.page_count = int(request.data.get('page_count') or 1)
        document.status = Document.Status.READY
        document.processing_error = ''
        document.processed_at = timezone.now()
        document.save(update_fields=['status', 'page_count', 'processing_error', 'processed_at'])
        for page_number in range(1, document.page_count + 1):
            DocumentPage.objects.get_or_create(
                document=document,
                page_number=page_number,
                defaults={'width': CANONICAL_PAGE_WIDTH, 'height': DEFAULT_PAGE_HEIGHT},
            )
        if not document.scans.exists():
            DocumentScan.objects.create(
                document=document,
                status=DocumentScan.Status.CLEAN,
                signature_version='basic-2026.05',
                findings=[],
                scanned_at=timezone.now(),
            )
        pages = generate_document_page_images(document, target_width=int(request.data.get('width') or CANONICAL_PAGE_WIDTH))
        data = self.get_serializer(document).data
        data['rendered_pages'] = DocumentPageSerializer(pages, many=True, context=self.get_serializer_context()).data
        return response.Response(data)

    @decorators.action(detail=True, methods=['post'])
    def scan(self, request, pk=None):
        document = self.get_object()
        findings = []
        if document.file_size > 50 * 1024 * 1024:
            findings.append({'severity': 'warning', 'message': 'File exceeds recommended 50MB review threshold.'})
        if document.mime_type and document.mime_type not in ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']:
            findings.append({'severity': 'info', 'message': f'MIME type {document.mime_type} should be reviewed.'})
        scan = DocumentScan.objects.create(
            document=document,
            status=DocumentScan.Status.CLEAN,
            signature_version='basic-2026.05',
            findings=findings,
            scanned_at=timezone.now(),
        )
        return response.Response(DocumentScanSerializer(scan, context=self.get_serializer_context()).data)

    @decorators.action(detail=True, methods=['post'])
    def render_pages(self, request, pk=None):
        document = self.get_object()
        if not document.page_count:
            document.page_count = int(request.data.get('page_count') or 1)
            document.save(update_fields=['page_count'])
        pages = generate_document_page_images(document, target_width=int(request.data.get('width') or CANONICAL_PAGE_WIDTH))
        return response.Response(DocumentPageSerializer(pages, many=True, context=self.get_serializer_context()).data)

    @decorators.action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        source = self.get_object()
        duplicate = Document.objects.create(
            organization=source.organization,
            source_file=source.source_file,
            uploaded_by=request.user,
            title=request.data.get('title') or f'{source.title} Copy',
            mime_type=source.mime_type,
            file_size=source.file_size,
            status=source.status,
            sha256=source.sha256,
            page_count=source.page_count,
            processing_error=source.processing_error,
            processed_at=source.processed_at,
        )
        if source.file:
            source.file.open('rb')
            duplicate.file.save(source.file.name.split('/')[-1], ContentFile(source.file.read()), save=True)
            source.file.close()
        for page in source.pages.all():
            copied = DocumentPage.objects.create(
                document=duplicate,
                page_number=page.page_number,
                width=page.width,
                height=page.height,
                text_content=page.text_content,
            )
            if page.image:
                page.image.open('rb')
                copied.image.save(page.image.name.split('/')[-1], ContentFile(page.image.read()), save=True)
                page.image.close()
        return response.Response(self.get_serializer(duplicate).data, status=201)

    @decorators.action(detail=False, methods=['get'], url_path='rendering-capabilities')
    def rendering_capabilities(self, request):
        return response.Response(rasterization_capabilities())


class EnvelopeDocumentViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'envelope_management'
    write_roles = OrganizationRolePermission.write_roles
    queryset = EnvelopeDocument.objects.select_related('envelope', 'document').all().order_by('envelope_id', 'order')
    serializer_class = EnvelopeDocumentSerializer
    permission_classes = [OrganizationRolePermission]


class DocumentPageViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'file_library'
    write_roles = OrganizationRolePermission.write_roles
    queryset = DocumentPage.objects.select_related('document').all().order_by('document_id', 'page_number')
    serializer_class = DocumentPageSerializer
    permission_classes = [OrganizationRolePermission]


class DocumentScanViewSet(OrganizationScopedQuerySetMixin, viewsets.ReadOnlyModelViewSet):
    feature_flag_key = 'file_library'
    queryset = DocumentScan.objects.select_related('document', 'document__organization').all().order_by('-created_at')
    serializer_class = DocumentScanSerializer
    permission_classes = [OrganizationRolePermission]
