from django.contrib import admin

from .models import EventOutbox, WebhookDelivery, WebhookEndpoint


@admin.register(WebhookEndpoint)
class WebhookEndpointAdmin(admin.ModelAdmin):
    list_display = ['name', 'organization', 'target_url', 'is_active', 'created_at']
    list_filter = ['is_active', 'organization']
    search_fields = ['name', 'target_url']


@admin.register(EventOutbox)
class EventOutboxAdmin(admin.ModelAdmin):
    list_display = ['event_type', 'organization', 'aggregate_type', 'aggregate_id', 'published_at', 'created_at']
    list_filter = ['event_type', 'organization']


@admin.register(WebhookDelivery)
class WebhookDeliveryAdmin(admin.ModelAdmin):
    list_display = ['endpoint', 'event', 'status', 'attempt', 'response_status', 'delivered_at', 'created_at']
    list_filter = ['status', 'endpoint']

# Register your models here.
