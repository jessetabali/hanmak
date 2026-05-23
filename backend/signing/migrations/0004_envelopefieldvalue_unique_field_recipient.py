from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('signing', '0003_signingsession_declined_status'),
    ]

    operations = [
        migrations.AlterUniqueTogether(
            name='envelopefieldvalue',
            unique_together={('envelope', 'field', 'recipient')},
        ),
    ]
