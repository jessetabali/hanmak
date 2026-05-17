import secrets

from django.db import models

from envelopes.models import Envelope, FormField, Recipient


class SigningSession(models.Model):
    class Status(models.TextChoices):
        CREATED = 'created', 'Created'
        OPENED = 'opened', 'Opened'
        SUBMITTED = 'submitted', 'Submitted'
        EXPIRED = 'expired', 'Expired'
        REVOKED = 'revoked', 'Revoked'
        DECLINED = 'declined', 'Declined'

    envelope = models.ForeignKey(Envelope, related_name='signing_sessions', on_delete=models.CASCADE)
    recipient = models.ForeignKey(Recipient, related_name='signing_sessions', on_delete=models.CASCADE)
    token = models.CharField(max_length=96, unique=True, default=secrets.token_urlsafe)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.CREATED)
    opened_at = models.DateTimeField(null=True, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'Signing session for {self.recipient}'


class ConsentRecord(models.Model):
    envelope = models.ForeignKey(Envelope, related_name='consent_records', on_delete=models.CASCADE)
    recipient = models.ForeignKey(Recipient, related_name='consent_records', on_delete=models.CASCADE)
    signing_session = models.ForeignKey(SigningSession, related_name='consent_records', null=True, blank=True, on_delete=models.SET_NULL)
    consent_text = models.TextField()
    accepted_at = models.DateTimeField(auto_now_add=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)

    def __str__(self):
        return f'Consent from {self.recipient}'


class Signature(models.Model):
    class SignatureType(models.TextChoices):
        TYPED = 'typed', 'Typed'
        DRAWN = 'drawn', 'Drawn'
        UPLOADED = 'uploaded', 'Uploaded'

    envelope = models.ForeignKey(Envelope, related_name='signatures', on_delete=models.CASCADE)
    recipient = models.ForeignKey(Recipient, related_name='signatures', on_delete=models.CASCADE)
    signing_session = models.ForeignKey(SigningSession, related_name='signatures', null=True, blank=True, on_delete=models.SET_NULL)
    signature_type = models.CharField(max_length=32, choices=SignatureType.choices)
    typed_name = models.CharField(max_length=255, blank=True)
    image = models.FileField(upload_to='signatures/', blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.recipient} signature'


class EnvelopeFieldValue(models.Model):
    envelope = models.ForeignKey(Envelope, related_name='field_values', on_delete=models.CASCADE)
    recipient = models.ForeignKey(Recipient, related_name='field_values', null=True, blank=True, on_delete=models.SET_NULL)
    field = models.ForeignKey(FormField, related_name='values', null=True, blank=True, on_delete=models.SET_NULL)
    field_key = models.SlugField()
    value = models.TextField(blank=True)
    attachment = models.FileField(upload_to='field_attachments/', blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [('envelope', 'field_key', 'recipient')]

    def __str__(self):
        return f'{self.envelope}: {self.field_key}'

# Create your models here.
