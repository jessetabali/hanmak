from rest_framework import serializers

from documents.serializers import EnvelopeDocumentSerializer
from envelopes.serializers import EnvelopeSerializer, FormFieldSerializer, RecipientSerializer

from .models import ConsentRecord, EnvelopeFieldValue, Signature, SigningSession


class SigningSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = SigningSession
        fields = ['id', 'envelope', 'recipient', 'token', 'status', 'opened_at', 'submitted_at', 'expires_at', 'ip_address', 'user_agent', 'created_at']
        read_only_fields = ['id', 'token', 'created_at']


class PublicSigningSessionSerializer(SigningSessionSerializer):
    envelope_detail = EnvelopeSerializer(source='envelope', read_only=True)
    recipient_detail = RecipientSerializer(source='recipient', read_only=True)
    fields = serializers.SerializerMethodField(method_name='get_signing_fields')
    all_fields = serializers.SerializerMethodField()
    documents = serializers.SerializerMethodField()
    field_values = serializers.SerializerMethodField()
    is_completed = serializers.SerializerMethodField()
    readonly_reason = serializers.SerializerMethodField()

    class Meta(SigningSessionSerializer.Meta):
        fields = SigningSessionSerializer.Meta.fields + [
            'envelope_detail', 'recipient_detail', 'fields', 'all_fields', 'documents',
            'field_values', 'is_completed', 'readonly_reason',
        ]

    def session_is_completed(self, obj):
        return (
            obj.status == SigningSession.Status.SUBMITTED
            or obj.recipient.status == obj.recipient.Status.SIGNED
            or obj.envelope.status == obj.envelope.Status.COMPLETED
        )

    def get_is_completed(self, obj):
        return self.session_is_completed(obj)

    def get_readonly_reason(self, obj):
        if obj.envelope.status == obj.envelope.Status.COMPLETED:
            return 'This envelope is completed.'
        if obj.recipient.status == obj.recipient.Status.SIGNED or obj.status == SigningSession.Status.SUBMITTED:
            return 'Your signing task has already been submitted.'
        return ''

    def get_signing_fields(self, obj):
        """Fields that belong to the current recipient (or are unassigned) — rendered as interactive controls."""
        queryset = obj.envelope.fields.filter(recipient__isnull=True) | obj.envelope.fields.filter(recipient=obj.recipient)
        return FormFieldSerializer(queryset.distinct().order_by('page', 'y', 'x', 'id'), many=True, context=self.context).data

    def get_all_fields(self, obj):
        """ALL fields on the envelope across every party, including other recipients'.
        The frontend uses this to render previously-submitted values from other
        parties as read-only overlays while the current signer is reviewing/signing."""
        queryset = obj.envelope.fields.all()
        return FormFieldSerializer(queryset.order_by('page', 'y', 'x', 'id'), many=True, context=self.context).data

    def get_documents(self, obj):
        queryset = obj.envelope.envelope_documents.select_related('document').order_by('order')
        return EnvelopeDocumentSerializer(queryset, many=True, context=self.context).data

    def get_field_values(self, obj):
        queryset = obj.envelope.field_values.select_related('recipient', 'field').order_by('field_key', 'id')
        return EnvelopeFieldValueSerializer(queryset, many=True, context=self.context).data


class ConsentRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = ConsentRecord
        fields = ['id', 'envelope', 'recipient', 'signing_session', 'consent_text', 'accepted_at', 'ip_address', 'user_agent']
        read_only_fields = ['id', 'accepted_at']


class SignatureSerializer(serializers.ModelSerializer):
    class Meta:
        model = Signature
        fields = ['id', 'envelope', 'recipient', 'signing_session', 'signature_type', 'typed_name', 'image', 'metadata', 'created_at']
        read_only_fields = ['id', 'created_at']


class EnvelopeFieldValueSerializer(serializers.ModelSerializer):
    attachment_url = serializers.SerializerMethodField()

    class Meta:
        model = EnvelopeFieldValue
        fields = ['id', 'envelope', 'recipient', 'field', 'field_key', 'value', 'attachment', 'attachment_url', 'metadata', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_attachment_url(self, obj):
        if not obj.attachment:
            return ''
        request = self.context.get('request')
        url = obj.attachment.url
        return request.build_absolute_uri(url) if request else url
