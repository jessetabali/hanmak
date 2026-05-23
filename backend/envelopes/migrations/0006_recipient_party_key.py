from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('envelopes', '0005_formfield_page_width_page_height'),
    ]

    operations = [
        migrations.AddField(
            model_name='recipient',
            name='party_key',
            field=models.SlugField(blank=True),
        ),
    ]
