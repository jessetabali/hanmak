import secrets

from django.conf import settings
from django.db import models

from accounts.models import Organization


class OAuthApplication(models.Model):
    class Status(models.TextChoices):
        ACTIVE = 'active', 'Active'
        DISABLED = 'disabled', 'Disabled'

    organization = models.ForeignKey(Organization, related_name='oauth_applications', on_delete=models.CASCADE)
    name = models.CharField(max_length=255)
    client_id = models.CharField(max_length=64, unique=True, default=secrets.token_urlsafe)
    client_secret_hash = models.CharField(max_length=128, blank=True)
    redirect_uris = models.JSONField(default=list, blank=True)
    scopes = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.ACTIVE)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class OAuthGrant(models.Model):
    application = models.ForeignKey(OAuthApplication, related_name='grants', on_delete=models.CASCADE)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='oauth_grants', on_delete=models.CASCADE)
    scopes = models.JSONField(default=list, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.application} grant for {self.user}'
