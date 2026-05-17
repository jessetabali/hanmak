from django.contrib import admin

from .models import ApprovalRequest


@admin.register(ApprovalRequest)
class ApprovalRequestAdmin(admin.ModelAdmin):
    list_display = ['envelope', 'approver', 'approval_role', 'status', 'due_at', 'decided_at']
    list_filter = ['status', 'approval_role']
    search_fields = ['envelope__name', 'approver__username', 'notes']

# Register your models here.
