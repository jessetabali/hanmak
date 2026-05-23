from rest_framework import serializers

from .models import ApprovalRequest


class ApprovalRequestSerializer(serializers.ModelSerializer):
    approver_username = serializers.CharField(source='approver.username', read_only=True)

    class Meta:
        model = ApprovalRequest
        fields = ['id', 'envelope', 'approver', 'approver_username', 'recipient', 'approval_role', 'status', 'notes', 'due_at', 'decided_at', 'delegated_to', 'created_at']
        read_only_fields = ['id', 'decided_at', 'created_at']
