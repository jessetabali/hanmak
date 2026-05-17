from django.utils import timezone
from rest_framework import decorators, permissions, response, viewsets

from accounts.permissions import OrganizationScopedQuerySetMixin

from .models import ComplianceExport, DataResidencyRegion, LegalHold, LegalHoldItem, OrganizationDataResidencyPolicy, RetentionPolicy
from .serializers import (
    ComplianceExportSerializer,
    DataResidencyRegionSerializer,
    LegalHoldItemSerializer,
    LegalHoldSerializer,
    OrganizationDataResidencyPolicySerializer,
    RetentionPolicySerializer,
)


class LegalHoldViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'legal_holds'
    queryset = LegalHold.objects.select_related('organization', 'created_by').all().order_by('-created_at')
    serializer_class = LegalHoldSerializer
    permission_classes = [permissions.IsAuthenticated]

    @decorators.action(detail=True, methods=['post'])
    def release(self, request, pk=None):
        hold = self.get_object()
        hold.status = LegalHold.Status.RELEASED
        hold.released_at = timezone.now()
        hold.save(update_fields=['status', 'released_at'])
        return response.Response(self.get_serializer(hold).data)


class LegalHoldItemViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'legal_holds'
    queryset = LegalHoldItem.objects.select_related('legal_hold').all()
    serializer_class = LegalHoldItemSerializer
    permission_classes = [permissions.IsAuthenticated]


class RetentionPolicyViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'retention_policies'
    queryset = RetentionPolicy.objects.select_related('organization').all().order_by('name')
    serializer_class = RetentionPolicySerializer
    permission_classes = [permissions.IsAuthenticated]


class ComplianceExportViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'compliance_exports'
    queryset = ComplianceExport.objects.select_related('organization', 'requested_by').all().order_by('-created_at')
    serializer_class = ComplianceExportSerializer
    permission_classes = [permissions.IsAuthenticated]


class DataResidencyRegionViewSet(viewsets.ModelViewSet):
    queryset = DataResidencyRegion.objects.all().order_by('name')
    serializer_class = DataResidencyRegionSerializer
    permission_classes = [permissions.IsAuthenticated]


class OrganizationDataResidencyPolicyViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'data_residency'
    queryset = OrganizationDataResidencyPolicy.objects.select_related('organization', 'primary_region').prefetch_related('allowed_regions').all().order_by('organization__name')
    serializer_class = OrganizationDataResidencyPolicySerializer
    permission_classes = [permissions.IsAuthenticated]

    @decorators.action(detail=False, methods=['get'])
    def summary(self, request):
        from accounts.permissions import user_organization_ids
        organization_ids = user_organization_ids(request.user)
        policies = self.get_queryset()
        if organization_ids is not None:
            policies = policies.filter(organization_id__in=organization_ids)
        return response.Response({
            'total': policies.count(),
            'blocking': policies.filter(enforcement_mode=OrganizationDataResidencyPolicy.EnforcementMode.BLOCK).count(),
            'log_only': policies.filter(enforcement_mode=OrganizationDataResidencyPolicy.EnforcementMode.LOG_ONLY).count(),
            'unavailable_primary_regions': policies.filter(primary_region__is_available=False).count(),
            'policies': OrganizationDataResidencyPolicySerializer(policies, many=True).data,
        })
