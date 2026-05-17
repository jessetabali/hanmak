from django.contrib import admin

from .models import (
    Invitation,
    MFADevice,
    Membership,
    NotificationPreference,
    Organization,
    OrganizationDomain,
    Role,
    Team,
    UserProfile,
    UserSession,
)


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ['name', 'slug', 'parent', 'primary_contact_email', 'created_at']
    search_fields = ['name', 'slug', 'primary_contact_email']
    prepopulated_fields = {'slug': ['name']}


@admin.register(OrganizationDomain)
class OrganizationDomainAdmin(admin.ModelAdmin):
    list_display = ['domain', 'organization', 'status', 'verified_at', 'created_at']
    list_filter = ['status', 'organization']
    search_fields = ['domain', 'organization__name']


@admin.register(Team)
class TeamAdmin(admin.ModelAdmin):
    list_display = ['name', 'organization', 'created_at']
    list_filter = ['organization']
    search_fields = ['name', 'organization__name']


@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
    list_display = ['user', 'organization', 'team', 'role', 'custom_role', 'is_active', 'joined_at']
    list_filter = ['role', 'custom_role', 'is_active', 'organization']
    search_fields = ['user__username', 'user__email', 'organization__name']


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ['name', 'organization', 'is_system', 'created_at']
    list_filter = ['is_system', 'organization']
    search_fields = ['name', 'description']


@admin.register(Invitation)
class InvitationAdmin(admin.ModelAdmin):
    list_display = ['email', 'organization', 'role', 'custom_role', 'status', 'invited_by', 'created_at']
    list_filter = ['status', 'role', 'custom_role', 'organization']
    search_fields = ['email', 'full_name', 'organization__name']


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ['user', 'display_name', 'timezone', 'locale', 'updated_at']
    search_fields = ['user__username', 'user__email', 'display_name']


@admin.register(MFADevice)
class MFADeviceAdmin(admin.ModelAdmin):
    list_display = ['user', 'name', 'method', 'is_confirmed', 'last_used_at', 'created_at']
    list_filter = ['method', 'is_confirmed']
    search_fields = ['user__username', 'name']


@admin.register(NotificationPreference)
class NotificationPreferenceAdmin(admin.ModelAdmin):
    list_display = ['user', 'event_type', 'email_enabled', 'in_app_enabled', 'digest_enabled']
    list_filter = ['email_enabled', 'in_app_enabled', 'digest_enabled']
    search_fields = ['user__username', 'event_type']


@admin.register(UserSession)
class UserSessionAdmin(admin.ModelAdmin):
    list_display = ['user', 'ip_address', 'sso_provider', 'revoked_at', 'last_seen_at', 'created_at']
    list_filter = ['sso_provider', 'revoked_at']
    search_fields = ['user__username', 'ip_address', 'user_agent']
