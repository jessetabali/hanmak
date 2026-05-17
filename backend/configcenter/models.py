from django.db import models

from accounts.models import Organization


class AppSetting(models.Model):
    organization = models.ForeignKey(Organization, related_name='app_settings', null=True, blank=True, on_delete=models.CASCADE)
    namespace = models.CharField(max_length=120)
    key = models.CharField(max_length=120)
    value = models.JSONField(default=dict, blank=True)
    is_secret = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [('organization', 'namespace', 'key')]

    def __str__(self):
        return f'{self.namespace}.{self.key}'


class FeatureFlag(models.Model):
    class Module(models.TextChoices):
        CORE = 'core', 'Core'
        SIGNING = 'signing', 'Signing'
        TEMPLATES = 'templates', 'Templates'
        WORKFLOW = 'workflow', 'Workflow'
        DEVELOPER = 'developer', 'Developer'
        ADMIN = 'admin', 'Admin'
        COMPLIANCE = 'compliance', 'Compliance'
        BILLING = 'billing', 'Billing'
        INTEGRATIONS = 'integrations', 'Integrations'
        OPERATIONS = 'operations', 'Operations'

    class ReleaseStage(models.TextChoices):
        PLANNED = 'planned', 'Planned'
        INTERNAL = 'internal', 'Internal QA'
        BETA = 'beta', 'Beta'
        RELEASED = 'released', 'Released'
        PAUSED = 'paused', 'Paused'
        RETIRED = 'retired', 'Retired'

    organization = models.ForeignKey(Organization, related_name='feature_flags', null=True, blank=True, on_delete=models.CASCADE)
    key = models.CharField(max_length=120)
    name = models.CharField(max_length=160, blank=True)
    module = models.CharField(max_length=32, choices=Module.choices, default=Module.CORE)
    is_enabled = models.BooleanField(default=False)
    release_stage = models.CharField(max_length=32, choices=ReleaseStage.choices, default=ReleaseStage.PLANNED)
    rollout_percentage = models.PositiveSmallIntegerField(default=0)
    owner = models.CharField(max_length=120, blank=True)
    description = models.TextField(blank=True)
    qa_checklist = models.JSONField(default=list, blank=True)
    release_notes = models.TextField(blank=True)
    last_reviewed_at = models.DateTimeField(null=True, blank=True)
    released_at = models.DateTimeField(null=True, blank=True)
    config = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [('organization', 'key')]

    def __str__(self):
        return self.name or self.key


class GeneralSettings(models.Model):
    class ReminderSchedule(models.TextChoices):
        NONE = 'none', 'None'
        DAILY = 'daily', 'Daily'
        EVERY_2_DAYS = 'every_2_days', 'Every 2 days'
        EVERY_3_DAYS = 'every_3_days', 'Every 3 days'

    class SigningOrder(models.TextChoices):
        SEQUENTIAL = 'sequential', 'Sequential'
        PARALLEL = 'parallel', 'Parallel'

    organization = models.OneToOneField(Organization, related_name='general_settings', null=True, blank=True, on_delete=models.CASCADE)
    application_name = models.CharField(max_length=120, default='HanMak')
    default_timezone = models.CharField(max_length=64, default='UTC')
    default_locale = models.CharField(max_length=32, default='en-US')
    support_email = models.EmailField(blank=True)
    date_format = models.CharField(max_length=32, default='YYYY-MM-DD')
    time_format = models.CharField(max_length=16, default='12h')
    default_envelope_expiration_days = models.PositiveIntegerField(default=30)
    default_reminder_schedule = models.CharField(max_length=32, choices=ReminderSchedule.choices, default=ReminderSchedule.EVERY_2_DAYS)
    default_signing_order = models.CharField(max_length=32, choices=SigningOrder.choices, default=SigningOrder.SEQUENTIAL)
    require_email_verification = models.BooleanField(default=True)
    allow_mobile_signing = models.BooleanField(default=True)
    enable_completion_certificates = models.BooleanField(default=True)
    send_audit_trail_on_completion = models.BooleanField(default=True)
    allow_bulk_send = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)


class EmailSettings(models.Model):
    organization = models.OneToOneField(Organization, related_name='email_settings', null=True, blank=True, on_delete=models.CASCADE)
    from_email = models.EmailField(default='no-reply@hanmak.local')
    reply_to_email = models.EmailField(blank=True)
    smtp_host = models.CharField(max_length=255, blank=True)
    smtp_port = models.PositiveIntegerField(default=587)
    use_tls = models.BooleanField(default=True)
    use_ssl = models.BooleanField(default=False)
    bounce_provider = models.CharField(max_length=80, blank=True)
    updated_at = models.DateTimeField(auto_now=True)


class StorageSettings(models.Model):
    organization = models.OneToOneField(Organization, related_name='storage_settings', null=True, blank=True, on_delete=models.CASCADE)
    backend = models.CharField(max_length=80, default='local')
    bucket_name = models.CharField(max_length=255, blank=True)
    endpoint_url = models.URLField(blank=True)
    retention_days = models.PositiveIntegerField(default=2555)
    encrypt_at_rest = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)


class SecuritySettings(models.Model):
    organization = models.OneToOneField(Organization, related_name='security_settings', null=True, blank=True, on_delete=models.CASCADE)
    require_mfa = models.BooleanField(default=False)
    require_admin_mfa = models.BooleanField(default=False)
    allow_sms_mfa = models.BooleanField(default=False)
    allow_totp_mfa = models.BooleanField(default=True)
    allow_passkeys = models.BooleanField(default=True)
    remember_device = models.BooleanField(default=True)
    session_timeout_minutes = models.PositiveIntegerField(default=480)
    max_concurrent_sessions = models.PositiveIntegerField(default=5)
    password_min_length = models.PositiveIntegerField(default=8)
    password_expiry_days = models.PositiveIntegerField(default=90)
    require_uppercase = models.BooleanField(default=True)
    require_number = models.BooleanField(default=True)
    require_special_char = models.BooleanField(default=True)
    prevent_password_reuse = models.BooleanField(default=True)
    allowed_ip_ranges = models.JSONField(default=list, blank=True)
    updated_at = models.DateTimeField(auto_now=True)


class HealthCheck(models.Model):
    name = models.CharField(max_length=120, unique=True)
    status = models.CharField(max_length=32, default='unknown')
    message = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    checked_at = models.DateTimeField(auto_now=True)


class Incident(models.Model):
    class Severity(models.TextChoices):
        MINOR = 'minor', 'Minor'
        MAJOR = 'major', 'Major'
        CRITICAL = 'critical', 'Critical'

    class Status(models.TextChoices):
        INVESTIGATING = 'investigating', 'Investigating'
        IDENTIFIED = 'identified', 'Identified'
        MONITORING = 'monitoring', 'Monitoring'
        RESOLVED = 'resolved', 'Resolved'

    title = models.CharField(max_length=255)
    severity = models.CharField(max_length=32, choices=Severity.choices, default=Severity.MINOR)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.INVESTIGATING)
    affected_services = models.JSONField(default=list, blank=True)
    description = models.TextField(blank=True)
    started_at = models.DateTimeField()
    resolved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-started_at']

    def __str__(self):
        return self.title
