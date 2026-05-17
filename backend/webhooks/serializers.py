from rest_framework import serializers

from .models import EventOutbox, WebhookDelivery, WebhookEndpoint


class WebhookEndpointSerializer(serializers.ModelSerializer):
    class Meta:
        model = WebhookEndpoint
        fields = ['id', 'organization', 'name', 'target_url', 'events', 'signing_secret', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']


class EventOutboxSerializer(serializers.ModelSerializer):
    class Meta:
        model = EventOutbox
        fields = ['id', 'organization', 'event_type', 'aggregate_type', 'aggregate_id', 'payload', 'published_at', 'created_at']
        read_only_fields = ['id', 'created_at']


class WebhookDeliverySerializer(serializers.ModelSerializer):
    class Meta:
        model = WebhookDelivery
        fields = ['id', 'endpoint', 'event', 'status', 'attempt', 'request_body', 'response_status', 'response_body', 'error_message', 'delivered_at', 'created_at']
        read_only_fields = ['id', 'created_at']
