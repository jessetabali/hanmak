from rest_framework import serializers

from .models import WorkflowDefinition, WorkflowEvent, WorkflowRun, WorkflowStage


class WorkflowStageSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkflowStage
        fields = ['id', 'workflow', 'key', 'label', 'stage_type', 'order', 'config']
        read_only_fields = ['id']


class WorkflowDefinitionSerializer(serializers.ModelSerializer):
    stages = WorkflowStageSerializer(many=True, read_only=True)

    class Meta:
        model = WorkflowDefinition
        fields = ['id', 'organization', 'name', 'description', 'status', 'schema', 'created_by', 'stages', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class WorkflowRunSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkflowRun
        fields = ['id', 'envelope', 'workflow', 'status', 'current_stage_key', 'started_at', 'completed_at']
        read_only_fields = ['id', 'started_at', 'completed_at']

    def validate(self, attrs):
        attrs = super().validate(attrs)
        envelope = attrs.get('envelope') or getattr(self.instance, 'envelope', None)
        workflow = attrs.get('workflow') if 'workflow' in attrs else getattr(self.instance, 'workflow', None)
        current_stage_key = attrs.get('current_stage_key', getattr(self.instance, 'current_stage_key', ''))
        if envelope and workflow:
            if envelope.organization_id != workflow.organization_id:
                raise serializers.ValidationError('Workflow and envelope must belong to the same organization.')
            if workflow.status != WorkflowDefinition.Status.ACTIVE:
                raise serializers.ValidationError('Only active workflows can be started.')
            stage_keys = set(workflow.stages.values_list('key', flat=True))
            if current_stage_key and current_stage_key not in stage_keys:
                raise serializers.ValidationError({'current_stage_key': 'Choose a stage that belongs to this workflow.'})
        return attrs


class WorkflowEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkflowEvent
        fields = ['id', 'run', 'envelope', 'event_type', 'stage_key', 'actor', 'message', 'metadata', 'created_at']
        read_only_fields = ['id', 'created_at']
