from rest_framework import serializers

from .models import AppSetting, EmailSettings, FeatureFlag, GeneralSettings, HealthCheck, Incident, SecuritySettings, StorageSettings


class AppSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = AppSetting
        fields = ['id', 'organization', 'namespace', 'key', 'value', 'is_secret', 'updated_at']
        read_only_fields = ['id', 'updated_at']


class FeatureFlagSerializer(serializers.ModelSerializer):
    class Meta:
        model = FeatureFlag
        fields = [
            'id', 'organization', 'key', 'name', 'module', 'is_enabled',
            'release_stage', 'rollout_percentage', 'owner', 'description',
            'qa_checklist', 'release_notes', 'last_reviewed_at', 'released_at',
            'config', 'updated_at',
        ]
        read_only_fields = ['id', 'updated_at']

    def validate_rollout_percentage(self, value):
        if value > 100:
            raise serializers.ValidationError('Rollout percentage cannot exceed 100.')
        return value


class GeneralSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = GeneralSettings
        fields = [
            'id', 'organization', 'application_name', 'default_timezone', 'default_locale',
            'support_email', 'date_format', 'time_format',
            'default_envelope_expiration_days', 'default_reminder_schedule', 'default_signing_order',
            'require_email_verification', 'allow_mobile_signing',
            'enable_completion_certificates', 'send_audit_trail_on_completion', 'allow_bulk_send',
            'updated_at',
        ]
        read_only_fields = ['id', 'updated_at']


class EmailSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmailSettings
        fields = ['id', 'organization', 'from_email', 'reply_to_email', 'smtp_host', 'smtp_port', 'use_tls', 'use_ssl', 'bounce_provider', 'updated_at']
        read_only_fields = ['id', 'updated_at']


class StorageSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = StorageSettings
        fields = ['id', 'organization', 'backend', 'bucket_name', 'endpoint_url', 'retention_days', 'encrypt_at_rest', 'updated_at']
        read_only_fields = ['id', 'updated_at']


class SecuritySettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = SecuritySettings
        fields = [
            'id', 'organization',
            'require_mfa', 'require_admin_mfa', 'allow_sms_mfa', 'allow_totp_mfa',
            'allow_passkeys', 'remember_device',
            'session_timeout_minutes', 'max_concurrent_sessions',
            'password_min_length', 'password_expiry_days',
            'require_uppercase', 'require_number', 'require_special_char', 'prevent_password_reuse',
            'allowed_ip_ranges', 'updated_at',
        ]
        read_only_fields = ['id', 'updated_at']


class HealthCheckSerializer(serializers.ModelSerializer):
    class Meta:
        model = HealthCheck
        fields = ['id', 'name', 'status', 'message', 'metadata', 'checked_at']
        read_only_fields = ['id', 'checked_at']


class IncidentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Incident
        fields = [
            'id', 'title', 'severity', 'status', 'affected_services',
            'description', 'started_at', 'resolved_at', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
