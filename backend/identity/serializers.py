from rest_framework import serializers

from .models import JITProvisioningSettings, LDAPConnection, SCIMConnection, SCIMExternalIdentity, SocialProvider, SSOConnection, SSOState


class SSOConnectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = SSOConnection
        fields = ['id', 'organization', 'name', 'provider_type', 'is_enabled', 'config', 'metadata_url', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class SCIMConnectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = SCIMConnection
        fields = ['id', 'organization', 'base_url', 'token_prefix', 'is_enabled', 'config', 'created_at']
        read_only_fields = ['id', 'token_prefix', 'created_at']


class SCIMExternalIdentitySerializer(serializers.ModelSerializer):
    class Meta:
        model = SCIMExternalIdentity
        fields = ['id', 'organization', 'provider', 'external_id', 'user_email', 'raw', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class SSOStateSerializer(serializers.ModelSerializer):
    class Meta:
        model = SSOState
        fields = ['id', 'connection', 'user', 'state', 'nonce', 'redirect_uri', 'created_at', 'expires_at', 'consumed_at']
        read_only_fields = ['id', 'state', 'nonce', 'created_at', 'consumed_at']


class LDAPConnectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = LDAPConnection
        fields = [
            'id', 'organization', 'host', 'port', 'use_ssl', 'use_tls',
            'bind_dn', 'bind_password', 'base_dn', 'user_filter', 'username_attribute',
            'email_attribute', 'is_enabled', 'config', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
        extra_kwargs = {'bind_password': {'write_only': True}}


class JITProvisioningSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = JITProvisioningSettings
        fields = [
            'id', 'organization', 'is_enabled', 'auto_create_user', 'update_on_login',
            'default_role', 'allowed_domains', 'require_domain_match',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class SocialProviderSerializer(serializers.ModelSerializer):
    class Meta:
        model = SocialProvider
        fields = [
            'id', 'organization', 'provider_type', 'client_id', 'client_secret',
            'is_enabled', 'allowed_domains', 'config', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
        extra_kwargs = {'client_secret': {'write_only': True}}
