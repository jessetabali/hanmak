from django.utils import timezone

from envelopes.models import Envelope, Recipient
from messaging.services import queue_completion_emails
from messaging.tasks import deliver_email_message_task
from workflow.services import advance_running_workflows_for_recipient

from .models import ApprovalRequest


def approval_role_for_recipient(recipient):
    return recipient.party_key or f'{recipient.name} approval'


def ensure_approval_for_recipient(envelope, recipient, *, approver_user=None):
    approval = ApprovalRequest.objects.filter(envelope=envelope, recipient=recipient).order_by('-created_at').first()
    if approval:
        return approval
    return ApprovalRequest.objects.create(
        envelope=envelope,
        approver=approver_user or envelope.sender,
        recipient=recipient,
        approval_role=approval_role_for_recipient(recipient),
        notes=f'Awaiting approval from {recipient.name} <{recipient.email}>.',
    )


def decide_approval(approval, status_value, *, notes=None, request=None, actor=None, mark_recipient=True):
    approval.status = status_value
    approval.decided_at = timezone.now()
    if notes is not None:
        approval.notes = notes
    approval.save(update_fields=['status', 'decided_at', 'notes'])

    envelope = approval.envelope
    recipient = approval.recipient
    if status_value == ApprovalRequest.Status.APPROVED:
        if mark_recipient and recipient and recipient.status not in [Recipient.Status.SIGNED, Recipient.Status.DELEGATED]:
            recipient.status = Recipient.Status.SIGNED
            recipient.signed_at = timezone.now()
            recipient.save(update_fields=['status', 'signed_at'])
        elif not recipient:
            envelope.recipients.filter(
                role=Recipient.Role.APPROVER,
                status__in=[Recipient.Status.PENDING, Recipient.Status.SENT, Recipient.Status.VIEWED],
            ).update(status=Recipient.Status.SIGNED, signed_at=timezone.now())

        if recipient:
            advance_running_workflows_for_recipient(
                envelope,
                recipient,
                message=f'Approval completed by {recipient.name}.',
            )

        active_recipients = envelope.recipients.exclude(role=Recipient.Role.CC).exclude(status=Recipient.Status.DELEGATED)
        all_recipients_done = not active_recipients.exclude(status=Recipient.Status.SIGNED).exists()
        all_approvals_done = not envelope.approval_requests.exclude(status=ApprovalRequest.Status.APPROVED).exists()
        if all_recipients_done and all_approvals_done:
            envelope.status = Envelope.Status.COMPLETED
            envelope.completed_at = timezone.now()
            envelope.save(update_fields=['status', 'completed_at', 'updated_at'])
            messages = queue_completion_emails(envelope, queued_by=actor or envelope.sender, request=request)
            for message in messages:
                deliver_email_message_task.apply_async(args=[message.id], queue='email')
    elif status_value in [ApprovalRequest.Status.REJECTED, ApprovalRequest.Status.CHANGES_REQUESTED]:
        if recipient and status_value == ApprovalRequest.Status.REJECTED:
            recipient.status = Recipient.Status.DECLINED
            recipient.save(update_fields=['status'])
    return approval
