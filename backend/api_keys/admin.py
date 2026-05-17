from django.contrib import admin

from .models import APIKey, APIRequestLog


@admin.register(APIKey)
class APIKeyAdmin(admin.ModelAdmin):
    list_display = ['name', 'organization', 'key_prefix', 'status', 'last_used_at', 'expires_at', 'created_at']
    list_filter = ['status', 'organization']
    search_fields = ['name', 'key_prefix']
    readonly_fields = ['key_hash']


@admin.register(APIRequestLog)
class APIRequestLogAdmin(admin.ModelAdmin):
    list_display = ['method', 'path', 'status_code', 'organization', 'api_key', 'duration_ms', 'created_at']
    list_filter = ['method', 'status_code']
    search_fields = ['path', 'user_agent']

# Register your models here.
