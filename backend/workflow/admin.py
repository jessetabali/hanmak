from django.contrib import admin

from .models import WorkflowDefinition, WorkflowEvent, WorkflowRun, WorkflowStage


@admin.register(WorkflowDefinition)
class WorkflowDefinitionAdmin(admin.ModelAdmin):
    list_display = ['name', 'organization', 'status', 'created_by', 'updated_at']
    list_filter = ['status', 'organization']
    search_fields = ['name', 'description']


@admin.register(WorkflowStage)
class WorkflowStageAdmin(admin.ModelAdmin):
    list_display = ['workflow', 'key', 'label', 'stage_type', 'order']
    list_filter = ['stage_type']


@admin.register(WorkflowRun)
class WorkflowRunAdmin(admin.ModelAdmin):
    list_display = ['envelope', 'workflow', 'status', 'current_stage_key', 'started_at', 'completed_at']
    list_filter = ['status']


@admin.register(WorkflowEvent)
class WorkflowEventAdmin(admin.ModelAdmin):
    list_display = ['run', 'event_type', 'stage_key', 'actor', 'created_at']
    list_filter = ['event_type']

# Register your models here.
