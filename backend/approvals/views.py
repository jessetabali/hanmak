from django.utils import timezone
from rest_framework import decorators, permissions, response, viewsets

from accounts.permissions import OrganizationScopedQuerySetMixin
from envelopes.models import Envelope, Recipient
from messaging.services import queue_completion_emails
from messaging.tasks import deliver_email_message_task

from .models import ApprovalRequest
from .serializers import ApprovalRequestSerializer


class ApprovalRequestViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'approval_queue'
    queryset = ApprovalRequest.objects.select_related('envelope', 'approver', 'delegated_to').all().order_by('-created_at')
    serializer_class = ApprovalRequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()
        status_value = self.request.query_params.get('status')
        if status_value:
            queryset = queryset.filter(status=status_value)
        return queryset

    def _decide(self, status_value):
        approval = self.get_object()
        approval.status = status_value
        approval.decided_at = timezone.now()
        approval.notes = self.request.data.get('notes', approval.notes)
        approval.save(update_fields=['status', 'decided_at', 'notes'])
        if status_value == ApprovalRequest.Status.APPROVED:
            envelope = approval.envelope
            if not envelope.approval_requests.exclude(status=ApprovalRequest.Status.APPROVED).exists():
                envelope.recipients.filter(role=Recipient.Role.APPROVER, status__in=[Recipient.Status.PENDING, Recipient.Status.SENT, Recipient.Status.VIEWED]).update(
                    status=Recipient.Status.SIGNED,
                    signed_at=timezone.now(),
                )
                active_recipients = envelope.recipients.exclude(role=Recipient.Role.CC).exclude(status=Recipient.Status.DELEGATED)
                if not active_recipients.exclude(status=Recipient.Status.SIGNED).exists():
                    envelope.status = Envelope.Status.COMPLETED
                    envelope.completed_at = timezone.now()
                    envelope.save(update_fields=['status', 'completed_at', 'updated_at'])
                    messages = queue_completion_emails(envelope, queued_by=self.request.user, request=self.request)
                    for message in messages:
                        deliver_email_message_task.apply_async(args=[message.id], queue='email')
        return response.Response(self.get_serializer(approval).data)

    @decorators.action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        return self._decide(ApprovalRequest.Status.APPROVED)

    @decorators.action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        return self._decide(ApprovalRequest.Status.REJECTED)

    @decorators.action(detail=True, methods=['post'], url_path='request-changes')
    def request_changes(self, request, pk=None):
        return self._decide(ApprovalRequest.Status.CHANGES_REQUESTED)

    @decorators.action(detail=True, methods=['post'])
    def delegate(self, request, pk=None):
        approval = self.get_object()
        target_user_id = request.data.get('user')
        if not target_user_id:
            return response.Response({'detail': 'user is required.'}, status=400)
        approval.delegated_to_id = target_user_id
        approval.status = ApprovalRequest.Status.DELEGATED
        approval.notes = request.data.get('notes', approval.notes)
        approval.decided_at = timezone.now()
        approval.save(update_fields=['delegated_to', 'status', 'notes', 'decided_at'])
        return response.Response(self.get_serializer(approval).data)
