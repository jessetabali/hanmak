import json
import time
import urllib.error
import urllib.request

from django.utils import timezone
from rest_framework import decorators, response, viewsets

from accounts.permissions import OrganizationRolePermission, OrganizationScopedQuerySetMixin

from .models import EventOutbox, WebhookDelivery, WebhookEndpoint
from .serializers import EventOutboxSerializer, WebhookDeliverySerializer, WebhookEndpointSerializer


class WebhookEndpointViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'webhook_lab'
    queryset = WebhookEndpoint.objects.select_related('organization').all().order_by('name')
    serializer_class = WebhookEndpointSerializer
    permission_classes = [OrganizationRolePermission]
    write_roles = OrganizationRolePermission.write_roles

    @decorators.action(detail=True, methods=['post'], url_path='test')
    def test(self, request, pk=None):
        endpoint = self.get_object()
        event_type = request.data.get('event_type', 'test.ping')

        event = EventOutbox.objects.create(
            organization=endpoint.organization,
            event_type=event_type,
            aggregate_type='test',
            aggregate_id='0',
            payload={'test': True, 'event_type': event_type},
        )

        body = {
            'id': str(event.id),
            'event_type': event_type,
            'created_at': event.created_at.isoformat(),
            'payload': event.payload,
            'test': True,
        }

        delivery = WebhookDelivery.objects.create(
            endpoint=endpoint,
            event=event,
            status=WebhookDelivery.Status.PENDING,
            attempt=1,
            request_body=body,
        )

        start = time.time()
        try:
            req = urllib.request.Request(
                endpoint.target_url,
                data=json.dumps(body).encode(),
                headers={
                    'Content-Type': 'application/json',
                    'X-HanMak-Event': event_type,
                    'X-HanMak-Delivery': str(delivery.id),
                },
                method='POST',
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                delivery.status = WebhookDelivery.Status.DELIVERED
                delivery.response_status = resp.status
                delivery.response_body = resp.read().decode('utf-8', errors='replace')[:500]
        except urllib.error.HTTPError as exc:
            delivery.status = WebhookDelivery.Status.FAILED
            delivery.response_status = exc.code
            delivery.error_message = str(exc)[:255]
        except Exception as exc:
            delivery.status = WebhookDelivery.Status.FAILED
            delivery.error_message = str(exc)[:255]

        delivery.delivered_at = timezone.now()
        delivery.save()

        return response.Response({
            'delivery_id': delivery.id,
            'status': delivery.status,
            'response_status': delivery.response_status,
            'error_message': delivery.error_message or None,
            'latency_ms': round((time.time() - start) * 1000),
        })


class EventOutboxViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'webhook_lab'
    queryset = EventOutbox.objects.select_related('organization').all()
    serializer_class = EventOutboxSerializer
    permission_classes = [OrganizationRolePermission]
    write_roles = OrganizationRolePermission.write_roles


class WebhookDeliveryViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'webhook_lab'
    queryset = WebhookDelivery.objects.select_related('endpoint', 'event').all()
    serializer_class = WebhookDeliverySerializer
    permission_classes = [OrganizationRolePermission]
    write_roles = OrganizationRolePermission.write_roles

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
