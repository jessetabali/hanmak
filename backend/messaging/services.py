from django.conf import settings
from django.core.mail import EmailMultiAlternatives, get_connection
from django.utils import timezone
from django.utils.html import escape

from signing.models import SigningSession
from configcenter.models import AppSetting

from .models import EmailMessage, EmailTemplate


def branding_for_organization(organization):
    defaults = {
        'brand_name': 'HanMak',
        'tagline': 'Secure document signing',
        'primary_color': '#2563eb',
        'accent_color': '#111827',
        'logo_url': '',
    }
    if not organization:
        return defaults
    setting = AppSetting.objects.filter(organization=organization, namespace='branding', key='theme').first()
    if setting and isinstance(setting.value, dict):
        defaults.update({key: value for key, value in setting.value.items() if value})
    if getattr(organization, 'logo', None):
        defaults['logo_url'] = organization.logo.url
    defaults['brand_name'] = defaults.get('brand_name') or organization.name or 'HanMak'
    return defaults


def render_setup_email(*, organization, user, setup_url):
    brand = branding_for_organization(organization)
    brand_name = brand['brand_name']
    accent = brand['primary_color']
    logo = (
        f'<img src="{escape(brand["logo_url"])}" alt="{escape(brand_name)}" style="width:42px;height:42px;border-radius:8px;object-fit:contain;">'
        if brand.get('logo_url')
        else '<div style="width:42px;height:42px;border-radius:8px;background:#111827;color:white;display:inline-flex;align-items:center;justify-content:center;font-weight:900;">H</div>'
    )
    name = user.get_full_name() or user.username
    subject = f'Set up your {brand_name} account'
    body = (
        f'Hello {name},\n\n'
        f'An administrator created your {brand_name} account for {organization.name}.\n'
        f'Set up your password and security options here:\n{setup_url}\n\n'
        'This setup link expires in one hour.'
    )
    html = f"""
<!doctype html>
<html>
  <body style="margin:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;color:#172033;">
    <div style="max-width:640px;margin:0 auto;padding:32px 16px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;">{logo}<div><div style="font-size:22px;font-weight:900;color:#111827;line-height:1;">{escape(brand_name)}</div><div style="font-size:12px;color:#64748b;margin-top:3px;">{escape(brand['tagline'])}</div></div></div>
      <div style="background:#fff;border:1px solid #dbe3ef;border-radius:10px;overflow:hidden;box-shadow:0 12px 32px rgba(15,23,42,0.08);">
        <div style="height:6px;background:{accent};"></div>
        <div style="padding:30px;">
          <h1 style="font-size:25px;line-height:1.25;margin:0 0 12px;color:#0f172a;">Set up your account</h1>
          <p style="font-size:15px;line-height:1.65;color:#334155;">Hello {escape(name)}, an administrator created your account for <strong>{escape(organization.name)}</strong>.</p>
          <a href="{escape(setup_url)}" style="display:inline-block;background:{accent};color:white;text-decoration:none;font-weight:800;border-radius:7px;padding:13px 19px;">Set up account</a>
          <p style="font-size:12px;color:#64748b;margin-top:22px;">This setup link expires in one hour.</p>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;font-size:11px;line-height:1.5;color:#64748b;word-break:break-all;">{escape(setup_url)}</div>
        </div>
      </div>
    </div>
  </body>
</html>
"""
    return subject, body, html


def absolute_signing_url(request, session):
    # Always use the configured public base URL so the link points to the
    # frontend (nginx), not the Django backend. request.build_absolute_uri
    # would produce a backend-port URL which recipients cannot use.
    base = settings.HANMAK_PUBLIC_BASE_URL.rstrip('/')
    return f'{base}/sign/{session.token}'


def render_email(kind, envelope, recipient, signing_url):
    brand = branding_for_organization(envelope.organization)
    due_date = envelope.due_date.strftime('%b %-d, %Y') if envelope.due_date else 'No due date set'
    sender_name = str(envelope.sender)
    recipient_name = recipient.name or recipient.email
    template = EmailTemplate.objects.filter(
        organization=envelope.organization,
        kind=kind,
        is_active=True,
    ).order_by('-updated_at').first() or EmailTemplate.objects.filter(
        organization=None,
        kind=kind,
        is_active=True,
    ).order_by('-updated_at').first()
    if template:
        context = {
            'brand_name': brand['brand_name'],
            'envelope_name': envelope.name,
            'recipient_name': recipient_name,
            'recipient_email': recipient.email,
            'sender_name': sender_name,
            'due_date': due_date,
            'signing_url': signing_url,
        }
        return (
            render_template_string(template.subject_template, context),
            render_template_string(template.body_template, context),
            render_template_string(template.html_template, context) if template.html_template else '',
        )
    if kind == EmailMessage.Kind.COMPLETED:
        action = 'download or archive'
        headline = 'Envelope completed'
        eyebrow = 'Completed document'
        subject = f'Completed: {envelope.name}'
        button_label = 'Open completed envelope'
        accent = '#16a34a'
    elif recipient.role == recipient.Role.APPROVER:
        action = 'review and approve'
        headline = 'Approval requested' if kind == EmailMessage.Kind.ENVELOPE_INVITE else 'Approval reminder'
        eyebrow = 'Approval workflow'
        subject = (
            f'{envelope.sender} sent you {envelope.name} for approval'
            if kind == EmailMessage.Kind.ENVELOPE_INVITE
            else f'Reminder: {envelope.name} is awaiting your approval'
        )
        button_label = 'Review and approve'
        accent = '#7c3aed'
    else:
        action = 'review and sign' if kind == EmailMessage.Kind.ENVELOPE_INVITE else 'complete'
        headline = 'Signature requested' if kind == EmailMessage.Kind.ENVELOPE_INVITE else 'Signature reminder'
        eyebrow = 'Secure signature request'
        subject = (
            f'{envelope.sender} sent you {envelope.name} for signature'
            if kind == EmailMessage.Kind.ENVELOPE_INVITE
            else f'Reminder: {envelope.name} is awaiting your signature'
        )
        button_label = 'Open and sign'
        accent = '#2563eb'
    brand_name = brand['brand_name']
    logo = (
        f'<img src="{escape(brand["logo_url"])}" alt="{escape(brand_name)}" style="width:36px;height:36px;border-radius:8px;object-fit:contain;">'
        if brand.get('logo_url')
        else '<div style="width:36px;height:36px;border-radius:8px;background:#111827;color:white;display:inline-flex;align-items:center;justify-content:center;font-weight:900;">H</div>'
    )
    text = (
        f'Hello {recipient_name},\n\n'
        f'{headline}: {envelope.name}\n\n'
        f'Please {action} this document in {brand_name}.\n'
        f'Sender: {sender_name}\n'
        f'Due: {due_date}\n\n'
        f'Secure signing link:\n{signing_url}\n\n'
        'This link is unique to you. Do not forward it.'
    )
    html = f"""
<!doctype html>
<html>
  <body style="margin:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;color:#172033;">
    <div style="display:none;max-height:0;overflow:hidden;">{escape(headline)} for {escape(envelope.name)}. This secure {escape(brand_name)} link is unique to you.</div>
    <div style="max-width:680px;margin:0 auto;padding:34px 16px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;">
        {logo}
        <div>
          <div style="font-size:22px;font-weight:900;color:#111827;line-height:1;">{escape(brand_name)}</div>
          <div style="font-size:12px;color:#64748b;margin-top:3px;">{escape(brand['tagline'])}</div>
        </div>
      </div>
      <div style="background:#ffffff;border:1px solid #dbe3ef;border-radius:10px;overflow:hidden;box-shadow:0 12px 32px rgba(15,23,42,0.08);">
        <div style="height:6px;background:{accent};"></div>
        <div style="padding:30px;">
          <div style="font-size:12px;text-transform:uppercase;letter-spacing:.09em;color:{accent};font-weight:800;margin-bottom:10px;">{escape(eyebrow)}</div>
          <h1 style="font-size:25px;line-height:1.25;margin:0 0 12px;color:#0f172a;">{escape(headline)}</h1>
          <p style="font-size:15px;line-height:1.65;margin:0 0 22px;color:#334155;">Hello {escape(recipient_name)}, {escape(sender_name)} sent <strong>{escape(envelope.name)}</strong>. Please {escape(action)} it securely in {escape(brand_name)}.</p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px;">
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;">
              <div style="font-size:12px;color:#64748b;margin-bottom:4px;">Sender</div>
              <div style="font-weight:800;color:#0f172a;">{escape(sender_name)}</div>
            </div>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;">
              <div style="font-size:12px;color:#64748b;margin-bottom:4px;">Due date</div>
              <div style="font-weight:800;color:#0f172a;">{escape(due_date)}</div>
            </div>
          </div>
          <a href="{escape(signing_url)}" style="display:inline-block;background:{accent};color:white;text-decoration:none;font-weight:800;border-radius:7px;padding:13px 19px;">{escape(button_label)}</a>
          <p style="font-size:12px;line-height:1.6;color:#64748b;margin-top:22px;">This link is unique to you and controls only your assigned fields. Do not forward it.</p>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;font-size:11px;line-height:1.5;color:#64748b;word-break:break-all;">{escape(signing_url)}</div>
        </div>
      </div>
      <div style="font-size:12px;color:#94a3b8;margin-top:16px;line-height:1.5;">{escape(brand_name)} keeps an evidence trail for every send, open, signature, approval, and delivery event.</div>
    </div>
  </body>
</html>
"""
    return subject, text, html


def render_template_string(template, context):
    rendered = template or ''
    for key, value in context.items():
        rendered = rendered.replace('{{ ' + key + ' }}', str(value))
        rendered = rendered.replace('{{' + key + '}}', str(value))
    return rendered


def mark_email_bounced(*, message_id=None, to_email='', reason='', raw=None):
    queryset = EmailMessage.objects.all()
    if message_id:
        queryset = queryset.filter(id=message_id)
    elif to_email:
        queryset = queryset.filter(to_email__iexact=to_email).order_by('-queued_at')
    else:
        return None
    message = queryset.first()
    if not message:
        return None
    message.bounced_at = timezone.now()
    message.bounce_reason = reason or 'Provider bounce webhook received.'
    message.status = EmailMessage.Status.FAILED
    message.error_message = message.bounce_reason
    message.next_attempt_at = None
    if raw:
        message.error_message = f'{message.error_message}\n\nRaw webhook: {raw}'
    message.save(update_fields=['bounced_at', 'bounce_reason', 'status', 'error_message', 'next_attempt_at'])
    return message


def queue_envelope_invites(envelope, queued_by=None, request=None):
    messages = []
    recipients = envelope.recipients.exclude(status='delegated')
    open_recipients = recipients.exclude(status__in=['signed', 'declined'])
    current_order = open_recipients.order_by('routing_order').values_list('routing_order', flat=True).first()
    if current_order is None:
        return messages
    for recipient in open_recipients.filter(routing_order=current_order):
        session, _ = SigningSession.objects.get_or_create(envelope=envelope, recipient=recipient)
        signing_url = absolute_signing_url(request, session)
        subject, body, html_body = render_email(EmailMessage.Kind.ENVELOPE_INVITE, envelope, recipient, signing_url)
        message = EmailMessage.objects.create(
            organization=envelope.organization,
            envelope=envelope,
            recipient=recipient,
            signing_session=session,
            kind=EmailMessage.Kind.ENVELOPE_INVITE,
            to_email=recipient.email,
            subject=subject,
            body=body,
            html_body=html_body,
            queued_by=queued_by,
        )
        if recipient.status == recipient.Status.PENDING:
            recipient.status = recipient.Status.SENT
            recipient.save(update_fields=['status'])
        messages.append(message)
    return messages


def queue_reminders(envelope, queued_by=None, request=None):
    messages = []
    for recipient in envelope.recipients.exclude(status__in=['signed', 'declined', 'delegated']):
        messages.append(queue_recipient_reminder(recipient, queued_by=queued_by, request=request))
    return messages


def queue_recipient_reminder(recipient, queued_by=None, request=None):
    session, _ = SigningSession.objects.get_or_create(envelope=recipient.envelope, recipient=recipient)
    signing_url = absolute_signing_url(request, session)
    subject, body, html_body = render_email(EmailMessage.Kind.REMINDER, recipient.envelope, recipient, signing_url)
    return EmailMessage.objects.create(
        organization=recipient.envelope.organization,
        envelope=recipient.envelope,
        recipient=recipient,
        signing_session=session,
        kind=EmailMessage.Kind.REMINDER,
        to_email=recipient.email,
        subject=subject,
        body=body,
        html_body=html_body,
        queued_by=queued_by,
    )


def queue_completion_emails(envelope, queued_by=None, request=None):
    messages = []
    for recipient in envelope.recipients.all():
        session, _ = SigningSession.objects.get_or_create(envelope=envelope, recipient=recipient)
        signing_url = absolute_signing_url(request, session)
        subject, body, html_body = render_email(EmailMessage.Kind.COMPLETED, envelope, recipient, signing_url)
        messages.append(EmailMessage.objects.create(
            organization=envelope.organization,
            envelope=envelope,
            recipient=recipient,
            signing_session=session,
            kind=EmailMessage.Kind.COMPLETED,
            to_email=recipient.email,
            subject=subject,
            body=body,
            html_body=html_body,
            queued_by=queued_by,
        ))
    return messages


def smtp_config_for_organization(organization):
    if not organization:
        return {}
    setting = AppSetting.objects.filter(
        organization=organization,
        namespace='email',
        key='smtp',
    ).first()
    if not setting or not isinstance(setting.value, dict):
        return {}
    return setting.value


def smtp_connection_kwargs(config):
    if not config.get('host'):
        return {}
    kwargs = {
        'host': config.get('host'),
        'port': int(config.get('port') or 587),
        'username': config.get('username') or None,
        'password': config.get('password') or None,
        'use_tls': bool(config.get('use_tls')),
        'use_ssl': bool(config.get('use_ssl')),
        'timeout': int(config.get('timeout') or 20),
    }
    return kwargs


def email_connection_for_message(message):
    config = smtp_config_for_organization(message.organization)
    kwargs = smtp_connection_kwargs(config)
    if not kwargs:
        return None, getattr(settings, 'DEFAULT_FROM_EMAIL', 'no-reply@hanmak.local')
    from_email = config.get('from_email') or getattr(settings, 'DEFAULT_FROM_EMAIL', 'no-reply@hanmak.local')
    return get_connection(**kwargs), from_email


def deliver_email_message(message):
    connection, from_email = email_connection_for_message(message)
    email = EmailMultiAlternatives(
        message.subject,
        message.body,
        from_email,
        [message.to_email],
        connection=connection,
    )
    if message.html_body:
        email.attach_alternative(message.html_body, 'text/html')
    email.send(fail_silently=False)
    message.status = EmailMessage.Status.SENT
    message.sent_at = timezone.now()
    message.error_message = ''
    message.save(update_fields=['status', 'sent_at', 'error_message'])
    return message


def send_smtp_test_email(organization, to_email):
    message = EmailMessage(
        organization=organization,
        kind=EmailMessage.Kind.REMINDER,
        to_email=to_email,
        subject='HanMak SMTP test email',
        body='This is a HanMak SMTP test email. If you received it, your custom SMTP settings are working.',
        html_body=(
            '<div style="font-family:Arial,sans-serif">'
            '<h2>HanMak SMTP test email</h2>'
            '<p>If you received this, your custom SMTP settings are working.</p>'
            '</div>'
        ),
    )
    connection, from_email = email_connection_for_message(message)
    email = EmailMultiAlternatives(
        message.subject,
        message.body,
        from_email,
        [to_email],
        connection=connection,
    )
    email.attach_alternative(message.html_body, 'text/html')
    return email.send(fail_silently=False)
