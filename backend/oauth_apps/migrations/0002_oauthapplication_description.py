from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('oauth_apps', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='oauthapplication',
            name='description',
            field=models.TextField(blank=True),
        ),
    ]
