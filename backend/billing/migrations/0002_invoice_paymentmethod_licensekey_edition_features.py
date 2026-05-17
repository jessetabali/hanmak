from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0001_initial'),
        ('billing', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='licensekey',
            name='edition',
            field=models.CharField(default='Community', max_length=80),
        ),
        migrations.AddField(
            model_name='licensekey',
            name='features',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.CreateModel(
            name='Invoice',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('invoice_number', models.CharField(max_length=64, unique=True)),
                ('amount', models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ('currency', models.CharField(default='USD', max_length=8)),
                ('status', models.CharField(
                    choices=[('paid', 'Paid'), ('open', 'Open'), ('void', 'Void'), ('uncollectible', 'Uncollectible')],
                    default='open',
                    max_length=32,
                )),
                ('period_start', models.DateField()),
                ('period_end', models.DateField()),
                ('pdf_url', models.URLField(blank=True)),
                ('due_date', models.DateField(blank=True, null=True)),
                ('paid_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('organization', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='invoices',
                    to='accounts.organization',
                )),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='PaymentMethod',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('method_type', models.CharField(
                    choices=[('card', 'Card'), ('bank_transfer', 'Bank Transfer'), ('invoice', 'Invoice')],
                    default='card',
                    max_length=32,
                )),
                ('brand', models.CharField(blank=True, max_length=32)),
                ('last4', models.CharField(blank=True, max_length=4)),
                ('exp_month', models.PositiveSmallIntegerField(blank=True, null=True)),
                ('exp_year', models.PositiveSmallIntegerField(blank=True, null=True)),
                ('holder_name', models.CharField(blank=True, max_length=255)),
                ('is_default', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('organization', models.OneToOneField(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='payment_method',
                    to='accounts.organization',
                )),
            ],
        ),
    ]
