from rest_framework import serializers

from .models import EvidenceBundle


class EvidenceBundleSerializer(serializers.ModelSerializer):
    class Meta:
        model = EvidenceBundle
        fields = [
            'id', 'envelope', 'status', 'file', 'sha256', 'signed_pdf',
            'signed_pdf_sha256', 'generated_by', 'error_message',
            'created_at', 'generated_at',
        ]
        read_only_fields = ['id', 'created_at', 'generated_at']
