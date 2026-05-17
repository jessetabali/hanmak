from rest_framework import decorators, permissions, response, viewsets

from accounts.permissions import OrganizationScopedQuerySetMixin

from .models import EventOutbox, WebhookDelivery, WebhookEndpoint
from .serializers import EventOutboxSerializer, WebhookDeliverySerializer, WebhookEndpointSerializer


class WebhookEndpointViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'webhook_lab'
    queryset = WebhookEndpoint.objects.select_related('organization').all().order_by('name')
    serializer_class = WebhookEndpointSerializer
    permission_classes = [permissions.IsAuthenticated]


class EventOutboxViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'webhook_lab'
    queryset = EventOutbox.objects.select_related('organization').all()
    serializer_class = EventOutboxSerializer
    permission_classes = [permissions.IsAuthenticated]


class WebhookDeliveryViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'webhook_lab'
    queryset = WebhookDelivery.objects.select_related('endpoint', 'event').all()
    serializer_class = WebhookDeliverySerializer
    permission_classes = [permissions.IsAuthenticated]

    @decorators.action(detail=True, methods=['post'])
    def replay(self, request, pk=None):
        delivery = self.get_object()
        new_delivery = WebhookDelivery.objects.create(
            endpoint=delivery.endpoint,
            event=delivery.event,
            status=WebhookDelivery.Status.PENDING,
            attempt=delivery.attempt + 1,
            request_body=delivery.request_body,
        )
        return response.Response(self.get_serializer(new_delivery).data)
