from django.conf import settings
from django.db import models

from envelopes.models import Envelope, Recipient


class ApprovalRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'
        CHANGES_REQUESTED = 'changes_requested', 'Changes Requested'
        DELEGATED = 'delegated', 'Delegated'

    envelope = models.ForeignKey(Envelope, related_name='approval_requests', on_delete=models.CASCADE)
    approver = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='approval_requests', on_delete=models.PROTECT)
    recipient = models.ForeignKey(Recipient, related_name='approval_requests', null=True, blank=True, on_delete=models.SET_NULL)
    approval_role = models.CharField(max_length=128)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.PENDING)
    notes = models.TextField(blank=True)
    due_at = models.DateTimeField(null=True, blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    delegated_to = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='delegated_approval_requests', null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.approval_role} for {self.envelope}'

# Create your models here.
