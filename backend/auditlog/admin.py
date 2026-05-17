from django.contrib import admin

from .models import AuditEvent


@admin.register(AuditEvent)
class AuditEventAdmin(admin.ModelAdmin):
    list_display = ['event_type', 'severity', 'organization', 'envelope', 'document', 'actor', 'ip_address', 'created_at']
    list_filter = ['event_type', 'severity', 'organization']
    search_fields = ['message', 'actor__username', 'envelope__name']
    readonly_fields = ['created_at']

# Register your models here.
