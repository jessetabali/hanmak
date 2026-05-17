from django.db import models

from accounts.models import Organization
from envelopes.models import Envelope


class RiskFinding(models.Model):
    class Severity(models.TextChoices):
        LOW = 'low', 'Low'
        MEDIUM = 'medium', 'Medium'
        HIGH = 'high', 'High'
        CRITICAL = 'critical', 'Critical'

    class Status(models.TextChoices):
        OPEN = 'open', 'Open'
        ACKNOWLEDGED = 'acknowledged', 'Acknowledged'
        RESOLVED = 'resolved', 'Resolved'

    organization = models.ForeignKey(Organization, related_name='risk_findings', on_delete=models.CASCADE)
    envelope = models.ForeignKey(Envelope, related_name='risk_findings', null=True, blank=True, on_delete=models.CASCADE)
    title = models.CharField(max_length=255)
    severity = models.CharField(max_length=32, choices=Severity.choices, default=Severity.MEDIUM)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.OPEN)
    description = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class PolicyRule(models.Model):
    organization = models.ForeignKey(Organization, related_name='policy_rules', on_delete=models.CASCADE)
    name = models.CharField(max_length=255)
    rule_type = models.CharField(max_length=100)
    config = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

# Create your models here.
