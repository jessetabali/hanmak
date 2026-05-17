from rest_framework import exceptions, serializers

from configcenter.models import AppSetting

from .models import LegalHold, LegalHoldItem, OrganizationDataResidencyPolicy


def data_residency_enforcement_enabled():
    setting = AppSetting.objects.filter(
        organization=None,
        namespace='compliance',
        key='data_residency',
    ).first()
    if not setting or not isinstance(setting.value, dict):
        return False
    return bool(setting.value.get('require_policy'))


def validate_data_residency_for_organization(organization):
    if not data_residency_enforcement_enabled():
        return
    policy = OrganizationDataResidencyPolicy.objects.select_related('primary_region').filter(organization=organization).first()
    if not policy:
        raise serializers.ValidationError({'organization': 'Data residency policy is required before creating documents or envelopes.'})
    if policy.enforcement_mode == OrganizationDataResidencyPolicy.EnforcementMode.BLOCK and not policy.primary_region.is_available:
        raise serializers.ValidationError({'organization': 'Primary data residency region is unavailable.'})


def assert_not_under_active_legal_hold(object_type, object_id):
    if LegalHoldItem.objects.filter(
        object_type=object_type,
        object_id=str(object_id),
        legal_hold__status=LegalHold.Status.ACTIVE,
    ).exists():
        raise exceptions.PermissionDenied(f'{object_type.title()} is under an active legal hold and cannot be deleted.')
