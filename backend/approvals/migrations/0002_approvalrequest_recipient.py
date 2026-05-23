import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('approvals', '0001_initial'),
        ('envelopes', '0006_recipient_party_key'),
    ]

    operations = [
        migrations.AddField(
            model_name='approvalrequest',
            name='recipient',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='approval_requests',
                to='envelopes.recipient',
            ),
        ),
    ]
