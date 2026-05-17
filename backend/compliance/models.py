from django.conf import settings
from django.db import models

from accounts.models import Organization


class LegalHold(models.Model):
    class Status(models.TextChoices):
        ACTIVE = 'active', 'Active'
        RELEASED = 'released', 'Released'

    organization = models.ForeignKey(Organization, related_name='legal_holds', on_delete=models.CASCADE)
    name = models.CharField(max_length=255)
    matter = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.ACTIVE)
    reason = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    expires_at = models.DateTimeField(null=True, blank=True)
    released_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class LegalHoldItem(models.Model):
    legal_hold = models.ForeignKey(LegalHold, related_name='items', on_delete=models.CASCADE)
    object_type = models.CharField(max_length=100)
    object_id = models.CharField(max_length=100)
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('legal_hold', 'object_type', 'object_id')]


class RetentionPolicy(models.Model):
    organization = models.ForeignKey(Organization, related_name='retention_policies', on_delete=models.CASCADE)
    name = models.CharField(max_length=255)
    applies_to = models.CharField(max_length=100, default='envelopes')
    status_filter = models.CharField(max_length=100, blank=True)
    retention_days = models.PositiveIntegerField(default=365)
    action = models.CharField(max_length=80, default='archive')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class ComplianceExport(models.Model):
    class Status(models.TextChoices):
        QUEUED = 'queued', 'Queued'
        READY = 'ready', 'Ready'
        FAILED = 'failed', 'Failed'

    organization = models.ForeignKey(Organization, related_name='compliance_exports', on_delete=models.CASCADE)
    export_type = models.CharField(max_length=100)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.QUEUED)
    date_from = models.DateField(null=True, blank=True)
    date_to = models.DateField(null=True, blank=True)
    file = models.FileField(upload_to='compliance-exports/', blank=True)
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)


class DataResidencyRegion(models.Model):
    code = models.SlugField(unique=True)
    name = models.CharField(max_length=255)
    country_codes = models.JSONField(default=list, blank=True)
    storage_backend = models.CharField(max_length=120, blank=True)
    is_available = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class OrganizationDataResidencyPolicy(models.Model):
    class EnforcementMode(models.TextChoices):
        LOG_ONLY = 'log_only', 'Log Only'
        BLOCK = 'block', 'Block'

    organization = models.OneToOneField(Organization, related_name='data_residency_policy', on_delete=models.CASCADE)
    primary_region = models.ForeignKey(DataResidencyRegion, related_name='primary_policies', on_delete=models.PROTECT)
    allowed_regions = models.ManyToManyField(DataResidencyRegion, related_name='allowed_policies', blank=True)
    enforcement_mode = models.CharField(max_length=32, choices=EnforcementMode.choices, default=EnforcementMode.LOG_ONLY)
    notes = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.organization} data residency'
