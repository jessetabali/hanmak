from django.contrib import admin

from .models import Envelope, FormField, Recipient, Template, TemplateParty, TemplateVersion


class RecipientInline(admin.TabularInline):
    model = Recipient
    extra = 0


class FormFieldInline(admin.TabularInline):
    model = FormField
    extra = 0
    fields = ['field_type', 'label', 'recipient', 'required', 'page', 'x', 'y', 'width', 'height']


@admin.register(Template)
class TemplateAdmin(admin.ModelAdmin):
    list_display = ['name', 'organization', 'category', 'version', 'status', 'updated_at']
    list_filter = ['status', 'organization', 'category']
    search_fields = ['name', 'description']
    inlines = [FormFieldInline]


@admin.register(TemplateVersion)
class TemplateVersionAdmin(admin.ModelAdmin):
    list_display = ['template', 'version_number', 'is_published', 'created_by', 'created_at']
    list_filter = ['is_published']
    search_fields = ['template__name', 'changelog']


@admin.register(TemplateParty)
class TemplatePartyAdmin(admin.ModelAdmin):
    list_display = ['label', 'role_key', 'template_version', 'routing_order']
    search_fields = ['label', 'role_key', 'template_version__template__name']


@admin.register(Envelope)
class EnvelopeAdmin(admin.ModelAdmin):
    list_display = ['name', 'organization', 'status', 'sender', 'due_date', 'created_at']
    list_filter = ['status', 'organization']
    search_fields = ['name', 'sender__username', 'sender__email']
    inlines = [RecipientInline, FormFieldInline]


@admin.register(Recipient)
class RecipientAdmin(admin.ModelAdmin):
    list_display = ['name', 'email', 'envelope', 'role', 'status', 'routing_order', 'signed_at']
    list_filter = ['role', 'status']
    search_fields = ['name', 'email', 'envelope__name']


@admin.register(FormField)
class FormFieldAdmin(admin.ModelAdmin):
    list_display = ['label', 'field_type', 'template', 'envelope', 'recipient', 'page']
    list_filter = ['field_type', 'required']
    search_fields = ['label']

# Register your models here.
