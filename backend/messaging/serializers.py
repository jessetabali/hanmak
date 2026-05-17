from rest_framework import serializers
from drf_spectacular.utils import OpenApiTypes, extend_schema_field

from .models import EmailMessage, EmailTemplate, ReminderSchedule
from .services import absolute_signing_url


class EmailMessageSerializer(serializers.ModelSerializer):
    signing_url = serializers.SerializerMethodField()

    class Meta:
        model = EmailMessage
        fields = [
            'id', 'organization', 'envelope', 'recipient', 'invitation',
            'signing_session', 'signing_url', 'kind', 'to_email', 'subject',
            'body', 'html_body', 'status', 'error_message', 'retry_count',
            'max_attempts', 'next_attempt_at', 'bounced_at', 'bounce_reason', 'queued_by',
            'queued_at', 'sent_at',
        ]
        read_only_fields = ['id', 'signing_url', 'status', 'error_message', 'queued_by', 'queued_at', 'sent_at']

    @extend_schema_field(OpenApiTypes.URI)
    def get_signing_url(self, obj):
        if not obj.signing_session:
            return ''
        return absolute_signing_url(self.context.get('request'), obj.signing_session)


class ReminderScheduleSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReminderSchedule
        fields = [
            'id', 'organization', 'envelope', 'interval_days', 'max_reminders',
            'reminders_sent', 'next_run_at', 'status', 'created_by',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'reminders_sent', 'created_by', 'created_at', 'updated_at']


class EmailTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmailTemplate
        fields = [
            'id', 'organization', 'kind', 'name', 'subject_template',
            'body_template', 'html_template', 'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
