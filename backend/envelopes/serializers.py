from django.utils import timezone
from rest_framework import serializers
from drf_spectacular.utils import OpenApiTypes, extend_schema_field

from .models import Envelope, FormField, Recipient, Template, TemplateParty, TemplateVersion


class FormFieldSerializer(serializers.ModelSerializer):
    coordinate_basis = serializers.SerializerMethodField()

    class Meta:
        model = FormField
        fields = [
            'id', 'template', 'envelope', 'recipient', 'field_type', 'label',
            'template_version', 'party', 'document_page', 'field_key',
            'required', 'page', 'x', 'y', 'width', 'height', 'page_width',
            'page_height', 'coordinate_basis', 'value', 'options',
        ]
        read_only_fields = ['id']

    def get_coordinate_basis(self, obj):
        return 'canonical-1040'


class TemplatePartySerializer(serializers.ModelSerializer):
    class Meta:
        model = TemplateParty
        fields = ['id', 'template_version', 'role_key', 'label', 'routing_order']
        read_only_fields = ['id']


class TemplateVersionSerializer(serializers.ModelSerializer):
    parties = TemplatePartySerializer(many=True, read_only=True)
    field_count = serializers.SerializerMethodField()

    class Meta:
        model = TemplateVersion
        fields = [
            'id', 'template', 'version_number', 'document', 'field_schema',
            'workflow_schema', 'changelog', 'is_published', 'created_by',
            'parties', 'field_count', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']

    def get_field_count(self, obj):
        fields = obj.field_schema.get('fields') if isinstance(obj.field_schema, dict) else []
        return len(fields or []) or obj.fields.count()


class RecipientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Recipient
        fields = [
            'id', 'envelope', 'delegated_from', 'name', 'email', 'role', 'status',
            'party_key', 'routing_order', 'signed_at', 'delegated_at', 'delegation_reason', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']
        extra_kwargs = {'envelope': {'required': False}}


class RecipientDelegationSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    email = serializers.EmailField()
    reason = serializers.CharField(required=False, allow_blank=True)


class TemplateSetupSerializer(serializers.Serializer):
    document = serializers.IntegerField()
    fields = serializers.ListField(child=serializers.DictField(), required=False)
    changelog = serializers.CharField(required=False, allow_blank=True)
    parties = serializers.ListField(child=serializers.DictField(), required=False, default=list)
    workflow_schema = serializers.DictField(required=False, default=dict)


class TemplateEnvelopeRecipientSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=Recipient.Role.choices, default=Recipient.Role.SIGNER)
    routing_order = serializers.IntegerField(required=False, min_value=1)
    party_key = serializers.CharField(max_length=80, required=False, allow_blank=True)


class CreateEnvelopeFromTemplateSerializer(serializers.Serializer):
    organization = serializers.IntegerField()
    template_version = serializers.IntegerField()
    name = serializers.CharField(max_length=255)
    message = serializers.CharField(required=False, allow_blank=True)
    due_date = serializers.DateField(required=False, allow_null=True)
    send = serializers.BooleanField(default=False)
    recipients = TemplateEnvelopeRecipientSerializer(many=True)


class TemplateSerializer(serializers.ModelSerializer):
    fields = serializers.SerializerMethodField(method_name='get_template_fields')
    versions = TemplateVersionSerializer(many=True, read_only=True)
    latest_version = serializers.SerializerMethodField()
    field_count = serializers.SerializerMethodField()
    party_keys = serializers.SerializerMethodField()
    preview_image_url = serializers.SerializerMethodField()

    class Meta:
        model = Template
        fields = [
            'id', 'organization', 'name', 'description', 'category', 'version',
            'status', 'created_by', 'fields', 'versions', 'latest_version',
            'field_count', 'party_keys', 'preview_image_url', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_template_fields(self, obj):
        latest_version = next(iter(obj.versions.all()), None)
        queryset = obj.fields.all()
        if latest_version:
            queryset = queryset.filter(template_version=latest_version)
        else:
            queryset = queryset.filter(template_version__isnull=True)
        return FormFieldSerializer(queryset.order_by('page', 'y', 'x', 'id'), many=True, context=self.context).data

    def get_latest_version(self, obj):
        latest = next(iter(obj.versions.all()), None)
        return latest.id if latest else None

    def get_field_count(self, obj):
        return len(self.get_template_fields(obj))

    def get_party_keys(self, obj):
        latest = next(iter(obj.versions.all()), None)
        if latest:
            return list(latest.parties.order_by('routing_order').values_list('role_key', flat=True))
        return []

    @extend_schema_field(OpenApiTypes.URI)
    def get_preview_image_url(self, obj):
        latest = next(iter(obj.versions.all()), None)
        if not latest or not latest.document_id:
            return None
        try:
            from documents.models import DocumentPage
            page = DocumentPage.objects.filter(
                document_id=latest.document_id,
                page_number=1,
            ).select_related().first()
            if page and page.image:
                request = self.context.get('request')
                url = page.image.url
                return request.build_absolute_uri(url) if request else url
        except Exception:
            pass
        return None


class EnvelopeSerializer(serializers.ModelSerializer):
    recipients = RecipientSerializer(many=True, required=False)
    fields = FormFieldSerializer(many=True, read_only=True)
    field_values = serializers.SerializerMethodField()
    documents = serializers.SerializerMethodField()
    sender_username = serializers.CharField(source='sender.username', read_only=True)
    completion_percent = serializers.SerializerMethodField()

    class Meta:
        model = Envelope
        fields = [
            'id', 'organization', 'template', 'template_version', 'name', 'status', 'sender',
            'sender_username', 'message', 'due_date', 'sent_at', 'completed_at',
            'void_reason', 'recipients', 'fields', 'completion_percent',
            'field_values', 'documents',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'sender', 'sent_at', 'completed_at', 'created_at', 'updated_at']

    @extend_schema_field(OpenApiTypes.INT)
    def get_completion_percent(self, obj):
        recipients = obj.recipients.exclude(status=Recipient.Status.DELEGATED)
        total = recipients.count()
        if total == 0:
            return 0
        signed = recipients.filter(status=Recipient.Status.SIGNED).count()
        return round((signed / total) * 100)

    def get_field_values(self, obj):
        from signing.serializers import EnvelopeFieldValueSerializer

        queryset = obj.field_values.select_related('recipient', 'field').order_by('field_key', 'id')
        return EnvelopeFieldValueSerializer(queryset, many=True, context=self.context).data

    def get_documents(self, obj):
        from documents.serializers import EnvelopeDocumentSerializer

        queryset = obj.envelope_documents.select_related('document').order_by('order')
        return EnvelopeDocumentSerializer(queryset, many=True, context=self.context).data

    def create(self, validated_data):
        recipients_data = validated_data.pop('recipients', [])
        envelope = Envelope.objects.create(**validated_data)
        for index, recipient_data in enumerate(recipients_data, start=1):
                recipient_data.pop('envelope', None)
                recipient_data.setdefault('routing_order', index)
                recipient_data.setdefault('party_key', '')
                Recipient.objects.create(envelope=envelope, **recipient_data)
        return envelope

    def update(self, instance, validated_data):
        recipients_data = validated_data.pop('recipients', None)
        instance = super().update(instance, validated_data)
        if recipients_data is not None:
            if instance.status != Envelope.Status.DRAFT:
                raise serializers.ValidationError('Recipients can only be replaced while the envelope is still a draft.')
            existing_recipients = list(instance.recipients.order_by('routing_order', 'id'))
            field_assignments = {}
            for index, recipient in enumerate(existing_recipients):
                field_assignments[index] = list(instance.fields.filter(recipient=recipient))
            instance.recipients.all().delete()
            created_recipients = []
            for index, recipient_data in enumerate(recipients_data, start=1):
                recipient_data.pop('envelope', None)
                recipient_data.setdefault('routing_order', index)
                recipient_data.setdefault('party_key', '')
                created_recipients.append(Recipient.objects.create(envelope=instance, **recipient_data))
            for index, fields in field_assignments.items():
                if index < len(created_recipients):
                    for field in fields:
                        field.recipient = created_recipients[index]
                        field.save(update_fields=['recipient'])
        return instance


class EnvelopeStatusSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        envelope = self.context['envelope']
        status = self.context['status']
        if status == Envelope.Status.SENT:
            if envelope.status in [Envelope.Status.COMPLETED, Envelope.Status.VOIDED, Envelope.Status.DECLINED, Envelope.Status.EXPIRED]:
                raise serializers.ValidationError(f'Cannot send an envelope with status "{envelope.status}".')
            if not envelope.recipients.exists():
                raise serializers.ValidationError('Add at least one recipient before sending.')
            if not envelope.fields.exists():
                raise serializers.ValidationError('Add at least one field before sending.')
            if not envelope.recipients.exclude(role=Recipient.Role.CC).exists():
                raise serializers.ValidationError('Add at least one signer or approver before sending.')
        if status == Envelope.Status.VOIDED and envelope.status in [Envelope.Status.COMPLETED, Envelope.Status.VOIDED]:
            raise serializers.ValidationError(f'Cannot void an envelope with status "{envelope.status}".')
        return attrs

    def save(self, **kwargs):
        envelope = self.context['envelope']
        status = self.context['status']
        envelope.status = status
        if status == Envelope.Status.SENT:
            envelope.sent_at = timezone.now()
        if status == Envelope.Status.VOIDED:
            envelope.void_reason = self.validated_data.get('reason', '')
        envelope.save(update_fields=['status', 'sent_at', 'void_reason', 'updated_at'])
        return envelope
