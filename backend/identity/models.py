from django.db import models
from django.conf import settings

from accounts.models import Organization


class SSOConnection(models.Model):
    class ProviderType(models.TextChoices):
        SAML = 'saml', 'SAML'
        OIDC = 'oidc', 'OIDC'
        LDAP = 'ldap', 'LDAP'

    organization = models.ForeignKey(Organization, related_name='sso_connections', on_delete=models.CASCADE)
    name = models.CharField(max_length=255)
    provider_type = models.CharField(max_length=32, choices=ProviderType.choices)
    is_enabled = models.BooleanField(default=False)
    config = models.JSONField(default=dict, blank=True)
    metadata_url = models.URLField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class SSOState(models.Model):
    connection = models.ForeignKey(SSOConnection, related_name='states', on_delete=models.CASCADE)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    state = models.CharField(max_length=255, unique=True)
    nonce = models.CharField(max_length=255, blank=True)
    redirect_uri = models.URLField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)


class SCIMConnection(models.Model):
    organization = models.OneToOneField(Organization, related_name='scim_connection', on_delete=models.CASCADE)
    base_url = models.URLField(blank=True)
    token_prefix = models.CharField(max_length=24, blank=True)
    token_hash = models.CharField(max_length=128, blank=True)
    is_enabled = models.BooleanField(default=False)
    config = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'SCIM for {self.organization}'


class SCIMExternalIdentity(models.Model):
    organization = models.ForeignKey(Organization, related_name='scim_external_identities', on_delete=models.CASCADE)
    provider = models.CharField(max_length=80, default='scim')
    external_id = models.CharField(max_length=255)
    user_email = models.EmailField()
    raw = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [('organization', 'provider', 'external_id')]


class LDAPConnection(models.Model):
    organization = models.OneToOneField(Organization, related_name='ldap_connection', on_delete=models.CASCADE)
    host = models.CharField(max_length=255)
    port = models.PositiveIntegerField(default=389)
    use_ssl = models.BooleanField(default=False)
    use_tls = models.BooleanField(default=True)
    bind_dn = models.CharField(max_length=255, blank=True)
    bind_password = models.CharField(max_length=255, blank=True)
    base_dn = models.CharField(max_length=255, blank=True)
    user_filter = models.CharField(max_length=255, default='(objectClass=person)')
    username_attribute = models.CharField(max_length=64, default='sAMAccountName')
    email_attribute = models.CharField(max_length=64, default='mail')
    is_enabled = models.BooleanField(default=False)
    config = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'LDAP for {self.organization} ({self.host})'


class JITProvisioningSettings(models.Model):
    organization = models.OneToOneField(Organization, related_name='jit_settings', on_delete=models.CASCADE)
    is_enabled = models.BooleanField(default=False)
    auto_create_user = models.BooleanField(default=True)
    update_on_login = models.BooleanField(default=True)
    default_role = models.CharField(max_length=32, default='signer')
    allowed_domains = models.JSONField(default=list, blank=True)
    require_domain_match = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'JIT for {self.organization}'


class SocialProvider(models.Model):
    class ProviderType(models.TextChoices):
        GOOGLE = 'google', 'Google'
        MICROSOFT = 'microsoft', 'Microsoft'
        GITHUB = 'github', 'GitHub'
        LINKEDIN = 'linkedin', 'LinkedIn'
        APPLE = 'apple', 'Apple'

    organization = models.ForeignKey(Organization, related_name='social_providers', on_delete=models.CASCADE)
    provider_type = models.CharField(max_length=32, choices=ProviderType.choices)
    client_id = models.CharField(max_length=255, blank=True)
    client_secret = models.CharField(max_length=255, blank=True)
    is_enabled = models.BooleanField(default=False)
    allowed_domains = models.JSONField(default=list, blank=True)
    config = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [('organization', 'provider_type')]

    def __str__(self):
        return f'{self.provider_type} for {self.organization}'
