from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('configcenter', '0002_emailsettings_generalsettings_securitysettings_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='generalsettings',
            name='application_name',
            field=models.CharField(default='HanMak', max_length=120),
        ),
        migrations.AddField(
            model_name='generalsettings',
            name='time_format',
            field=models.CharField(default='12h', max_length=16),
        ),
        migrations.AddField(
            model_name='securitysettings',
            name='require_admin_mfa',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='securitysettings',
            name='allow_sms_mfa',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='securitysettings',
            name='allow_totp_mfa',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='securitysettings',
            name='remember_device',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='securitysettings',
            name='max_concurrent_sessions',
            field=models.PositiveIntegerField(default=5),
        ),
        migrations.AddField(
            model_name='securitysettings',
            name='password_expiry_days',
            field=models.PositiveIntegerField(default=90),
        ),
        migrations.AddField(
            model_name='securitysettings',
            name='require_uppercase',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='securitysettings',
            name='require_number',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='securitysettings',
            name='require_special_char',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='securitysettings',
            name='prevent_password_reuse',
            field=models.BooleanField(default=True),
        ),
    ]
