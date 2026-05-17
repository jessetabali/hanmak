from django.conf import settings
from django.db import models

from accounts.models import Organization


class TaskDefinition(models.Model):
    name = models.CharField(max_length=255, unique=True)
    queue_name = models.CharField(max_length=100, default='default')
    is_restartable = models.BooleanField(default=True)
    max_attempts = models.PositiveIntegerField(default=3)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class TaskRun(models.Model):
    class Status(models.TextChoices):
        QUEUED = 'queued', 'Queued'
        RUNNING = 'running', 'Running'
        SUCCEEDED = 'succeeded', 'Succeeded'
        FAILED = 'failed', 'Failed'
        RETRYING = 'retrying', 'Retrying'
        CANCELLED = 'cancelled', 'Cancelled'
        REVOKED = 'revoked', 'Revoked'

    organization = models.ForeignKey(Organization, related_name='task_runs', null=True, blank=True, on_delete=models.CASCADE)
    definition = models.ForeignKey(TaskDefinition, related_name='runs', null=True, blank=True, on_delete=models.SET_NULL)
    celery_task_id = models.CharField(max_length=255, blank=True)
    parent = models.ForeignKey('self', related_name='children', null=True, blank=True, on_delete=models.SET_NULL)
    restarted_from = models.ForeignKey('self', related_name='restarts', null=True, blank=True, on_delete=models.SET_NULL)
    task_name = models.CharField(max_length=255)
    queue_name = models.CharField(max_length=100, default='default')
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.QUEUED)
    related_object_type = models.CharField(max_length=100, blank=True)
    related_object_id = models.CharField(max_length=100, blank=True)
    idempotency_key = models.CharField(max_length=255, blank=True)
    payload = models.JSONField(default=dict, blank=True)
    result = models.JSONField(default=dict, blank=True)
    error_type = models.CharField(max_length=255, blank=True)
    error_message = models.TextField(blank=True)
    traceback = models.TextField(blank=True)
    attempt_number = models.PositiveIntegerField(default=1)
    max_attempts = models.PositiveIntegerField(default=3)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    queued_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    next_retry_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-queued_at']

    def __str__(self):
        return f'{self.task_name} ({self.status})'


class TaskRunEvent(models.Model):
    task_run = models.ForeignKey(TaskRun, related_name='events', on_delete=models.CASCADE)
    event_type = models.CharField(max_length=100)
    message = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f'{self.task_run}: {self.event_type}'

# Create your models here.
