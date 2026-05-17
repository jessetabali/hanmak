from django.conf import settings
from django.db import models

from accounts.models import Organization
from documents.models import Document
from envelopes.models import Envelope


class AuditEvent(models.Model):
    class Severity(models.TextChoices):
        INFO = 'info', 'Info'
        WARNING = 'warning', 'Warning'
        ERROR = 'error', 'Error'
        SECURITY = 'security', 'Security'

    organization = models.ForeignKey(Organization, related_name='audit_events', on_delete=models.CASCADE)
    envelope = models.ForeignKey(Envelope, related_name='audit_events', null=True, blank=True, on_delete=models.CASCADE)
    document = models.ForeignKey(Document, related_name='audit_events', null=True, blank=True, on_delete=models.SET_NULL)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    severity = models.CharField(max_length=32, choices=Severity.choices, default=Severity.INFO)
    event_type = models.CharField(max_length=100)
    message = models.TextField()
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.event_type} at {self.created_at:%Y-%m-%d %H:%M:%S}'

# Create your models here.
