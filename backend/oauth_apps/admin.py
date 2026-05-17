from django.contrib import admin

from .models import OAuthApplication, OAuthGrant


@admin.register(OAuthApplication)
class OAuthApplicationAdmin(admin.ModelAdmin):
    list_display = ['name', 'organization', 'client_id', 'status', 'created_by', 'created_at']
    list_filter = ['status', 'organization']
    search_fields = ['name', 'client_id', 'organization__name']


@admin.register(OAuthGrant)
class OAuthGrantAdmin(admin.ModelAdmin):
    list_display = ['application', 'user', 'revoked_at', 'expires_at', 'created_at']
    list_filter = ['revoked_at']
    search_fields = ['application__name', 'user__username']
