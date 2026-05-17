from django.contrib import admin

from .models import Document, DocumentPage, DocumentScan, EnvelopeDocument, StoredFile


@admin.register(StoredFile)
class StoredFileAdmin(admin.ModelAdmin):
    list_display = ['original_name', 'organization', 'file_size', 'storage_backend', 'created_at']
    list_filter = ['organization', 'storage_backend']
    search_fields = ['original_name', 'sha256', 'storage_key']


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ['title', 'organization', 'status', 'file_size', 'uploaded_by', 'created_at']
    list_filter = ['status', 'organization']
    search_fields = ['title', 'sha256']


@admin.register(EnvelopeDocument)
class EnvelopeDocumentAdmin(admin.ModelAdmin):
    list_display = ['envelope', 'document', 'order']
    list_filter = ['envelope__organization']
    search_fields = ['envelope__name', 'document__title']


@admin.register(DocumentPage)
class DocumentPageAdmin(admin.ModelAdmin):
    list_display = ['document', 'page_number', 'width', 'height', 'created_at']
    search_fields = ['document__title', 'text_content']


@admin.register(DocumentScan)
class DocumentScanAdmin(admin.ModelAdmin):
    list_display = ['document', 'scanner', 'status', 'signature_version', 'scanned_at', 'created_at']
    list_filter = ['status', 'scanner']
    search_fields = ['document__title', 'signature_version']
