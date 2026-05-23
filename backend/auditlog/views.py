from rest_framework import viewsets
from django.db.models import Q

from accounts.permissions import OrganizationRolePermission, OrganizationScopedQuerySetMixin

from .models import AuditEvent
from .serializers import AuditEventSerializer


class AuditEventViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'audit_evidence'
    queryset = AuditEvent.objects.select_related('organization', 'envelope', 'actor').all()
    serializer_class = AuditEventSerializer
    permission_classes = [OrganizationRolePermission]
    write_roles = OrganizationRolePermission.write_roles

    def get_queryset(self):
        queryset = super().get_queryset()
        organization_id = self.request.query_params.get('organization')
        envelope_id = self.request.query_params.get('envelope')
        event_type = self.request.query_params.get('event_type')
        event_type_prefix = self.request.query_params.get('event_type__startswith')
        search = self.request.query_params.get('search')
        created_from = self.request.query_params.get('created_at__gte')
        created_to = self.request.query_params.get('created_at__lte')
        if organization_id:
            queryset = queryset.filter(organization_id=organization_id)
        if envelope_id:
            queryset = queryset.filter(envelope_id=envelope_id)
        if event_type:
            queryset = queryset.filter(event_type=event_type)
        if event_type_prefix:
            queryset = queryset.filter(event_type__startswith=event_type_prefix)
        if search:
            queryset = queryset.filter(Q(message__icontains=search) | Q(event_type__icontains=search))
        if created_from:
            queryset = queryset.filter(created_at__gte=created_from)
        if created_to:
            queryset = queryset.filter(created_at__lte=created_to)
        return queryset
