from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('configcenter', '0003_generalsettings_application_name_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='Incident',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=255)),
                ('severity', models.CharField(
                    choices=[('minor', 'Minor'), ('major', 'Major'), ('critical', 'Critical')],
                    default='minor',
                    max_length=32,
                )),
                ('status', models.CharField(
                    choices=[
                        ('investigating', 'Investigating'),
                        ('identified', 'Identified'),
                        ('monitoring', 'Monitoring'),
                        ('resolved', 'Resolved'),
                    ],
                    default='investigating',
                    max_length=32,
                )),
                ('affected_services', models.JSONField(blank=True, default=list)),
                ('description', models.TextField(blank=True)),
                ('started_at', models.DateTimeField()),
                ('resolved_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['-started_at'],
            },
        ),
    ]
