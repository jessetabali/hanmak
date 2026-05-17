import secrets

from django.db import models

from accounts.models import Organization


class APIKey(models.Model):
    class Status(models.TextChoices):
        ACTIVE = 'active', 'Active'
        REVOKED = 'revoked', 'Revoked'
        EXPIRED = 'expired', 'Expired'

    organization = models.ForeignKey(Organization, related_name='api_keys', on_delete=models.CASCADE)
    name = models.CharField(max_length=255)
    key_prefix = models.CharField(max_length=24, blank=True)
    key_hash = models.CharField(max_length=128)
    scopes = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.ACTIVE)
    last_used_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    @classmethod
    def generate_plaintext_key(cls):
        return 'hm_' + secrets.token_urlsafe(32)

    def __str__(self):
        return self.name


class APIRequestLog(models.Model):
    organization = models.ForeignKey(Organization, related_name='api_request_logs', null=True, blank=True, on_delete=models.SET_NULL)
    api_key = models.ForeignKey(APIKey, related_name='request_logs', null=True, blank=True, on_delete=models.SET_NULL)
    method = models.CharField(max_length=12)
    path = models.CharField(max_length=512)
    status_code = models.PositiveIntegerField()
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    duration_ms = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

# Create your models here.
