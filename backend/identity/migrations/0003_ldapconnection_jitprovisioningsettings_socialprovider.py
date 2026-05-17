from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0001_initial'),
        ('identity', '0002_ssostate'),
    ]

    operations = [
        migrations.CreateModel(
            name='LDAPConnection',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('host', models.CharField(max_length=255)),
                ('port', models.PositiveIntegerField(default=389)),
                ('use_ssl', models.BooleanField(default=False)),
                ('use_tls', models.BooleanField(default=True)),
                ('bind_dn', models.CharField(blank=True, max_length=255)),
                ('bind_password', models.CharField(blank=True, max_length=255)),
                ('base_dn', models.CharField(blank=True, max_length=255)),
                ('user_filter', models.CharField(default='(objectClass=person)', max_length=255)),
                ('username_attribute', models.CharField(default='sAMAccountName', max_length=64)),
                ('email_attribute', models.CharField(default='mail', max_length=64)),
                ('is_enabled', models.BooleanField(default=False)),
                ('config', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('organization', models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='ldap_connection',
                    to='accounts.organization',
                )),
            ],
        ),
        migrations.CreateModel(
            name='JITProvisioningSettings',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('is_enabled', models.BooleanField(default=False)),
                ('auto_create_user', models.BooleanField(default=True)),
                ('update_on_login', models.BooleanField(default=True)),
                ('default_role', models.CharField(default='signer', max_length=32)),
                ('allowed_domains', models.JSONField(blank=True, default=list)),
                ('require_domain_match', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('organization', models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='jit_settings',
                    to='accounts.organization',
                )),
            ],
        ),
        migrations.CreateModel(
            name='SocialProvider',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('provider_type', models.CharField(
                    choices=[
                        ('google', 'Google'),
                        ('microsoft', 'Microsoft'),
                        ('github', 'GitHub'),
                        ('linkedin', 'LinkedIn'),
                        ('apple', 'Apple'),
                    ],
                    max_length=32,
                )),
                ('client_id', models.CharField(blank=True, max_length=255)),
                ('client_secret', models.CharField(blank=True, max_length=255)),
                ('is_enabled', models.BooleanField(default=False)),
                ('allowed_domains', models.JSONField(blank=True, default=list)),
                ('config', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('organization', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='social_providers',
                    to='accounts.organization',
                )),
            ],
        ),
        migrations.AlterUniqueTogether(
            name='socialprovider',
            unique_together={('organization', 'provider_type')},
        ),
    ]
