from django.conf import settings
from django.db import models

from accounts.models import Organization


class Plan(models.Model):
    name = models.CharField(max_length=120, unique=True)
    code = models.SlugField(unique=True)
    monthly_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    features = models.JSONField(default=list, blank=True)
    limits = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class Subscription(models.Model):
    class Status(models.TextChoices):
        TRIALING = 'trialing', 'Trialing'
        ACTIVE = 'active', 'Active'
        PAST_DUE = 'past_due', 'Past Due'
        CANCELLED = 'cancelled', 'Cancelled'

    organization = models.OneToOneField(Organization, related_name='subscription', on_delete=models.CASCADE)
    plan = models.ForeignKey(Plan, related_name='subscriptions', on_delete=models.PROTECT)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.ACTIVE)
    current_period_start = models.DateField(null=True, blank=True)
    current_period_end = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class UsageRecord(models.Model):
    organization = models.ForeignKey(Organization, related_name='usage_records', on_delete=models.CASCADE)
    metric_key = models.CharField(max_length=120)
    quantity = models.PositiveIntegerField(default=0)
    period_start = models.DateField()
    period_end = models.DateField()
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class LicenseKey(models.Model):
    organization = models.ForeignKey(Organization, related_name='license_keys', on_delete=models.CASCADE)
    key = models.CharField(max_length=255, unique=True)
    edition = models.CharField(max_length=80, default='Community')
    status = models.CharField(max_length=32, default='active')
    features = models.JSONField(default=list, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    activated_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.key


class Invoice(models.Model):
    class Status(models.TextChoices):
        PAID = 'paid', 'Paid'
        OPEN = 'open', 'Open'
        VOID = 'void', 'Void'
        UNCOLLECTIBLE = 'uncollectible', 'Uncollectible'

    organization = models.ForeignKey(Organization, related_name='invoices', on_delete=models.CASCADE)
    invoice_number = models.CharField(max_length=64, unique=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    currency = models.CharField(max_length=8, default='USD')
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.OPEN)
    period_start = models.DateField()
    period_end = models.DateField()
    pdf_url = models.URLField(blank=True)
    due_date = models.DateField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.invoice_number} – {self.organization}'


class PaymentMethod(models.Model):
    class MethodType(models.TextChoices):
        CARD = 'card', 'Card'
        BANK_TRANSFER = 'bank_transfer', 'Bank Transfer'
        INVOICE = 'invoice', 'Invoice'

    organization = models.OneToOneField(Organization, related_name='payment_method', on_delete=models.CASCADE)
    method_type = models.CharField(max_length=32, choices=MethodType.choices, default=MethodType.CARD)
    brand = models.CharField(max_length=32, blank=True)
    last4 = models.CharField(max_length=4, blank=True)
    exp_month = models.PositiveSmallIntegerField(null=True, blank=True)
    exp_year = models.PositiveSmallIntegerField(null=True, blank=True)
    holder_name = models.CharField(max_length=255, blank=True)
    is_default = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.brand} •••• {self.last4} ({self.organization})'


class PaymentPortalSession(models.Model):
    class SessionType(models.TextChoices):
        CHECKOUT = 'checkout', 'Checkout'
        PORTAL = 'portal', 'Customer Portal'

    class Status(models.TextChoices):
        CREATED = 'created', 'Created'
        OPENED = 'opened', 'Opened'
        COMPLETED = 'completed', 'Completed'
        EXPIRED = 'expired', 'Expired'

    organization = models.ForeignKey(Organization, related_name='payment_portal_sessions', on_delete=models.CASCADE)
    session_type = models.CharField(max_length=32, choices=SessionType.choices)
    plan = models.ForeignKey(Plan, related_name='payment_portal_sessions', null=True, blank=True, on_delete=models.SET_NULL)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.CREATED)
    provider = models.CharField(max_length=80, default='mock')
    provider_session_id = models.CharField(max_length=255, blank=True)
    url = models.URLField(max_length=1000)
    success_url = models.URLField(blank=True)
    cancel_url = models.URLField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='payment_portal_sessions', null=True, blank=True, on_delete=models.SET_NULL)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


class PaymentWebhookEvent(models.Model):
    class Status(models.TextChoices):
        RECEIVED = 'received', 'Received'
        PROCESSED = 'processed', 'Processed'
        IGNORED = 'ignored', 'Ignored'
        FAILED = 'failed', 'Failed'

    provider = models.CharField(max_length=80, default='mock')
    provider_event_id = models.CharField(max_length=255)
    event_type = models.CharField(max_length=160)
    organization = models.ForeignKey(Organization, related_name='payment_webhook_events', null=True, blank=True, on_delete=models.SET_NULL)
    portal_session = models.ForeignKey(PaymentPortalSession, related_name='webhook_events', null=True, blank=True, on_delete=models.SET_NULL)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.RECEIVED)
    payload = models.JSONField(default=dict, blank=True)
    processing_notes = models.TextField(blank=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = [('provider', 'provider_event_id')]

    def __str__(self):
        return f'{self.provider}:{self.event_type}:{self.provider_event_id}'
