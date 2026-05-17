from django.utils import timezone
from django.db import models
from django.db.models import Count
from rest_framework import decorators, permissions, response, serializers, viewsets

from accounts.permissions import OrganizationRolePermission, OrganizationScopedQuerySetMixin, feature_flag_allows_request
from auditlog.services import log_admin_event

from .models import TaskDefinition, TaskRun, TaskRunEvent
from .serializers import TaskDefinitionSerializer, TaskRunEventSerializer, TaskRunSerializer


class TaskDefinitionViewSet(viewsets.ModelViewSet):
    feature_flag_key = 'background_tasks'
    queryset = TaskDefinition.objects.all().order_by('name')
    serializer_class = TaskDefinitionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if not feature_flag_allows_request(request, self):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('The "background_tasks" feature is not released for this organization.')


class TaskRunViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'background_tasks'
    queryset = TaskRun.objects.select_related('organization', 'definition', 'created_by').prefetch_related('events').all()
    serializer_class = TaskRunSerializer
    permission_classes = [OrganizationRolePermission]
    write_roles = OrganizationRolePermission.write_roles

    @decorators.action(detail=False, methods=['get'])
    def summary(self, request):
        queryset = self.filter_queryset(self.get_queryset())
        total = queryset.count()
        now = timezone.now()
        stale_cutoff = now - timezone.timedelta(minutes=15)
        status_counts = dict(queryset.values_list('status').annotate(total=Count('id')))
        queues = [
            {
                'queue': item['queue_name'],
                'total': item['total'],
                'queued': item.get('queued', 0),
                'running': item.get('running', 0),
                'failed': item.get('failed', 0),
                'succeeded': item.get('succeeded', 0),
            }
            for item in queryset.values('queue_name').annotate(
                total=Count('id'),
                queued=Count('id', filter=models.Q(status=TaskRun.Status.QUEUED)),
                running=Count('id', filter=models.Q(status=TaskRun.Status.RUNNING)),
                failed=Count('id', filter=models.Q(status=TaskRun.Status.FAILED)),
                succeeded=Count('id', filter=models.Q(status=TaskRun.Status.SUCCEEDED)),
            ).order_by('queue_name')
        ]
        return response.Response({
            'total': total,
            'queued': status_counts.get(TaskRun.Status.QUEUED, 0),
            'running': status_counts.get(TaskRun.Status.RUNNING, 0),
            'failed': status_counts.get(TaskRun.Status.FAILED, 0),
            'succeeded': status_counts.get(TaskRun.Status.SUCCEEDED, 0),
            'cancelled': status_counts.get(TaskRun.Status.CANCELLED, 0),
            'retry_due': queryset.filter(status=TaskRun.Status.RETRYING, next_retry_at__lte=now).count(),
            'stale_running': queryset.filter(status=TaskRun.Status.RUNNING, started_at__lt=stale_cutoff).count(),
            'queues': queues,
            'recent': self.get_serializer(queryset[:25], many=True).data,
        })

    @decorators.action(detail=False, methods=['post'])
    def purge_failed(self, request):
        queryset = self.filter_queryset(self.get_queryset()).filter(status=TaskRun.Status.FAILED)
        organization = queryset.first().organization if queryset.exists() else None
        count = queryset.count()
        queryset.delete()
        if organization:
            log_admin_event(organization=organization, actor=request.user, event_type='admin.task_purged', message=f'Purged {count} failed task runs', request=request, metadata={'purged_count': count})
        return response.Response({'ok': True, 'purged_count': count})

    @decorators.action(detail=True, methods=['post'])
    def restart(self, request, pk=None):
        task_run = self.get_object()
        if task_run.status != TaskRun.Status.FAILED:
            raise serializers.ValidationError('Only failed tasks can be restarted.')
        if task_run.definition and not task_run.definition.is_restartable:
            raise serializers.ValidationError('This task is not restartable.')
        new_run = TaskRun.objects.create(
            organization=task_run.organization,
            definition=task_run.definition,
            restarted_from=task_run,
            task_name=task_run.task_name,
            queue_name=task_run.queue_name,
            related_object_type=task_run.related_object_type,
            related_object_id=task_run.related_object_id,
            payload=task_run.payload,
            status=TaskRun.Status.QUEUED,
            attempt_number=1,
            max_attempts=task_run.max_attempts,
            created_by=request.user,
        )
        TaskRunEvent.objects.create(task_run=new_run, event_type='restarted', message=f'Restarted from task run {task_run.id}')
        if new_run.organization:
            log_admin_event(organization=new_run.organization, actor=request.user, event_type='admin.task_restarted', message=f'Restarted task {task_run.task_name}', request=request, metadata={'task_run': task_run.id, 'new_run': new_run.id})
        return response.Response(self.get_serializer(new_run).data)

    @decorators.action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        task_run = self.get_object()
        task_run.status = TaskRun.Status.CANCELLED
        task_run.finished_at = timezone.now()
        task_run.save(update_fields=['status', 'finished_at', 'updated_at'])
        TaskRunEvent.objects.create(task_run=task_run, event_type='cancelled', message='Task cancelled by user')
        if task_run.organization:
            log_admin_event(organization=task_run.organization, actor=request.user, event_type='admin.task_cancelled', message=f'Cancelled task {task_run.task_name}', request=request, metadata={'task_run': task_run.id})
        return response.Response(self.get_serializer(task_run).data)


class TaskRunEventViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'background_tasks'
    queryset = TaskRunEvent.objects.select_related('task_run').all()
    serializer_class = TaskRunEventSerializer
    permission_classes = [OrganizationRolePermission]
    write_roles = OrganizationRolePermission.write_roles
