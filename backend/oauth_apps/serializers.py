from rest_framework import serializers

from .models import OAuthApplication, OAuthGrant


class OAuthApplicationSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source='organization.name', read_only=True)
    is_enabled = serializers.SerializerMethodField()

    class Meta:
        model = OAuthApplication
        fields = [
            'id', 'organization', 'organization_name', 'name', 'description', 'client_id',
            'redirect_uris', 'scopes', 'status', 'created_by', 'created_at',
            'updated_at', 'is_enabled',
        ]
        read_only_fields = ['id', 'client_id', 'created_by', 'created_at', 'updated_at', 'is_enabled']

    def get_is_enabled(self, obj):
        return obj.status == OAuthApplication.Status.ACTIVE


class OAuthGrantSerializer(serializers.ModelSerializer):
    application_name = serializers.CharField(source='application.name', read_only=True)
    user_email = serializers.EmailField(source='user.email', read_only=True)

    class Meta:
        model = OAuthGrant
        fields = ['id', 'application', 'application_name', 'user', 'user_email', 'scopes', 'revoked_at', 'expires_at', 'created_at']
        read_only_fields = ['id', 'created_at']
