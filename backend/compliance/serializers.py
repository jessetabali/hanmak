from rest_framework import serializers

from .models import ComplianceExport, DataResidencyRegion, LegalHold, LegalHoldItem, OrganizationDataResidencyPolicy, RetentionPolicy


class LegalHoldSerializer(serializers.ModelSerializer):
    class Meta:
        model = LegalHold
        fields = ['id', 'organization', 'name', 'matter', 'status', 'reason', 'created_by', 'expires_at', 'released_at', 'created_at']
        read_only_fields = ['id', 'released_at', 'created_at']


class LegalHoldItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = LegalHoldItem
        fields = ['id', 'legal_hold', 'object_type', 'object_id', 'added_at']
        read_only_fields = ['id', 'added_at']


class RetentionPolicySerializer(serializers.ModelSerializer):
    class Meta:
        model = RetentionPolicy
        fields = ['id', 'organization', 'name', 'applies_to', 'status_filter', 'retention_days', 'action', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']


class ComplianceExportSerializer(serializers.ModelSerializer):
    class Meta:
        model = ComplianceExport
        fields = ['id', 'organization', 'export_type', 'status', 'date_from', 'date_to', 'file', 'requested_by', 'created_at']
        read_only_fields = ['id', 'created_at']


class DataResidencyRegionSerializer(serializers.ModelSerializer):
    class Meta:
        model = DataResidencyRegion
        fields = ['id', 'code', 'name', 'country_codes', 'storage_backend', 'is_available', 'created_at']
        read_only_fields = ['id', 'created_at']


class OrganizationDataResidencyPolicySerializer(serializers.ModelSerializer):
    primary_region_name = serializers.CharField(source='primary_region.name', read_only=True)

    class Meta:
        model = OrganizationDataResidencyPolicy
        fields = [
            'id', 'organization', 'primary_region', 'primary_region_name',
            'allowed_regions', 'enforcement_mode', 'notes', 'updated_at',
        ]
        read_only_fields = ['id', 'updated_at']
