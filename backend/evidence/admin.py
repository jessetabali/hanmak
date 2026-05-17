from django.contrib import admin

from .models import EvidenceBundle


@admin.register(EvidenceBundle)
class EvidenceBundleAdmin(admin.ModelAdmin):
    list_display = ['envelope', 'status', 'sha256', 'generated_by', 'created_at', 'generated_at']
    list_filter = ['status']
    search_fields = ['envelope__name', 'sha256', 'error_message']

# Register your models here.
