from django.db import transaction
from django.utils import timezone

from documents.models import EnvelopeDocument

from .models import Envelope, FormField, Recipient, Template, TemplateParty, TemplateVersion


DEFAULT_STARTER_FIELDS = [
    {'field_key': 'signer-name', 'field_type': FormField.FieldType.TEXT, 'label': 'Signer Name', 'required': True, 'party_key': 'party-2', 'page': 1, 'x': 133, 'y': 341, 'width': 309, 'height': 52, 'page_width': 1040, 'page_height': 1471, 'coordinate_basis': 'page-pixels'},
    {'field_key': 'signature', 'field_type': FormField.FieldType.SIGNATURE, 'label': 'Signature', 'required': True, 'party_key': 'party-2', 'page': 1, 'x': 133, 'y': 1040, 'width': 374, 'height': 104, 'page_width': 1040, 'page_height': 1471, 'coordinate_basis': 'page-pixels'},
]

SIGNER_PAGE_WIDTH = 1040


def template_field_party_key(field):
    return field.get('party_key') or 'party-1'


def _field_number(field, key, fallback=0):
    try:
        return float(field.get(key, fallback) or fallback)
    except (TypeError, ValueError):
        return float(fallback or 0)


def normalize_field_geometry(field, target_width=SIGNER_PAGE_WIDTH):
    """Keep builder, template, envelope, and public signing overlays on one basis."""
    normalized = dict(field or {})
    target_width = float(target_width or SIGNER_PAGE_WIDTH)
    page_width = _field_number(normalized, 'page_width', normalized.get('document_width') or target_width) or target_width
    page_height = _field_number(normalized, 'page_height', 0)
    target_height = page_height * (target_width / page_width) if page_width and page_height else 0

    if normalized.get('x_pct') is not None or normalized.get('width_pct') is not None:
        normalized['x'] = round(_field_number(normalized, 'x_pct') * target_width)
        normalized['width'] = max(40, round(_field_number(normalized, 'width_pct', 0.25) * target_width))
        if target_height:
            normalized['y'] = round(_field_number(normalized, 'y_pct') * target_height)
            normalized['height'] = max(18, round(_field_number(normalized, 'height_pct', 0.04) * target_height))
        else:
            normalized['y'] = round(_field_number(normalized, 'y'))
            normalized['height'] = max(18, round(_field_number(normalized, 'height', 32)))
    elif page_width and page_width != target_width:
        scale = target_width / page_width
        normalized['x'] = round(_field_number(normalized, 'x') * scale)
        normalized['y'] = round(_field_number(normalized, 'y') * scale)
        normalized['width'] = max(40, round(_field_number(normalized, 'width', 160) * scale))
        normalized['height'] = max(18, round(_field_number(normalized, 'height', 32) * scale))
    else:
        normalized['x'] = round(_field_number(normalized, 'x'))
        normalized['y'] = round(_field_number(normalized, 'y'))
        normalized['width'] = max(40, round(_field_number(normalized, 'width', 160)))
        normalized['height'] = max(18, round(_field_number(normalized, 'height', 32)))

    normalized['page'] = max(1, round(_field_number(normalized, 'page', 1)))
    normalized['page_width'] = round(target_width)
    if target_height:
        normalized['page_height'] = round(target_height)
    normalized['coordinate_basis'] = 'page-pixels'
    return normalized


@transaction.atomic
def setup_template_version(template, document, fields=None, parties_data=None, created_by=None, changelog='Backend setup'):
    fields = [normalize_field_geometry(field) for field in (fields or DEFAULT_STARTER_FIELDS)]
    next_version = (template.versions.order_by('-version_number').values_list('version_number', flat=True).first() or 0) + 1
    template.status = Template.Status.ACTIVE
    template.version = next_version
    template.save(update_fields=['status', 'version', 'updated_at'])
    version = TemplateVersion.objects.create(
        template=template,
        version_number=next_version,
        document=document,
        field_schema={
            'source': 'backend-service',
            'page_count': document.page_count or 1,
            'document_id': document.id,
            'fields': fields,
        },
        workflow_schema={'stages': [{'key': 'signer', 'type': 'signing', 'order': 1}]},
        changelog=changelog,
        is_published=True,
        created_by=created_by,
    )
    party_label_map = {p['role_key']: p.get('label', p['role_key'].replace('-', ' ').title()) for p in (parties_data or [])}
    party_order_map = {p['role_key']: p.get('routing_order', i + 1) for i, p in enumerate(parties_data or [])}
    parties = {}
    for party_key in sorted({template_field_party_key(field) for field in fields}):
        label = party_label_map.get(party_key, party_key.replace('-', ' ').title())
        order = party_order_map.get(party_key, int(party_key.split('-')[-1]) if party_key.split('-')[-1].isdigit() else 1)
        parties[party_key] = TemplateParty.objects.create(
            template_version=version,
            role_key=party_key,
            label=label,
            routing_order=order,
        )
    for field in fields:
        FormField.objects.create(
            template=template,
            template_version=version,
            party=parties.get(template_field_party_key(field)),
            field_key=field.get('field_key', ''),
            field_type=field.get('field_type') or FormField.FieldType.TEXT,
            label=field.get('label') or 'Field',
            required=field.get('required', True),
            page=field.get('page') or 1,
            x=field.get('x') or 0,
            y=field.get('y') or 0,
            width=field.get('width') or 160,
            height=field.get('height') or 32,
            page_width=field.get('page_width') or SIGNER_PAGE_WIDTH,
            page_height=field.get('page_height') or 1471,
            options=field.get('options') or [],
        )
    return version


def version_fields(version):
    fields = version.field_schema.get('fields') if isinstance(version.field_schema, dict) else []
    if fields:
        return [normalize_field_geometry(field) for field in fields]
    return [
        {
            'field_key': field.field_key,
            'field_type': field.field_type,
            'label': field.label,
            'required': field.required,
            'party_key': field.party.role_key if field.party else 'party-1',
            'page': field.page,
            'x': field.x,
            'y': field.y,
            'width': field.width,
            'height': field.height,
            'page_width': field.page_width,
            'page_height': field.page_height,
            'options': field.options,
        }
        for field in version.fields.select_related('party').all()
    ]


@transaction.atomic
def create_envelope_from_template(*, organization, template_version, sender, name, message='', due_date=None, recipients=None, send_status=False):
    recipients = recipients or []
    party_map = {recipient.get('party_key'): recipient for recipient in recipients if recipient.get('party_key')}
    party_keys = [recipient.get('party_key') for recipient in recipients if recipient.get('party_key')]
    duplicates = sorted({party_key for party_key in party_keys if party_keys.count(party_key) > 1})
    if duplicates:
        raise ValueError(f'Only one recipient can own {", ".join(duplicates)}')
    required_parties = {template_field_party_key(field) for field in version_fields(template_version)}
    missing = sorted(required_parties - set(party_map))
    if missing:
        raise ValueError(f'Missing recipient assignment for {", ".join(missing)}')
    envelope = Envelope.objects.create(
        organization=organization,
        template=template_version.template,
        template_version=template_version,
        sender=sender,
        name=name,
        message=message,
        due_date=due_date,
        status=Envelope.Status.SENT if send_status else Envelope.Status.DRAFT,
        sent_at=timezone.now() if send_status else None,
    )
    recipient_instances = {}
    for index, recipient in enumerate(recipients, start=1):
        instance = Recipient.objects.create(
            envelope=envelope,
            name=recipient['name'],
            email=recipient['email'],
            role=recipient.get('role') or Recipient.Role.SIGNER,
            routing_order=recipient.get('routing_order') or index,
        )
        if recipient.get('party_key'):
            recipient_instances[recipient['party_key']] = instance
    if template_version.document:
        EnvelopeDocument.objects.create(envelope=envelope, document=template_version.document, order=1)
        pages_by_number = {
            page.page_number: page
            for page in template_version.document.pages.all()
        }
    else:
        pages_by_number = {}
    for field in version_fields(template_version):
        field = normalize_field_geometry(field)
        recipient = recipient_instances.get(template_field_party_key(field))
        document_page = pages_by_number.get(field.get('page') or 1)
        FormField.objects.create(
            envelope=envelope,
            recipient=recipient,
            document_page=document_page,
            template_version=template_version,
            field_key=field.get('field_key', ''),
            field_type=field.get('field_type') or FormField.FieldType.TEXT,
            label=field.get('label') or 'Field',
            required=field.get('required', True),
            page=field.get('page') or 1,
            x=field.get('x') or 0,
            y=field.get('y') or 0,
            width=field.get('width') or 160,
            height=field.get('height') or 32,
            page_width=field.get('page_width') or SIGNER_PAGE_WIDTH,
            page_height=field.get('page_height') or 1471,
            options=field.get('options') or [],
        )
    return envelope
