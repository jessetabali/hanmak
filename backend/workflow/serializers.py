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
    workflow_name = serializers.CharField(source='workflow.name', read_only=True)
    envelope_name = serializers.CharField(source='envelope.name', read_only=True)
    stages = serializers.SerializerMethodField()
    parties = serializers.SerializerMethodField()

    class Meta:
        model = WorkflowRun
        fields = [
            'id', 'envelope', 'envelope_name', 'workflow', 'workflow_name', 'status',
            'current_stage_key', 'stages', 'parties', 'started_at', 'completed_at',
        ]
        read_only_fields = ['id', 'started_at', 'completed_at']

    def get_stages(self, obj):
        template_stages = []
        if obj.envelope.template_version and isinstance(obj.envelope.template_version.workflow_schema, dict):
            template_stages = obj.envelope.template_version.workflow_schema.get('stages') or []
        template_stage_map = {stage.get('key'): stage for stage in template_stages if stage.get('key')}
        stages = []
        for stage in obj.workflow.stages.order_by('order') if obj.workflow else []:
            template_stage = template_stage_map.get(stage.key, {})
            party_key = template_stage.get('party_key') or (stage.key if stage.stage_type in ['signing', 'approval', 'review'] else '')
            stages.append({
                'key': stage.key,
                'label': stage.label,
                'stage_type': stage.stage_type,
                'order': stage.order,
                'party_key': party_key,
                'config': stage.config,
            })
        return stages

    def get_parties(self, obj):
        recipients = obj.envelope.recipients.order_by('routing_order', 'id')
        return [
            {
                'recipient': recipient.id,
                'party_key': recipient.party_key,
                'name': recipient.name,
                'email': recipient.email,
                'role': recipient.role,
                'status': recipient.status,
                'routing_order': recipient.routing_order,
            }
            for recipient in recipients
        ]

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
