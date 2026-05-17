from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from auditlog.models import AuditEvent
from documents.models import Document
from envelopes.models import Envelope, Template

from .models import SearchIndex
from .services import upsert_search_entry


@receiver(post_save, sender=Envelope)
def index_envelope(sender, instance, **kwargs):
    upsert_search_entry(instance.organization, 'envelope', instance.id, instance.name, instance.message, [instance.status], 5)


@receiver(post_save, sender=Template)
def index_template(sender, instance, **kwargs):
    upsert_search_entry(instance.organization, 'template', instance.id, instance.name, instance.description, [instance.category, instance.status], 4)


@receiver(post_save, sender=Document)
def index_document(sender, instance, **kwargs):
    upsert_search_entry(instance.organization, 'document', instance.id, instance.title, instance.processing_error, [instance.status], 3)


@receiver(post_save, sender=AuditEvent)
def index_audit_event(sender, instance, **kwargs):
    upsert_search_entry(instance.organization, 'audit_event', instance.id, instance.message, str(instance.metadata or ''), [instance.event_type, instance.severity], 1)


@receiver(post_delete, sender=Envelope)
@receiver(post_delete, sender=Template)
@receiver(post_delete, sender=Document)
@receiver(post_delete, sender=AuditEvent)
def remove_search_entry(sender, instance, **kwargs):
    object_type = {
        Envelope: 'envelope',
        Template: 'template',
        Document: 'document',
        AuditEvent: 'audit_event',
    }[sender]
    SearchIndex.objects.filter(
        organization=instance.organization,
        object_type=object_type,
        object_id=instance.id,
    ).delete()
