from django.contrib import admin

from .models import SCIMConnection, SCIMExternalIdentity, SSOConnection


@admin.register(SSOConnection)
class SSOConnectionAdmin(admin.ModelAdmin):
    list_display = ['name', 'organization', 'provider_type', 'is_enabled', 'updated_at']
    list_filter = ['provider_type', 'is_enabled', 'organization']
    search_fields = ['name', 'metadata_url']


@admin.register(SCIMConnection)
class SCIMConnectionAdmin(admin.ModelAdmin):
    list_display = ['organization', 'is_enabled', 'token_prefix', 'created_at']
    list_filter = ['is_enabled']


@admin.register(SCIMExternalIdentity)
class SCIMExternalIdentityAdmin(admin.ModelAdmin):
    list_display = ['organization', 'provider', 'external_id', 'user_email', 'updated_at']
    search_fields = ['external_id', 'user_email']

# Register your models here.
