from django.contrib import admin

from .models import TaskDefinition, TaskRun, TaskRunEvent


@admin.register(TaskDefinition)
class TaskDefinitionAdmin(admin.ModelAdmin):
    list_display = ['name', 'queue_name', 'is_restartable', 'max_attempts', 'created_at']
    search_fields = ['name', 'queue_name']


@admin.register(TaskRun)
class TaskRunAdmin(admin.ModelAdmin):
    list_display = ['task_name', 'queue_name', 'status', 'organization', 'attempt_number', 'queued_at', 'finished_at']
    list_filter = ['status', 'queue_name']
    search_fields = ['task_name', 'celery_task_id', 'error_message']


@admin.register(TaskRunEvent)
class TaskRunEventAdmin(admin.ModelAdmin):
    list_display = ['task_run', 'event_type', 'created_at']
    search_fields = ['task_run__task_name', 'event_type', 'message']

# Register your models here.
