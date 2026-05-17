from rest_framework import serializers

from .models import TaskDefinition, TaskRun, TaskRunEvent


class TaskDefinitionSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaskDefinition
        fields = ['id', 'name', 'queue_name', 'is_restartable', 'max_attempts', 'created_at']
        read_only_fields = ['id', 'created_at']


class TaskRunEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaskRunEvent
        fields = ['id', 'task_run', 'event_type', 'message', 'metadata', 'created_at']
        read_only_fields = ['id', 'created_at']


class TaskRunSerializer(serializers.ModelSerializer):
    events = TaskRunEventSerializer(many=True, read_only=True)

    class Meta:
        model = TaskRun
        fields = [
            'id', 'organization', 'definition', 'celery_task_id', 'parent',
            'restarted_from', 'task_name', 'queue_name', 'status',
            'related_object_type', 'related_object_id', 'idempotency_key',
            'payload', 'result', 'error_type', 'error_message', 'traceback',
            'attempt_number', 'max_attempts', 'created_by', 'queued_at',
            'started_at', 'finished_at', 'next_retry_at', 'updated_at', 'events',
        ]
        read_only_fields = ['id', 'queued_at', 'updated_at', 'events']
