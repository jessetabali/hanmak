from django.db.models import Count
from drf_spectacular.utils import OpenApiTypes, extend_schema
from rest_framework import permissions, response, views

from accounts.permissions import request_organization_ids
from approvals.models import ApprovalRequest
from envelopes.models import Envelope, Template
from webhooks.models import WebhookDelivery


def organization_ids_for_request(request):
    return request_organization_ids(request)


class CompletionAnalyticsView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        envelopes = Envelope.objects.all()
        organization_ids = organization_ids_for_request(request)
        if organization_ids is not None:
            envelopes = envelopes.filter(organization_id__in=organization_ids)
        total = envelopes.count()
        completed = envelopes.filter(status=Envelope.Status.COMPLETED).count()
        return response.Response({
            'total': total,
            'completed': completed,
            'completion_rate': round((completed / total) * 100, 2) if total else 0,
        })


class TemplateUsageAnalyticsView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        templates = Template.objects.all()
        organization_ids = organization_ids_for_request(request)
        if organization_ids is not None:
            templates = templates.filter(organization_id__in=organization_ids)
        rows = templates.annotate(envelope_count=Count('envelopes')).values('id', 'name', 'envelope_count').order_by('-envelope_count')
        return response.Response(list(rows))


class ApprovalBottleneckAnalyticsView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        approvals = ApprovalRequest.objects.all()
        organization_ids = organization_ids_for_request(request)
        if organization_ids is not None:
            approvals = approvals.filter(envelope__organization_id__in=organization_ids)
        rows = approvals.values('approval_role', 'status').annotate(count=Count('id')).order_by('approval_role')
        return response.Response(list(rows))


class WebhookHealthAnalyticsView(views.APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        deliveries = WebhookDelivery.objects.all()
        organization_ids = organization_ids_for_request(request)
        if organization_ids is not None:
            deliveries = deliveries.filter(endpoint__organization_id__in=organization_ids)
        rows = deliveries.values('status').annotate(count=Count('id')).order_by('status')
        return response.Response(list(rows))

# Create your views here.
