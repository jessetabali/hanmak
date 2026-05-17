from django.contrib import admin

from .models import AppSetting, FeatureFlag, HealthCheck


@admin.register(AppSetting)
class AppSettingAdmin(admin.ModelAdmin):
    list_display = ['namespace', 'key', 'organization', 'is_secret', 'updated_at']
    list_filter = ['namespace', 'is_secret']
    search_fields = ['namespace', 'key']


@admin.register(FeatureFlag)
class FeatureFlagAdmin(admin.ModelAdmin):
    list_display = ['key', 'organization', 'is_enabled']
    list_filter = ['is_enabled']


@admin.register(HealthCheck)
class HealthCheckAdmin(admin.ModelAdmin):
    list_display = ['name', 'status', 'checked_at']
    list_filter = ['status']

# Register your models here.
