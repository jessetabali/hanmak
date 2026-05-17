from django.conf import settings
from django.db import models
from django.utils import timezone

from accounts.models import Invitation, Organization
from envelopes.models import Envelope, Recipient
from signing.models import SigningSession


class EmailMessage(models.Model):
    class Kind(models.TextChoices):
        INVITATION = 'invitation', 'Invitation'
        ENVELOPE_INVITE = 'envelope_invite', 'Envelope Invite'
        REMINDER = 'reminder', 'Reminder'
        COMPLETED = 'completed', 'Completed'

    class Status(models.TextChoices):
        QUEUED = 'queued', 'Queued'
        SENT = 'sent', 'Sent'
        FAILED = 'failed', 'Failed'

    organization = models.ForeignKey(Organization, related_name='email_messages', null=True, blank=True, on_delete=models.CASCADE)
    envelope = models.ForeignKey(Envelope, related_name='email_messages', null=True, blank=True, on_delete=models.CASCADE)
    recipient = models.ForeignKey(Recipient, related_name='email_messages', null=True, blank=True, on_delete=models.SET_NULL)
    invitation = models.ForeignKey(Invitation, related_name='email_messages', null=True, blank=True, on_delete=models.SET_NULL)
    signing_session = models.ForeignKey(SigningSession, related_name='email_messages', null=True, blank=True, on_delete=models.SET_NULL)
    kind = models.CharField(max_length=32, choices=Kind.choices)
    to_email = models.EmailField()
    subject = models.CharField(max_length=255)
    body = models.TextField()
    html_body = models.TextField(blank=True)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.QUEUED)
    error_message = models.TextField(blank=True)
    retry_count = models.PositiveIntegerField(default=0)
    max_attempts = models.PositiveIntegerField(default=3)
    next_attempt_at = models.DateTimeField(null=True, blank=True)
    bounced_at = models.DateTimeField(null=True, blank=True)
    bounce_reason = models.TextField(blank=True)
    queued_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    queued_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f'{self.kind} to {self.to_email}'

    @property
    def can_retry(self):
        return self.status == self.Status.FAILED and self.retry_count < self.max_attempts


class EmailTemplate(models.Model):
    organization = models.ForeignKey(Organization, related_name='email_templates', null=True, blank=True, on_delete=models.CASCADE)
    kind = models.CharField(max_length=32, choices=EmailMessage.Kind.choices)
    name = models.CharField(max_length=120)
    subject_template = models.CharField(max_length=255)
    body_template = models.TextField()
    html_template = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('organization', 'kind', 'name')]
        ordering = ['kind', 'name']

    def __str__(self):
        return f'{self.kind}: {self.name}'


class ReminderSchedule(models.Model):
    class Status(models.TextChoices):
        ACTIVE = 'active', 'Active'
        PAUSED = 'paused', 'Paused'
        COMPLETED = 'completed', 'Completed'
        CANCELLED = 'cancelled', 'Cancelled'

    organization = models.ForeignKey(Organization, related_name='reminder_schedules', on_delete=models.CASCADE)
    envelope = models.ForeignKey(Envelope, related_name='reminder_schedules', on_delete=models.CASCADE)
    interval_days = models.PositiveIntegerField(default=2)
    max_reminders = models.PositiveIntegerField(default=3)
    reminders_sent = models.PositiveIntegerField(default=0)
    next_run_at = models.DateTimeField(default=timezone.now)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.ACTIVE)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['next_run_at']
