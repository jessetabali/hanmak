from django.conf import settings
from django.db import models

from accounts.models import Organization
from envelopes.models import Envelope


class WorkflowDefinition(models.Model):
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        ACTIVE = 'active', 'Active'
        ARCHIVED = 'archived', 'Archived'

    organization = models.ForeignKey(Organization, related_name='workflow_definitions', on_delete=models.CASCADE)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.DRAFT)
    schema = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [('organization', 'name')]

    def __str__(self):
        return self.name


class WorkflowStage(models.Model):
    workflow = models.ForeignKey(WorkflowDefinition, related_name='stages', on_delete=models.CASCADE)
    key = models.SlugField()
    label = models.CharField(max_length=255)
    stage_type = models.CharField(max_length=80, default='approval')
    order = models.PositiveIntegerField(default=1)
    config = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['order']
        unique_together = [('workflow', 'key')]

    def __str__(self):
        return f'{self.workflow}: {self.label}'


class WorkflowRun(models.Model):
    class Status(models.TextChoices):
        RUNNING = 'running', 'Running'
        COMPLETED = 'completed', 'Completed'
        FAILED = 'failed', 'Failed'
        CANCELLED = 'cancelled', 'Cancelled'

    envelope = models.ForeignKey(Envelope, related_name='workflow_runs', on_delete=models.CASCADE)
    workflow = models.ForeignKey(WorkflowDefinition, related_name='runs', null=True, blank=True, on_delete=models.SET_NULL)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.RUNNING)
    current_stage_key = models.CharField(max_length=120, blank=True)
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f'{self.envelope} workflow run'


class WorkflowEvent(models.Model):
    run = models.ForeignKey(WorkflowRun, related_name='events', on_delete=models.CASCADE)
    envelope = models.ForeignKey(Envelope, related_name='workflow_events', on_delete=models.CASCADE)
    event_type = models.CharField(max_length=100)
    stage_key = models.CharField(max_length=120, blank=True)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    message = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

# Create your models here.
