from rest_framework import decorators, response, viewsets

from accounts.permissions import OrganizationRolePermission, OrganizationScopedQuerySetMixin

from .models import PolicyRule, RiskFinding
from .serializers import PolicyRuleSerializer, RiskFindingSerializer


class RiskFindingViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'operations_console'
    queryset = RiskFinding.objects.select_related('organization', 'envelope').all().order_by('-created_at')
    serializer_class = RiskFindingSerializer
    permission_classes = [OrganizationRolePermission]
    write_roles = OrganizationRolePermission.write_roles

    @decorators.action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        finding = self.get_object()
        finding.status = RiskFinding.Status.RESOLVED
        finding.save(update_fields=['status'])
        return response.Response(self.get_serializer(finding).data)


class PolicyRuleViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'operations_console'
    queryset = PolicyRule.objects.select_related('organization').all().order_by('name')
    serializer_class = PolicyRuleSerializer
    permission_classes = [OrganizationRolePermission]
    write_roles = OrganizationRolePermission.write_roles
