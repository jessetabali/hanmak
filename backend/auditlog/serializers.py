from rest_framework import serializers

from .models import AuditEvent


class AuditEventSerializer(serializers.ModelSerializer):
    actor_username = serializers.CharField(source='actor.username', read_only=True)
    organization_name = serializers.CharField(source='organization.name', read_only=True)
    envelope_name = serializers.CharField(source='envelope.name', read_only=True)

    class Meta:
        model = AuditEvent
        fields = [
            'id', 'organization', 'organization_name', 'envelope', 'envelope_name',
            'document', 'actor', 'actor_username', 'severity', 'event_type', 'message', 'ip_address',
            'user_agent', 'metadata', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']
