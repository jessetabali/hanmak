from rest_framework import serializers

from .models import Invoice, LicenseKey, PaymentMethod, PaymentPortalSession, PaymentWebhookEvent, Plan, Subscription, UsageRecord


class PlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = Plan
        fields = ['id', 'name', 'code', 'monthly_price', 'features', 'limits', 'is_active']


class SubscriptionSerializer(serializers.ModelSerializer):
    plan_detail = PlanSerializer(source='plan', read_only=True)

    class Meta:
        model = Subscription
        fields = ['id', 'organization', 'plan', 'plan_detail', 'status', 'current_period_start', 'current_period_end', 'created_at']
        read_only_fields = ['id', 'created_at']


class UsageRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = UsageRecord
        fields = ['id', 'organization', 'metric_key', 'quantity', 'period_start', 'period_end', 'metadata', 'created_at']
        read_only_fields = ['id', 'created_at']


class LicenseKeySerializer(serializers.ModelSerializer):
    class Meta:
        model = LicenseKey
        fields = ['id', 'organization', 'key', 'edition', 'status', 'features', 'expires_at', 'activated_at', 'created_at']
        read_only_fields = ['id', 'activated_at', 'created_at']


class InvoiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Invoice
        fields = [
            'id', 'organization', 'invoice_number', 'amount', 'currency',
            'status', 'period_start', 'period_end', 'pdf_url', 'due_date',
            'paid_at', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class PaymentMethodSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentMethod
        fields = [
            'id', 'organization', 'method_type', 'brand', 'last4',
            'exp_month', 'exp_year', 'holder_name', 'is_default',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class PaymentPortalSessionSerializer(serializers.ModelSerializer):
    plan_detail = PlanSerializer(source='plan', read_only=True)

    class Meta:
        model = PaymentPortalSession
        fields = [
            'id', 'organization', 'session_type', 'plan', 'plan_detail', 'status',
            'provider', 'provider_session_id', 'url', 'success_url', 'cancel_url',
            'metadata', 'created_by', 'expires_at', 'created_at',
        ]
        read_only_fields = ['id', 'provider_session_id', 'created_by', 'created_at']


class PaymentWebhookEventSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source='organization.name', read_only=True)

    class Meta:
        model = PaymentWebhookEvent
        fields = [
            'id', 'provider', 'provider_event_id', 'event_type', 'organization',
            'organization_name', 'portal_session', 'status', 'payload',
            'processing_notes', 'processed_at', 'created_at',
        ]
        read_only_fields = ['id', 'processed_at', 'created_at']
