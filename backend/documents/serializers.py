from rest_framework import serializers
from drf_spectacular.utils import OpenApiTypes, extend_schema_field

from .models import Document, DocumentPage, DocumentScan, EnvelopeDocument, StoredFile


class StoredFileSerializer(serializers.ModelSerializer):
    class Meta:
        model = StoredFile
        fields = [
            'id', 'organization', 'uploaded_by', 'original_name', 'file',
            'mime_type', 'file_size', 'sha256', 'storage_backend',
            'storage_key', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class DocumentSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    pages = serializers.SerializerMethodField()
    latest_scan = serializers.SerializerMethodField()
    envelope_count = serializers.SerializerMethodField()
    template_count = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = [
            'id', 'organization', 'source_file', 'uploaded_by', 'title', 'file',
            'file_url', 'mime_type', 'file_size', 'status', 'sha256',
            'page_count', 'pages', 'latest_scan', 'envelope_count',
            'template_count', 'processing_error', 'processed_at', 'created_at',
        ]
        read_only_fields = ['id', 'file_url', 'sha256', 'page_count', 'processing_error', 'processed_at', 'created_at']

    @extend_schema_field(OpenApiTypes.URI)
    def get_file_url(self, obj):
        if not obj.file:
            return ''
        request = self.context.get('request')
        url = obj.file.url
        return request.build_absolute_uri(url) if request else url

    def get_pages(self, obj):
        return DocumentPageSerializer(obj.pages.order_by('page_number'), many=True, context=self.context).data

    def get_latest_scan(self, obj):
        scan = obj.scans.order_by('-created_at').first()
        return DocumentScanSerializer(scan, context=self.context).data if scan else None

    def get_envelope_count(self, obj):
        return obj.envelope_documents.count()

    def get_template_count(self, obj):
        return obj.template_versions.count()


class DocumentPageSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = DocumentPage
        fields = ['id', 'document', 'page_number', 'width', 'height', 'image', 'image_url', 'text_content', 'created_at']
        read_only_fields = ['id', 'image_url', 'created_at']

    @extend_schema_field(OpenApiTypes.URI)
    def get_image_url(self, obj):
        if not obj.image:
            return ''
        request = self.context.get('request')
        url = obj.image.url
        return request.build_absolute_uri(url) if request else url


class DocumentScanSerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentScan
        fields = ['id', 'document', 'scanner', 'status', 'signature_version', 'findings', 'scanned_at', 'created_at']
        read_only_fields = ['id', 'scanned_at', 'created_at']


class EnvelopeDocumentSerializer(serializers.ModelSerializer):
    document_detail = DocumentSerializer(source='document', read_only=True)

    class Meta:
        model = EnvelopeDocument
        fields = ['id', 'envelope', 'document', 'document_detail', 'order']
        read_only_fields = ['id']
