import secrets

from django.contrib.auth.hashers import make_password
from django.utils import timezone
from rest_framework import decorators, permissions, response, viewsets

from accounts.permissions import OrganizationScopedQuerySetMixin

from .models import OAuthApplication, OAuthGrant
from .serializers import OAuthApplicationSerializer, OAuthGrantSerializer


class OAuthApplicationViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'oauth_apps'
    queryset = OAuthApplication.objects.select_related('organization', 'created_by').all().order_by('name')
    serializer_class = OAuthApplicationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        self._assert_related_organization_access(serializer)
        serializer.save(created_by=self.request.user)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        app = serializer.instance
        client_secret = self._rotate_app_secret(app)
        data = self.get_serializer(app).data
        data['client_secret'] = client_secret
        data['secret_display_note'] = 'Copy this client secret now. It is stored hashed and cannot be revealed again.'
        headers = self.get_success_headers(serializer.data)
        return response.Response(data, status=201, headers=headers)

    @decorators.action(detail=True, methods=['post'])
    def disable(self, request, pk=None):
        app = self.get_object()
        app.status = OAuthApplication.Status.DISABLED
        app.save(update_fields=['status', 'updated_at'])
        return response.Response(self.get_serializer(app).data)

    @decorators.action(detail=True, methods=['post'])
    def enable(self, request, pk=None):
        app = self.get_object()
        app.status = OAuthApplication.Status.ACTIVE
        app.save(update_fields=['status', 'updated_at'])
        return response.Response(self.get_serializer(app).data)

    @decorators.action(detail=True, methods=['post'], url_path='rotate-secret')
    def rotate_secret(self, request, pk=None):
        app = self.get_object()
        client_secret = self._rotate_app_secret(app)
        data = self.get_serializer(app).data
        data['client_secret'] = client_secret
        data['secret_display_note'] = 'Copy this client secret now. It is stored hashed and cannot be revealed again.'
        return response.Response(data)

    @decorators.action(detail=True, methods=['post'], url_path='rotate_secret')
    def rotate_secret_legacy(self, request, pk=None):
        return self.rotate_secret(request, pk=pk)

    def _rotate_app_secret(self, app):
        client_secret = f'hm_oauth_{secrets.token_urlsafe(32)}'
        app.client_secret_hash = make_password(client_secret)
        app.save(update_fields=['client_secret_hash', 'updated_at'])
        return client_secret


class OAuthGrantViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'oauth_apps'
    queryset = OAuthGrant.objects.select_related('application', 'application__organization', 'user').all().order_by('-created_at')
    serializer_class = OAuthGrantSerializer
    permission_classes = [permissions.IsAuthenticated]
    organization_filter_paths = ['application__organization']

    @decorators.action(detail=True, methods=['post'])
    def revoke(self, request, pk=None):
        grant = self.get_object()
        grant.revoked_at = timezone.now()
        grant.save(update_fields=['revoked_at'])
        return response.Response(self.get_serializer(grant).data)
