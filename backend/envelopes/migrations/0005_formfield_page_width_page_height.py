from django.db import migrations, models


def backfill_formfield_page_basis(apps, schema_editor):
    FormField = apps.get_model('envelopes', 'FormField')

    def field_schema_map(version):
        schema = getattr(version, 'field_schema', None) or {}
        fields = schema.get('fields') if isinstance(schema, dict) else []
        mapped = {}
        for field in fields or []:
            if not isinstance(field, dict):
                continue
            key = field.get('field_key') or field.get('label')
            if key:
                mapped[str(key)] = field
        return mapped

    for field in FormField.objects.select_related('template_version', 'envelope__template_version', 'document_page').all().iterator():
        page_width = getattr(field, 'page_width', None) or 1040
        page_height = getattr(field, 'page_height', None) or 1471
        version = getattr(field, 'template_version', None) or getattr(getattr(field, 'envelope', None), 'template_version', None)
        schema_field = None
        if version:
            schema_fields = field_schema_map(version)
            schema_field = schema_fields.get(field.field_key) or schema_fields.get(field.label)
        if isinstance(schema_field, dict):
            page_width = schema_field.get('page_width') or page_width
            page_height = schema_field.get('page_height') or page_height
        elif field.document_page_id:
            page_width = getattr(field.document_page, 'width', None) or page_width
            page_height = getattr(field.document_page, 'height', None) or page_height
        FormField.objects.filter(id=field.id).update(
            page_width=round(float(page_width or 1040)),
            page_height=round(float(page_height or 1471)),
        )


class Migration(migrations.Migration):

    dependencies = [
        ('envelopes', '0004_alter_formfield_field_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='formfield',
            name='page_height',
            field=models.PositiveIntegerField(default=1471),
        ),
        migrations.AddField(
            model_name='formfield',
            name='page_width',
            field=models.PositiveIntegerField(default=1040),
        ),
        migrations.RunPython(backfill_formfield_page_basis, migrations.RunPython.noop),
    ]
