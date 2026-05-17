from rest_framework import serializers

from .models import OAuthApplication, OAuthGrant


class OAuthApplicationSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source='organization.name', read_only=True)

    class Meta:
        model = OAuthApplication
        fields = [
            'id', 'organization', 'organization_name', 'name', 'client_id',
            'redirect_uris', 'scopes', 'status', 'created_by', 'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'client_id', 'created_by', 'created_at', 'updated_at']


class OAuthGrantSerializer(serializers.ModelSerializer):
    application_name = serializers.CharField(source='application.name', read_only=True)

    class Meta:
        model = OAuthGrant
        fields = ['id', 'application', 'application_name', 'user', 'scopes', 'revoked_at', 'expires_at', 'created_at']
        read_only_fields = ['id', 'created_at']
