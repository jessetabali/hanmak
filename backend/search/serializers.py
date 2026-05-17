from rest_framework import serializers

from .models import SearchIndex


class SearchIndexSerializer(serializers.ModelSerializer):
    class Meta:
        model = SearchIndex
        fields = [
            'id', 'organization', 'object_type', 'object_id', 'title',
            'body', 'keywords', 'weight', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
