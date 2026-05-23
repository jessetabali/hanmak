from django.conf import settings
from django.db import models

from accounts.models import Organization


class Template(models.Model):
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        ACTIVE = 'active', 'Active'
        ARCHIVED = 'archived', 'Archived'

    organization = models.ForeignKey(Organization, related_name='templates', on_delete=models.CASCADE)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    category = models.CharField(max_length=100, blank=True)
    version = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.DRAFT)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class TemplateVersion(models.Model):
    template = models.ForeignKey(Template, related_name='versions', on_delete=models.CASCADE)
    version_number = models.PositiveIntegerField()
    document = models.ForeignKey('documents.Document', related_name='template_versions', null=True, blank=True, on_delete=models.SET_NULL)
    field_schema = models.JSONField(default=dict, blank=True)
    workflow_schema = models.JSONField(default=dict, blank=True)
    changelog = models.TextField(blank=True)
    is_published = models.BooleanField(default=False)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-version_number']
        unique_together = [('template', 'version_number')]

    def __str__(self):
        return f'{self.template} v{self.version_number}'


class TemplateParty(models.Model):
    template_version = models.ForeignKey(TemplateVersion, related_name='parties', on_delete=models.CASCADE)
    role_key = models.SlugField()
    label = models.CharField(max_length=255)
    routing_order = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ['routing_order']
        unique_together = [('template_version', 'role_key')]

    def __str__(self):
        return f'{self.template_version}: {self.label}'


class Envelope(models.Model):
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        SENT = 'sent', 'Sent'
        VIEWED = 'viewed', 'Viewed'
        PARTIALLY_SIGNED = 'partially_signed', 'Partially Signed'
        COMPLETED = 'completed', 'Completed'
        DECLINED = 'declined', 'Declined'
        VOIDED = 'voided', 'Voided'
        EXPIRED = 'expired', 'Expired'

    organization = models.ForeignKey(Organization, related_name='envelopes', on_delete=models.CASCADE)
    template = models.ForeignKey(Template, related_name='envelopes', null=True, blank=True, on_delete=models.SET_NULL)
    template_version = models.ForeignKey(TemplateVersion, related_name='envelopes', null=True, blank=True, on_delete=models.SET_NULL)
    name = models.CharField(max_length=255)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.DRAFT)
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='sent_envelopes', on_delete=models.PROTECT)
    message = models.TextField(blank=True)
    due_date = models.DateField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    void_reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class Recipient(models.Model):
    class Role(models.TextChoices):
        SIGNER = 'signer', 'Signer'
        APPROVER = 'approver', 'Approver'
        CC = 'cc', 'CC'

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        SENT = 'sent', 'Sent'
        VIEWED = 'viewed', 'Viewed'
        SIGNED = 'signed', 'Signed'
        DECLINED = 'declined', 'Declined'
        DELEGATED = 'delegated', 'Delegated'

    envelope = models.ForeignKey(Envelope, related_name='recipients', on_delete=models.CASCADE)
    delegated_from = models.ForeignKey('self', related_name='delegates', null=True, blank=True, on_delete=models.SET_NULL)
    name = models.CharField(max_length=255)
    email = models.EmailField()
    role = models.CharField(max_length=32, choices=Role.choices, default=Role.SIGNER)
    party_key = models.SlugField(blank=True)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.PENDING)
    routing_order = models.PositiveIntegerField(default=1)
    signed_at = models.DateTimeField(null=True, blank=True)
    delegated_at = models.DateTimeField(null=True, blank=True)
    delegation_reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['routing_order', 'created_at']

    def __str__(self):
        return f'{self.name} <{self.email}>'


class FormField(models.Model):
    class FieldType(models.TextChoices):
        TEXT = 'text', 'Text'
        TEXTAREA = 'textarea', 'Textarea'
        NUMBER = 'number', 'Number'
        EMAIL = 'email', 'Email'
        DATE = 'date', 'Date'
        SELECT = 'select', 'Select'
        CHECKBOX = 'checkbox', 'Checkbox'
        SIGNATURE = 'signature', 'Signature'
        INITIALS = 'initials', 'Initials'
        ATTACHMENT = 'attachment', 'Attachment'

    template = models.ForeignKey(Template, related_name='fields', null=True, blank=True, on_delete=models.CASCADE)
    template_version = models.ForeignKey(TemplateVersion, related_name='fields', null=True, blank=True, on_delete=models.CASCADE)
    party = models.ForeignKey(TemplateParty, related_name='fields', null=True, blank=True, on_delete=models.SET_NULL)
    envelope = models.ForeignKey(Envelope, related_name='fields', null=True, blank=True, on_delete=models.CASCADE)
    recipient = models.ForeignKey(Recipient, related_name='fields', null=True, blank=True, on_delete=models.SET_NULL)
    document_page = models.ForeignKey('documents.DocumentPage', related_name='fields', null=True, blank=True, on_delete=models.SET_NULL)
    field_key = models.SlugField(blank=True)
    field_type = models.CharField(max_length=32, choices=FieldType.choices)
    label = models.CharField(max_length=255)
    required = models.BooleanField(default=True)
    page = models.PositiveIntegerField(default=1)
    x = models.PositiveIntegerField(default=0)
    y = models.PositiveIntegerField(default=0)
    width = models.PositiveIntegerField(default=160)
    height = models.PositiveIntegerField(default=32)
    page_width = models.PositiveIntegerField(default=1040)
    page_height = models.PositiveIntegerField(default=1471)
    value = models.TextField(blank=True)
    options = models.JSONField(default=list, blank=True)

    def __str__(self):
        return f'{self.label} ({self.field_type})'

# Create your models here.
