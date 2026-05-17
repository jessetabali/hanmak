from django.conf import settings
from django.db import models

from accounts.models import Organization
from envelopes.models import Envelope


class StoredFile(models.Model):
    organization = models.ForeignKey(Organization, related_name='stored_files', on_delete=models.CASCADE)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    original_name = models.CharField(max_length=255)
    file = models.FileField(upload_to='files/')
    mime_type = models.CharField(max_length=120, blank=True)
    file_size = models.PositiveBigIntegerField(default=0)
    sha256 = models.CharField(max_length=64, blank=True)
    storage_backend = models.CharField(max_length=50, default='local')
    storage_key = models.CharField(max_length=512, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.original_name


class Document(models.Model):
    class Status(models.TextChoices):
        UPLOADED = 'uploaded', 'Uploaded'
        PROCESSING = 'processing', 'Processing'
        READY = 'ready', 'Ready'
        FAILED = 'failed', 'Failed'

    organization = models.ForeignKey(Organization, related_name='documents', on_delete=models.CASCADE)
    source_file = models.ForeignKey(StoredFile, related_name='documents', null=True, blank=True, on_delete=models.SET_NULL)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    title = models.CharField(max_length=255)
    file = models.FileField(upload_to='documents/')
    mime_type = models.CharField(max_length=120, blank=True)
    file_size = models.PositiveBigIntegerField(default=0)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.UPLOADED)
    sha256 = models.CharField(max_length=64, blank=True)
    page_count = models.PositiveIntegerField(default=0)
    processing_error = models.TextField(blank=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title


class DocumentPage(models.Model):
    document = models.ForeignKey(Document, related_name='pages', on_delete=models.CASCADE)
    page_number = models.PositiveIntegerField()
    width = models.PositiveIntegerField(default=0)
    height = models.PositiveIntegerField(default=0)
    image = models.FileField(upload_to='document-pages/', blank=True)
    text_content = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['page_number']
        unique_together = [('document', 'page_number')]

    def __str__(self):
        return f'{self.document} page {self.page_number}'


class EnvelopeDocument(models.Model):
    envelope = models.ForeignKey(Envelope, related_name='envelope_documents', on_delete=models.CASCADE)
    document = models.ForeignKey(Document, related_name='envelope_documents', on_delete=models.CASCADE)
    order = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ['order']
        unique_together = [('envelope', 'document')]

    def __str__(self):
        return f'{self.envelope} / {self.document}'


class DocumentScan(models.Model):
    class Status(models.TextChoices):
        QUEUED = 'queued', 'Queued'
        CLEAN = 'clean', 'Clean'
        INFECTED = 'infected', 'Infected'
        FAILED = 'failed', 'Failed'

    document = models.ForeignKey(Document, related_name='scans', on_delete=models.CASCADE)
    scanner = models.CharField(max_length=120, default='hanmak-basic')
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.QUEUED)
    signature_version = models.CharField(max_length=120, blank=True)
    findings = models.JSONField(default=list, blank=True)
    scanned_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.document} scan {self.status}'
