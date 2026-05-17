from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0012_impersonationrequest_ended_at_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='membership',
            name='role',
            field=models.CharField(
                choices=[
                    ('super_admin', 'Super Admin'),
                    ('admin', 'Admin'),
                    ('manager', 'Manager'),
                    ('signer', 'Signer'),
                    ('viewer', 'Viewer'),
                ],
                default='signer',
                max_length=32,
            ),
        ),
        migrations.AlterField(
            model_name='invitation',
            name='role',
            field=models.CharField(
                choices=[
                    ('super_admin', 'Super Admin'),
                    ('admin', 'Admin'),
                    ('manager', 'Manager'),
                    ('signer', 'Signer'),
                    ('viewer', 'Viewer'),
                ],
                default='signer',
                max_length=32,
            ),
        ),
    ]
