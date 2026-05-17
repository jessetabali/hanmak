from django.contrib import admin

from .models import EmailMessage


@admin.register(EmailMessage)
class EmailMessageAdmin(admin.ModelAdmin):
    list_display = ['to_email', 'kind', 'status', 'organization', 'envelope', 'queued_at', 'sent_at']
    list_filter = ['kind', 'status', 'organization']
    search_fields = ['to_email', 'subject', 'body']
