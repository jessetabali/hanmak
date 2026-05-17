from auditlog.models import AuditEvent
from documents.models import Document
from envelopes.models import Envelope, Template

from .models import SearchIndex


def upsert_search_entry(organization, object_type, object_id, title, body='', keywords=None, weight=1):
    return SearchIndex.objects.update_or_create(
        organization=organization,
        object_type=object_type,
        object_id=object_id,
        defaults={
            'title': title or '',
            'body': body or '',
            'keywords': keywords or [],
            'weight': weight,
        },
    )[0]


def rebuild_search_index_for_organization(organization):
    SearchIndex.objects.filter(organization=organization).delete()
    count = 0
    for envelope in Envelope.objects.filter(organization=organization):
        upsert_search_entry(organization, 'envelope', envelope.id, envelope.name, envelope.message, [envelope.status], 5)
        count += 1
    for template in Template.objects.filter(organization=organization):
        upsert_search_entry(organization, 'template', template.id, template.name, template.description, [template.category, template.status], 4)
        count += 1
    for document in Document.objects.filter(organization=organization):
        upsert_search_entry(organization, 'document', document.id, document.title, document.processing_error, [document.status], 3)
        count += 1
    for event in AuditEvent.objects.filter(organization=organization):
        upsert_search_entry(organization, 'audit_event', event.id, event.message, str(event.metadata or ''), [event.event_type, event.severity], 1)
        count += 1
    return count
