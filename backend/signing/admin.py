from django.contrib import admin

from .models import ConsentRecord, EnvelopeFieldValue, Signature, SigningSession


@admin.register(SigningSession)
class SigningSessionAdmin(admin.ModelAdmin):
    list_display = ['envelope', 'recipient', 'status', 'opened_at', 'submitted_at', 'created_at']
    list_filter = ['status']
    search_fields = ['envelope__name', 'recipient__email', 'token']


@admin.register(ConsentRecord)
class ConsentRecordAdmin(admin.ModelAdmin):
    list_display = ['envelope', 'recipient', 'accepted_at', 'ip_address']
    search_fields = ['envelope__name', 'recipient__email', 'consent_text']


@admin.register(Signature)
class SignatureAdmin(admin.ModelAdmin):
    list_display = ['envelope', 'recipient', 'signature_type', 'typed_name', 'created_at']
    list_filter = ['signature_type']


@admin.register(EnvelopeFieldValue)
class EnvelopeFieldValueAdmin(admin.ModelAdmin):
    list_display = ['envelope', 'recipient', 'field_key', 'updated_at']
    search_fields = ['envelope__name', 'field_key', 'value']

# Register your models here.
