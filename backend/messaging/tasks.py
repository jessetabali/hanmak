from celery import shared_task
from django.db import models
from django.utils import timezone

from .models import EmailMessage, ReminderSchedule
from .services import deliver_email_message, queue_reminders


@shared_task
def deliver_email_message_task(message_id):
    message = EmailMessage.objects.get(id=message_id)
    try:
        deliver_email_message(message)
    except Exception as exc:
        message.status = EmailMessage.Status.FAILED
        message.retry_count += 1
        message.error_message = str(exc)
        if message.retry_count < message.max_attempts:
            message.next_attempt_at = timezone.now() + timezone.timedelta(minutes=5 * message.retry_count)
        message.save(update_fields=['status', 'retry_count', 'next_attempt_at', 'error_message'])
        raise


@shared_task
def retry_failed_email_messages_task():
    due = EmailMessage.objects.filter(
        status=EmailMessage.Status.FAILED,
        retry_count__lt=models.F('max_attempts'),
        next_attempt_at__lte=timezone.now(),
    )
    count = 0
    for message in due:
        deliver_email_message_task.apply_async(args=[message.id], queue='email')
        count += 1
    return count


@shared_task
def run_due_reminder_schedules_task():
    schedules = ReminderSchedule.objects.select_related('envelope', 'organization').filter(
        status=ReminderSchedule.Status.ACTIVE,
        next_run_at__lte=timezone.now(),
    )
    sent = 0
    for schedule in schedules:
        messages = queue_reminders(schedule.envelope, queued_by=schedule.created_by)
        for message in messages:
            deliver_email_message_task.apply_async(args=[message.id], queue='email')
        schedule.reminders_sent += 1
        if schedule.reminders_sent >= schedule.max_reminders or not messages:
            schedule.status = ReminderSchedule.Status.COMPLETED
        else:
            schedule.next_run_at = timezone.now() + timezone.timedelta(days=schedule.interval_days)
        schedule.save(update_fields=['reminders_sent', 'status', 'next_run_at', 'updated_at'])
        sent += len(messages)
    return sent
