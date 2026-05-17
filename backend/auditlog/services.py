from .models import AuditEvent


def log_admin_event(*, organization, actor=None, event_type, message, request=None, severity=AuditEvent.Severity.INFO, metadata=None):
    return AuditEvent.objects.create(
        organization=organization,
        actor=actor,
        severity=severity,
        event_type=event_type,
        message=message,
        ip_address=request.META.get('REMOTE_ADDR') if request else None,
        user_agent=request.META.get('HTTP_USER_AGENT', '') if request else '',
        metadata=metadata or {},
    )
