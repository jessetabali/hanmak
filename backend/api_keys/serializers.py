from rest_framework import serializers

from .models import APIKey, APIRequestLog


class APIKeySerializer(serializers.ModelSerializer):
    class Meta:
        model = APIKey
        fields = ['id', 'organization', 'name', 'key_prefix', 'scopes', 'status', 'last_used_at', 'expires_at', 'created_at']
        read_only_fields = ['id', 'key_prefix', 'last_used_at', 'created_at']


class APIRequestLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = APIRequestLog
        fields = ['id', 'organization', 'api_key', 'method', 'path', 'status_code', 'ip_address', 'user_agent', 'duration_ms', 'created_at']
        read_only_fields = ['id', 'created_at']
