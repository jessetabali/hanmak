from django.utils import timezone

from .models import WorkflowEvent, WorkflowRun


def advance_running_workflows_for_recipient(envelope, recipient, *, message=''):
    """Advance a running workflow when its current stage belongs to this recipient."""
    if not recipient or not recipient.party_key:
        return []

    advanced = []
    runs = (
        WorkflowRun.objects
        .select_related('workflow')
        .prefetch_related('workflow__stages')
        .filter(envelope=envelope, status=WorkflowRun.Status.RUNNING)
    )
    for run in runs:
        stages = list(run.workflow.stages.order_by('order')) if run.workflow else []
        current_index = next((index for index, stage in enumerate(stages) if stage.key == run.current_stage_key), -1)
        if current_index < 0:
            continue
        current_stage = stages[current_index]
        if current_stage.key != recipient.party_key:
            continue

        WorkflowEvent.objects.create(
            run=run,
            envelope=envelope,
            event_type='workflow.stage_completed',
            stage_key=current_stage.key,
            message=message or f'{current_stage.label} completed by {recipient.name}.',
            metadata={
                'source': 'public_signing',
                'recipient_id': recipient.id,
                'recipient_email': recipient.email,
                'recipient_role': recipient.role,
                'party_key': recipient.party_key,
            },
        )
        next_stage = stages[current_index + 1] if current_index + 1 < len(stages) else None
        if next_stage:
            run.current_stage_key = next_stage.key
            run.save(update_fields=['current_stage_key'])
            WorkflowEvent.objects.create(
                run=run,
                envelope=envelope,
                event_type='workflow.stage_advanced',
                stage_key=next_stage.key,
                message=f'Advanced to {next_stage.label} after {recipient.name} completed {current_stage.label}.',
                metadata={
                    'source': 'public_signing',
                    'recipient_id': recipient.id,
                    'from_stage_key': current_stage.key,
                    'to_stage_key': next_stage.key,
                },
            )
        else:
            run.status = WorkflowRun.Status.COMPLETED
            run.completed_at = timezone.now()
            run.save(update_fields=['status', 'completed_at'])
            WorkflowEvent.objects.create(
                run=run,
                envelope=envelope,
                event_type='workflow.completed',
                stage_key=current_stage.key,
                message=f'Workflow completed after {recipient.name} completed {current_stage.label}.',
                metadata={
                    'source': 'public_signing',
                    'recipient_id': recipient.id,
                    'party_key': recipient.party_key,
                },
            )
        advanced.append(run)
    return advanced
