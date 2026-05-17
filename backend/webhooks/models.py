from django.db import models

from accounts.models import Organization


class WebhookEndpoint(models.Model):
    organization = models.ForeignKey(Organization, related_name='webhook_endpoints', on_delete=models.CASCADE)
    name = models.CharField(max_length=255)
    target_url = models.URLField()
    events = models.JSONField(default=list, blank=True)
    signing_secret = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class EventOutbox(models.Model):
    organization = models.ForeignKey(Organization, related_name='event_outbox', on_delete=models.CASCADE)
    event_type = models.CharField(max_length=100)
    aggregate_type = models.CharField(max_length=100, blank=True)
    aggregate_id = models.CharField(max_length=100, blank=True)
    payload = models.JSONField(default=dict, blank=True)
    published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.event_type


class WebhookDelivery(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        DELIVERED = 'delivered', 'Delivered'
        FAILED = 'failed', 'Failed'
        RETRYING = 'retrying', 'Retrying'

    endpoint = models.ForeignKey(WebhookEndpoint, related_name='deliveries', on_delete=models.CASCADE)
    event = models.ForeignKey(EventOutbox, related_name='deliveries', on_delete=models.CASCADE)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.PENDING)
    attempt = models.PositiveIntegerField(default=1)
    request_body = models.JSONField(default=dict, blank=True)
    response_status = models.PositiveIntegerField(null=True, blank=True)
    response_body = models.TextField(blank=True)
    error_message = models.TextField(blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.event} -> {self.endpoint}'

# Create your models here.
