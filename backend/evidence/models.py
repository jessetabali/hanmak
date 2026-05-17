from django.conf import settings
from django.db import models

from envelopes.models import Envelope


class EvidenceBundle(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        GENERATING = 'generating', 'Generating'
        READY = 'ready', 'Ready'
        FAILED = 'failed', 'Failed'

    envelope = models.ForeignKey(Envelope, related_name='evidence_bundles', on_delete=models.CASCADE)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.PENDING)
    file = models.FileField(upload_to='evidence/', blank=True)
    sha256 = models.CharField(max_length=64, blank=True)
    signed_pdf = models.FileField(upload_to='signed-pdfs/', blank=True)
    signed_pdf_sha256 = models.CharField(max_length=64, blank=True)
    generated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    error_message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    generated_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f'Evidence bundle for {self.envelope}'

# Create your models here.
