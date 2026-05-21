from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import decorators, response, serializers, status, viewsets

from accounts.models import Membership
from accounts.permissions import OrganizationRolePermission, OrganizationScopedQuerySetMixin

from .models import WorkflowDefinition, WorkflowEvent, WorkflowRun, WorkflowStage
from .serializers import WorkflowDefinitionSerializer, WorkflowEventSerializer, WorkflowRunSerializer, WorkflowStageSerializer


class WorkflowDefinitionViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'workflow_builder'
    write_roles = OrganizationRolePermission.write_roles
    queryset = WorkflowDefinition.objects.select_related('organization', 'created_by').prefetch_related('stages').all().order_by('name')
    serializer_class = WorkflowDefinitionSerializer
    permission_classes = [OrganizationRolePermission]

    def perform_create(self, serializer):
        self._assert_related_organization_access(serializer)
        serializer.save(created_by=self.request.user)

    @decorators.action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        workflow = self.get_object()
        validation = self._validate_workflow(workflow)
        if not validation['valid']:
            return response.Response(validation, status=status.HTTP_400_BAD_REQUEST)
        workflow.status = WorkflowDefinition.Status.ACTIVE
        workflow.save(update_fields=['status', 'updated_at'])
        return response.Response(self.get_serializer(workflow).data)

    @decorators.action(detail=True, methods=['post'])
    def archive(self, request, pk=None):
        workflow = self.get_object()
        workflow.status = WorkflowDefinition.Status.ARCHIVED
        workflow.save(update_fields=['status', 'updated_at'])
        return response.Response(self.get_serializer(workflow).data)

    @decorators.action(detail=True, methods=['post'])
    def simulate(self, request, pk=None):
        workflow = self.get_object()
        validation = self._validate_workflow(workflow)
        return response.Response({'workflow': workflow.id, **validation})

    @decorators.action(detail=True, methods=['post'], url_path='replace-stages')
    def replace_stages(self, request, pk=None):
        workflow = self.get_object()
        stages = request.data.get('stages') or []
        if not isinstance(stages, list):
            raise serializers.ValidationError({'stages': 'Expected a list of stages.'})
        with transaction.atomic():
            workflow.stages.all().delete()
            created = []
            seen_keys = set()
            for index, raw_stage in enumerate(stages, start=1):
                label = (raw_stage.get('label') or f'Stage {index}').strip()
                key = (raw_stage.get('key') or slugify(label).replace('-', '_') or f'stage_{index}').strip().lower()
                key = ''.join(char if char.isalnum() or char == '_' else '_' for char in key).strip('_') or f'stage_{index}'
                if key in seen_keys:
                    key = f'{key}_{index}'
                seen_keys.add(key)
                created.append(WorkflowStage.objects.create(
                    workflow=workflow,
                    key=key,
                    label=label,
                    stage_type=raw_stage.get('stage_type') or raw_stage.get('type') or 'approval',
                    order=raw_stage.get('order') or index,
                    config=raw_stage.get('config') or {},
                ))
            workflow.schema = {
                **(workflow.schema or {}),
                'stages': [
                    {
                        'key': stage.key,
                        'label': stage.label,
                        'stage_type': stage.stage_type,
                        'order': stage.order,
                        'config': stage.config,
                    }
                    for stage in sorted(created, key=lambda stage: stage.order)
                ],
            }
            workflow.save(update_fields=['schema', 'updated_at'])
        return response.Response(self.get_serializer(workflow).data)

    def _validate_workflow(self, workflow):
        stages = list(workflow.stages.order_by('order').values('key', 'label', 'stage_type', 'order', 'config'))
        errors = []
        warnings = []
        if not workflow.name.strip():
            errors.append('Workflow name is required.')
        if not stages:
            errors.append('At least one workflow stage is required.')
        keys = [stage['key'] for stage in stages]
        if len(keys) != len(set(keys)):
            errors.append('Stage keys must be unique.')
        orders = [stage['order'] for stage in stages]
        if len(orders) != len(set(orders)):
            errors.append('Stage order values must be unique.')
        if stages and stages[0]['stage_type'] not in ['signing', 'approval', 'review', 'notification', 'condition']:
            warnings.append('First stage uses an uncommon type.')
        if not any(stage['stage_type'] in ['signing', 'approval', 'review'] for stage in stages):
            warnings.append('Workflow has no human action stage.')
        return {
            'valid': not errors,
            'errors': errors,
            'warnings': warnings,
            'stage_count': len(stages),
            'stages': stages,
        }


class WorkflowStageViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'workflow_builder'
    write_roles = OrganizationRolePermission.write_roles
    queryset = WorkflowStage.objects.select_related('workflow').all()
    serializer_class = WorkflowStageSerializer
    permission_classes = [OrganizationRolePermission]


class WorkflowRunViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'workflow_builder'
    queryset = WorkflowRun.objects.select_related('envelope', 'workflow').all().order_by('-started_at')
    serializer_class = WorkflowRunSerializer
    permission_classes = [OrganizationRolePermission]
    write_roles = [Membership.Role.ADMIN, Membership.Role.MANAGER]

    def perform_create(self, serializer):
        run = serializer.save()
        # Immediately place the run on the first stage so it is never in the
        # contradictory "running but no stage" state that shows as "Not started".
        stages = list(run.workflow.stages.order_by('order')) if run.workflow else []
        if stages:
            run.current_stage_key = stages[0].key
            run.save(update_fields=['current_stage_key'])
            WorkflowEvent.objects.create(
                run=run,
                envelope=run.envelope,
                event_type='workflow.started',
                stage_key=stages[0].key,
                actor=self.request.user if self.request.user.is_authenticated else None,
                message=f'Workflow run started — initial stage: {stages[0].label}.',
                metadata={},
            )

    @decorators.action(detail=True, methods=['post'])
    def advance(self, request, pk=None):
        run = self.get_object()
        if run.status != WorkflowRun.Status.RUNNING:
            return response.Response({'detail': f'Workflow run is {run.status}.'}, status=status.HTTP_400_BAD_REQUEST)
        stages = list(run.workflow.stages.order_by('order')) if run.workflow else []
        if not stages:
            run.status = WorkflowRun.Status.COMPLETED
            run.completed_at = timezone.now()
            run.save(update_fields=['status', 'completed_at'])
            self._record_event(run, 'workflow.completed', '', request, 'Workflow completed because it has no configured stages.')
            return response.Response(self.get_serializer(run).data)

        current_index = next((index for index, stage in enumerate(stages) if stage.key == run.current_stage_key), -1)
        next_stage = stages[current_index + 1] if current_index + 1 < len(stages) else None
        if next_stage:
            run.current_stage_key = next_stage.key
            run.save(update_fields=['current_stage_key'])
            self._record_event(run, 'workflow.stage_advanced', next_stage.key, request, request.data.get('message') or f'Advanced to {next_stage.label}.')
        else:
            run.status = WorkflowRun.Status.COMPLETED
            run.completed_at = timezone.now()
            run.save(update_fields=['status', 'completed_at'])
            self._record_event(run, 'workflow.completed', run.current_stage_key, request, request.data.get('message') or 'Workflow completed.')
        return response.Response(self.get_serializer(run).data)

    def _record_event(self, run, event_type, stage_key, request, message):
        WorkflowEvent.objects.create(
            run=run,
            envelope=run.envelope,
            event_type=event_type,
            stage_key=stage_key,
            actor=request.user if request.user.is_authenticated else None,
            message=message,
            metadata=request.data.get('metadata') or {},
        )


class WorkflowEventViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'workflow_builder'
    queryset = WorkflowEvent.objects.select_related('run', 'envelope', 'actor').all()
    serializer_class = WorkflowEventSerializer
    permission_classes = [OrganizationRolePermission]
    write_roles = [Membership.Role.ADMIN, Membership.Role.MANAGER]
