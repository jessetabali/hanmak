from django.contrib import admin

from .models import ComplianceExport, DataResidencyRegion, LegalHold, LegalHoldItem, OrganizationDataResidencyPolicy, RetentionPolicy


@admin.register(LegalHold)
class LegalHoldAdmin(admin.ModelAdmin):
    list_display = ['name', 'organization', 'matter', 'status', 'expires_at', 'created_at']
    list_filter = ['status', 'organization']
    search_fields = ['name', 'matter', 'reason']


@admin.register(LegalHoldItem)
class LegalHoldItemAdmin(admin.ModelAdmin):
    list_display = ['legal_hold', 'object_type', 'object_id', 'added_at']
    search_fields = ['object_type', 'object_id']


@admin.register(RetentionPolicy)
class RetentionPolicyAdmin(admin.ModelAdmin):
    list_display = ['name', 'organization', 'applies_to', 'retention_days', 'action', 'is_active']
    list_filter = ['is_active', 'organization', 'applies_to']


@admin.register(ComplianceExport)
class ComplianceExportAdmin(admin.ModelAdmin):
    list_display = ['organization', 'export_type', 'status', 'date_from', 'date_to', 'requested_by', 'created_at']
    list_filter = ['status', 'export_type']


@admin.register(DataResidencyRegion)
class DataResidencyRegionAdmin(admin.ModelAdmin):
    list_display = ['code', 'name', 'storage_backend', 'is_available', 'created_at']
    list_filter = ['is_available']
    search_fields = ['code', 'name']


@admin.register(OrganizationDataResidencyPolicy)
class OrganizationDataResidencyPolicyAdmin(admin.ModelAdmin):
    list_display = ['organization', 'primary_region', 'enforcement_mode', 'updated_at']
    list_filter = ['enforcement_mode', 'primary_region']
