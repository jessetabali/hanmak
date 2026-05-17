from drf_spectacular.utils import OpenApiTypes, extend_schema
from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions, response, views

from accounts.models import UserProfile
from accounts.permissions import feature_flag_allows_request, request_organization_ids, user_organization_ids
from approvals.models import ApprovalRequest
from signing.models import SigningSession
from tasks.models import TaskRun, TaskRunEvent


class MyInboxView(views.APIView):
    feature_flag_key = 'core_inbox'
    permission_classes = [permissions.IsAuthenticated]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if not feature_flag_allows_request(request, self):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('The "core_inbox" feature is not released for this organization.')

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        snoozed_until = self._snoozed_map(request.user)
        marked_read_at = self._marked_read_at(request.user)
        self._inbox_read_items = self._read_items(request.user)
        approval_items = ApprovalRequest.objects.select_related('envelope', 'approver', 'delegated_to').filter(
            Q(approver=request.user, status=ApprovalRequest.Status.PENDING)
            | Q(delegated_to=request.user, status=ApprovalRequest.Status.DELEGATED)
        )
        signing_items = SigningSession.objects.select_related('envelope', 'recipient').filter(
            status__in=[SigningSession.Status.CREATED, SigningSession.Status.OPENED],
            recipient__email__iexact=request.user.email,
        )
        failed_tasks = TaskRun.objects.filter(status=TaskRun.Status.FAILED, created_by=request.user)
        completed_since = timezone.now() - timezone.timedelta(days=1)
        completed_approvals = ApprovalRequest.objects.select_related('envelope', 'approver').filter(
            Q(approver=request.user) | Q(delegated_to=request.user),
            status__in=[ApprovalRequest.Status.APPROVED, ApprovalRequest.Status.REJECTED, ApprovalRequest.Status.CHANGES_REQUESTED],
            decided_at__gte=completed_since,
        )
        completed_signing = SigningSession.objects.select_related('envelope', 'recipient').filter(
            status=SigningSession.Status.SUBMITTED,
            submitted_at__gte=completed_since,
            recipient__email__iexact=request.user.email,
        )
        completed_tasks = TaskRun.objects.filter(
            status__in=[TaskRun.Status.SUCCEEDED, TaskRun.Status.CANCELLED],
            created_by=request.user,
            finished_at__gte=completed_since,
        )
        organization_ids = request_organization_ids(request)
        if organization_ids is not None:
            approval_items = approval_items.filter(envelope__organization_id__in=organization_ids)
            signing_items = signing_items.filter(envelope__organization_id__in=organization_ids)
            failed_tasks = failed_tasks.filter(organization_id__in=organization_ids)
            completed_approvals = completed_approvals.filter(envelope__organization_id__in=organization_ids)
            completed_signing = completed_signing.filter(envelope__organization_id__in=organization_ids)
            completed_tasks = completed_tasks.filter(organization_id__in=organization_ids)
        approval_items = [item for item in approval_items[:50] if not self._is_snoozed(snoozed_until, f'approval:{item.id}')]
        signing_items = [item for item in signing_items[:50] if not self._is_snoozed(snoozed_until, f'signing:{item.id}')]
        failed_tasks = [item for item in failed_tasks[:50] if not self._is_snoozed(snoozed_until, f'task:{item.id}')]
        completed = (
            [self._completed_approval_payload(item, marked_read_at) for item in completed_approvals[:20]]
            + [self._completed_signing_payload(item, marked_read_at) for item in completed_signing[:20]]
            + [self._completed_task_payload(item, marked_read_at) for item in completed_tasks[:20]]
        )
        completed.sort(key=lambda item: item.get('completed_at') or '', reverse=True)
        return response.Response({
            'counts': {
                'approvals': len(approval_items),
                'signing': len(signing_items),
                'failed_tasks': len(failed_tasks),
                'completed_today': len(completed),
                'unread': sum(
                    1 for item in [
                        *[self._approval_payload(item, marked_read_at) for item in approval_items],
                        *[self._signing_payload(item, marked_read_at) for item in signing_items],
                        *[self._task_payload(item, marked_read_at) for item in failed_tasks],
                    ]
                    if item['unread']
                ),
            },
            'approvals': [self._approval_payload(item, marked_read_at) for item in approval_items[:20]],
            'signing': [self._signing_payload(item, marked_read_at) for item in signing_items[:20]],
            'failed_tasks': [self._task_payload(item, marked_read_at) for item in failed_tasks[:20]],
            'completed': completed[:20],
            'marked_read_at': marked_read_at,
        })

    def post(self, request):
        action = request.data.get('action')
        if action == 'mark_all_read':
            profile, _ = UserProfile.objects.get_or_create(user=request.user)
            profile.preferences = {
                **(profile.preferences or {}),
                'inbox_marked_read_at': timezone.now().isoformat(),
            }
            profile.save(update_fields=['preferences', 'updated_at'])
            return response.Response({'ok': True, 'marked_read_at': profile.preferences['inbox_marked_read_at']})
        if action == 'mark_read':
            key = request.data.get('key')
            if not key:
                return response.Response({'detail': 'key is required.'}, status=400)
            profile, _ = UserProfile.objects.get_or_create(user=request.user)
            read_items = (profile.preferences or {}).get('inbox_read_items', {})
            read_items[key] = timezone.now().isoformat()
            profile.preferences = {**(profile.preferences or {}), 'inbox_read_items': read_items}
            profile.save(update_fields=['preferences', 'updated_at'])
            return response.Response({'ok': True, 'key': key, 'read_at': read_items[key]})
        if action == 'snooze':
            key = request.data.get('key')
            minutes = int(request.data.get('minutes') or 60)
            if not key:
                return response.Response({'detail': 'key is required.'}, status=400)
            profile, _ = UserProfile.objects.get_or_create(user=request.user)
            snoozed = (profile.preferences or {}).get('inbox_snoozed_until', {})
            snoozed[key] = (timezone.now() + timezone.timedelta(minutes=minutes)).isoformat()
            profile.preferences = {**(profile.preferences or {}), 'inbox_snoozed_until': snoozed}
            profile.save(update_fields=['preferences', 'updated_at'])
            return response.Response({'ok': True, 'key': key, 'snoozed_until': snoozed[key]})
        if action == 'unsnooze':
            key = request.data.get('key')
            if not key:
                return response.Response({'detail': 'key is required.'}, status=400)
            profile, _ = UserProfile.objects.get_or_create(user=request.user)
            snoozed = (profile.preferences or {}).get('inbox_snoozed_until', {})
            snoozed.pop(key, None)
            profile.preferences = {**(profile.preferences or {}), 'inbox_snoozed_until': snoozed}
            profile.save(update_fields=['preferences', 'updated_at'])
            return response.Response({'ok': True, 'key': key})
        if action == 'restart_task':
            task = self._user_task(request.user, request.data.get('id'))
            if not task:
                return response.Response({'detail': 'Task was not found in your inbox.'}, status=404)
            if task.status != TaskRun.Status.FAILED:
                return response.Response({'detail': 'Only failed tasks can be restarted.'}, status=400)
            if task.definition and not task.definition.is_restartable:
                return response.Response({'detail': 'This task is not restartable.'}, status=400)
            new_run = TaskRun.objects.create(
                organization=task.organization,
                definition=task.definition,
                restarted_from=task,
                task_name=task.task_name,
                queue_name=task.queue_name,
                related_object_type=task.related_object_type,
                related_object_id=task.related_object_id,
                payload=task.payload,
                status=TaskRun.Status.QUEUED,
                attempt_number=1,
                max_attempts=task.max_attempts,
                created_by=request.user,
            )
            TaskRunEvent.objects.create(task_run=new_run, event_type='inbox_restarted', message=f'Restarted from inbox task {task.id}')
            return response.Response({'ok': True, 'task_run': self._task_payload(new_run, self._marked_read_at(request.user))})
        if action == 'cancel_task':
            task = self._user_task(request.user, request.data.get('id'))
            if not task:
                return response.Response({'detail': 'Task was not found in your inbox.'}, status=404)
            task.status = TaskRun.Status.CANCELLED
            task.finished_at = timezone.now()
            task.save(update_fields=['status', 'finished_at', 'updated_at'])
            TaskRunEvent.objects.create(task_run=task, event_type='inbox_cancelled', message='Task cancelled from inbox')
            return response.Response({'ok': True, 'task_run': self._completed_task_payload(task, self._marked_read_at(request.user))})
        return response.Response({'detail': 'Unsupported inbox action.'}, status=400)

    def _approval_payload(self, item, marked_read_at):
        key = f'approval:{item.id}'
        return {
            'id': item.id,
            'type': 'approval',
            'action_key': key,
            'envelope': item.envelope_id,
            'envelope_name': item.envelope.name,
            'role': item.approval_role,
            'status': item.status,
            'assigned_to_me_as_delegate': item.delegated_to_id is not None,
            'due_at': item.due_at,
            'created_at': item.created_at,
            'priority': self._priority(item.due_at),
            'overdue': self._is_overdue(item.due_at),
            'unread': self._is_unread(item.created_at, marked_read_at, key),
        }

    def _signing_payload(self, item, marked_read_at):
        key = f'signing:{item.id}'
        due_at = item.expires_at or item.envelope.due_date
        return {
            'id': item.id,
            'type': 'signing',
            'action_key': key,
            'envelope': item.envelope_id,
            'envelope_name': item.envelope.name,
            'recipient': item.recipient_id,
            'recipient_name': item.recipient.name,
            'recipient_email': item.recipient.email,
            'status': item.status,
            'token': item.token,
            'due_at': due_at,
            'created_at': item.created_at,
            'priority': self._priority(due_at),
            'overdue': self._is_overdue(due_at),
            'unread': self._is_unread(item.created_at, marked_read_at, key),
        }

    def _task_payload(self, item, marked_read_at):
        key = f'task:{item.id}'
        return {
            'id': item.id,
            'type': 'task',
            'action_key': key,
            'task_name': item.task_name,
            'queue_name': item.queue_name,
            'status': item.status,
            'error_message': item.error_message,
            'created_at': item.queued_at,
            'due_at': item.next_retry_at,
            'priority': 'high',
            'overdue': True,
            'unread': self._is_unread(item.queued_at, marked_read_at, key),
            'restartable': not item.definition or item.definition.is_restartable,
        }

    def _completed_approval_payload(self, item, marked_read_at):
        payload = self._approval_payload(item, marked_read_at)
        payload.update({'ui_completed': True, 'completed_at': item.decided_at, 'unread': False})
        return payload

    def _completed_signing_payload(self, item, marked_read_at):
        payload = self._signing_payload(item, marked_read_at)
        payload.update({'ui_completed': True, 'completed_at': item.submitted_at, 'unread': False})
        return payload

    def _completed_task_payload(self, item, marked_read_at):
        payload = self._task_payload(item, marked_read_at)
        payload.update({'ui_completed': True, 'completed_at': item.finished_at, 'unread': False, 'overdue': False})
        return payload

    def _snoozed_map(self, user):
        try:
            return user.hanmak_profile.preferences.get('inbox_snoozed_until', {}) or {}
        except UserProfile.DoesNotExist:
            return {}

    def _marked_read_at(self, user):
        try:
            return user.hanmak_profile.preferences.get('inbox_marked_read_at')
        except UserProfile.DoesNotExist:
            return None

    def _read_items(self, user):
        try:
            return user.hanmak_profile.preferences.get('inbox_read_items', {}) or {}
        except UserProfile.DoesNotExist:
            return {}

    def _is_unread(self, created_at, marked_read_at, key):
        if key in getattr(self, '_inbox_read_items', {}):
            return False
        if not marked_read_at:
            return True
        read_at = timezone.datetime.fromisoformat(marked_read_at)
        if timezone.is_naive(read_at):
            read_at = timezone.make_aware(read_at, timezone.get_current_timezone())
        return created_at > read_at

    def _is_snoozed(self, snoozed_until, key):
        value = snoozed_until.get(key)
        if not value:
            return False
        until = timezone.datetime.fromisoformat(value)
        if timezone.is_naive(until):
            until = timezone.make_aware(until, timezone.get_current_timezone())
        return until > timezone.now()

    def _is_overdue(self, due_at):
        due_at = self._coerce_datetime(due_at)
        return bool(due_at and due_at < timezone.now())

    def _priority(self, due_at):
        due_at = self._coerce_datetime(due_at)
        if not due_at:
            return 'medium'
        if due_at < timezone.now():
            return 'high'
        if due_at <= timezone.now() + timezone.timedelta(days=1):
            return 'high'
        if due_at <= timezone.now() + timezone.timedelta(days=3):
            return 'medium'
        return 'low'

    def _coerce_datetime(self, value):
        if not value:
            return None
        if isinstance(value, timezone.datetime):
            if timezone.is_naive(value):
                return timezone.make_aware(value, timezone.get_current_timezone())
            return value
        return timezone.make_aware(timezone.datetime.combine(value, timezone.datetime.max.time()), timezone.get_current_timezone())

    def _user_task(self, user, task_id):
        if not task_id:
            return None
        queryset = TaskRun.objects.select_related('definition', 'organization').filter(id=task_id, created_by=user)
        organization_ids = user_organization_ids(user)
        if organization_ids is not None:
            queryset = queryset.filter(organization_id__in=organization_ids)
        return queryset.first()

# Create your views here.
