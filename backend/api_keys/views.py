import hashlib

from rest_framework import decorators, permissions, response, viewsets

from accounts.permissions import OrganizationScopedQuerySetMixin

from .models import APIKey, APIRequestLog
from .serializers import APIKeySerializer, APIRequestLogSerializer


class APIKeyViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'api_keys'
    queryset = APIKey.objects.select_related('organization').all().order_by('-created_at')
    serializer_class = APIKeySerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        self._assert_related_organization_access(serializer)
        plaintext = APIKey.generate_plaintext_key()
        serializer.save(
            key_prefix=plaintext[:12],
            key_hash=hashlib.sha256(plaintext.encode()).hexdigest(),
        )
        self._created_plaintext_key = plaintext

    def create(self, request, *args, **kwargs):
        response_obj = super().create(request, *args, **kwargs)
        response_obj.data['key'] = self._created_plaintext_key
        return response_obj

    @decorators.action(detail=True, methods=['post'])
    def revoke(self, request, pk=None):
        api_key = self.get_object()
        api_key.status = APIKey.Status.REVOKED
        api_key.save(update_fields=['status'])
        return response.Response(self.get_serializer(api_key).data)

    @decorators.action(detail=True, methods=['post'])
    def rotate(self, request, pk=None):
        old_key = self.get_object()
        old_key.status = APIKey.Status.REVOKED
        old_key.save(update_fields=['status'])
        plaintext = APIKey.generate_plaintext_key()
        new_key = APIKey.objects.create(
            organization=old_key.organization,
            name=old_key.name,
            key_prefix=plaintext[:12],
            key_hash=hashlib.sha256(plaintext.encode()).hexdigest(),
            scopes=old_key.scopes,
            expires_at=old_key.expires_at,
        )
        data = self.get_serializer(new_key).data
        data['key'] = plaintext
        return response.Response(data, status=201)


class APIRequestLogViewSet(OrganizationScopedQuerySetMixin, viewsets.ReadOnlyModelViewSet):
    feature_flag_key = 'operations_console'
    queryset = APIRequestLog.objects.select_related('organization', 'api_key').all()
    serializer_class = APIRequestLogSerializer
    permission_classes = [permissions.IsAuthenticated]
