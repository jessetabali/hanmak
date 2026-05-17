from django.db import models

from accounts.models import Organization


class SearchIndex(models.Model):
    organization = models.ForeignKey(Organization, related_name='search_index_entries', on_delete=models.CASCADE)
    object_type = models.CharField(max_length=80)
    object_id = models.PositiveBigIntegerField()
    title = models.CharField(max_length=255)
    body = models.TextField(blank=True)
    keywords = models.JSONField(default=list, blank=True)
    weight = models.PositiveIntegerField(default=1)
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('organization', 'object_type', 'object_id')]
        indexes = [
            models.Index(fields=['organization', 'object_type']),
            models.Index(fields=['title']),
        ]

    def __str__(self):
        return f'{self.object_type}:{self.object_id} {self.title}'
