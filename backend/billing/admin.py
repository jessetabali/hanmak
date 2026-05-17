from django.contrib import admin

from .models import Invoice, LicenseKey, PaymentMethod, PaymentPortalSession, PaymentWebhookEvent, Plan, Subscription, UsageRecord


@admin.register(Plan)
class PlanAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'monthly_price', 'is_active']
    list_filter = ['is_active']


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ['organization', 'plan', 'status', 'current_period_start', 'current_period_end']
    list_filter = ['status', 'plan']


@admin.register(UsageRecord)
class UsageRecordAdmin(admin.ModelAdmin):
    list_display = ['organization', 'metric_key', 'quantity', 'period_start', 'period_end']
    list_filter = ['metric_key']


@admin.register(LicenseKey)
class LicenseKeyAdmin(admin.ModelAdmin):
    list_display = ['organization', 'status', 'expires_at', 'activated_at', 'created_at']
    search_fields = ['key', 'organization__name']


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ['invoice_number', 'organization', 'status', 'amount', 'currency', 'created_at']
    list_filter = ['status', 'currency']
    search_fields = ['invoice_number', 'organization__name']


@admin.register(PaymentMethod)
class PaymentMethodAdmin(admin.ModelAdmin):
    list_display = ['organization', 'method_type', 'brand', 'last4', 'is_default', 'updated_at']
    list_filter = ['method_type', 'is_default']
    search_fields = ['organization__name', 'holder_name', 'last4']


@admin.register(PaymentPortalSession)
class PaymentPortalSessionAdmin(admin.ModelAdmin):
    list_display = ['organization', 'session_type', 'provider', 'status', 'provider_session_id', 'created_at']
    list_filter = ['session_type', 'provider', 'status']
    search_fields = ['organization__name', 'provider_session_id']


@admin.register(PaymentWebhookEvent)
class PaymentWebhookEventAdmin(admin.ModelAdmin):
    list_display = ['provider', 'event_type', 'provider_event_id', 'organization', 'status', 'processed_at', 'created_at']
    list_filter = ['provider', 'event_type', 'status']
    search_fields = ['provider_event_id', 'organization__name', 'processing_notes']
    readonly_fields = ['payload', 'processing_notes', 'processed_at', 'created_at']
