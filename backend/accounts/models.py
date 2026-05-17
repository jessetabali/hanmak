from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db import models


class Organization(models.Model):
    parent = models.ForeignKey('self', related_name='subsidiaries', null=True, blank=True, on_delete=models.SET_NULL)
    name = models.CharField(max_length=255)
    legal_name = models.CharField(max_length=255, blank=True)
    slug = models.SlugField(unique=True)
    website = models.URLField(blank=True)
    primary_contact_email = models.EmailField(blank=True)
    logo = models.FileField(upload_to='organization-logos/', blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class OrganizationDomain(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        VERIFIED = 'verified', 'Verified'
        FAILED = 'failed', 'Failed'

    organization = models.ForeignKey(Organization, related_name='domains', on_delete=models.CASCADE)
    domain = models.CharField(max_length=255)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.PENDING)
    verification_token = models.CharField(max_length=128)
    verified_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('organization', 'domain')]

    def __str__(self):
        return f'{self.organization}: {self.domain}'


class Team(models.Model):
    organization = models.ForeignKey(Organization, related_name='teams', on_delete=models.CASCADE)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('organization', 'name')]

    def __str__(self):
        return f'{self.organization}: {self.name}'


class Membership(models.Model):
    class Role(models.TextChoices):
        SUPER_ADMIN = 'super_admin', 'Super Admin'
        ADMIN = 'admin', 'Admin'
        MANAGER = 'manager', 'Manager'
        SIGNER = 'signer', 'Signer'
        VIEWER = 'viewer', 'Viewer'

    user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='memberships', on_delete=models.CASCADE)
    organization = models.ForeignKey(Organization, related_name='memberships', on_delete=models.CASCADE)
    team = models.ForeignKey(Team, related_name='memberships', null=True, blank=True, on_delete=models.SET_NULL)
    role = models.CharField(max_length=32, choices=Role.choices, default=Role.SIGNER)
    custom_role = models.ForeignKey('Role', related_name='memberships', null=True, blank=True, on_delete=models.SET_NULL)
    is_active = models.BooleanField(default=True)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('user', 'organization')]

    def __str__(self):
        return f'{self.user} in {self.organization} ({self.role})'


class Role(models.Model):
    organization = models.ForeignKey(Organization, related_name='roles', null=True, blank=True, on_delete=models.CASCADE)
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    is_system = models.BooleanField(default=False)
    permissions = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('organization', 'name')]

    def __str__(self):
        return self.name


class Invitation(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        ACCEPTED = 'accepted', 'Accepted'
        EXPIRED = 'expired', 'Expired'
        REVOKED = 'revoked', 'Revoked'

    organization = models.ForeignKey(Organization, related_name='invitations', on_delete=models.CASCADE)
    email = models.EmailField()
    full_name = models.CharField(max_length=255, blank=True)
    role = models.CharField(max_length=32, choices=Membership.Role.choices, default=Membership.Role.SIGNER)
    custom_role = models.ForeignKey(Role, related_name='invitations', null=True, blank=True, on_delete=models.SET_NULL)
    team = models.ForeignKey(Team, related_name='invitations', null=True, blank=True, on_delete=models.SET_NULL)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.PENDING)
    message = models.TextField(blank=True)
    invited_by = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='sent_invitations', null=True, blank=True, on_delete=models.SET_NULL)
    accepted_by = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='accepted_invitations', null=True, blank=True, on_delete=models.SET_NULL)
    token_hash = models.CharField(max_length=128, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('organization', 'email', 'status')]

    def __str__(self):
        return f'{self.email} invited to {self.organization}'


class UserProfile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, related_name='hanmak_profile', on_delete=models.CASCADE)
    display_name = models.CharField(max_length=255, blank=True)
    title = models.CharField(max_length=255, blank=True)
    phone = models.CharField(max_length=64, blank=True)
    timezone = models.CharField(max_length=64, default='UTC')
    locale = models.CharField(max_length=32, default='en-US')
    signature_name = models.CharField(max_length=255, blank=True)
    auth_version = models.PositiveIntegerField(default=0)
    failed_login_count = models.PositiveIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)
    last_failed_login_at = models.DateTimeField(null=True, blank=True)
    preferences = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.display_name or str(self.user)


class MFADevice(models.Model):
    class Method(models.TextChoices):
        TOTP = 'totp', 'TOTP'
        WEBAUTHN = 'webauthn', 'Passkey'
        SMS = 'sms', 'SMS'
        EMAIL = 'email', 'Email'

    user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='mfa_devices', on_delete=models.CASCADE)
    name = models.CharField(max_length=255)
    method = models.CharField(max_length=32, choices=Method.choices)
    is_confirmed = models.BooleanField(default=False)
    credential_id = models.TextField(blank=True)
    public_key = models.TextField(blank=True)
    sign_count = models.PositiveIntegerField(default=0)
    metadata = models.JSONField(default=dict, blank=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.user}: {self.name}'


class NotificationPreference(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='notification_preferences', on_delete=models.CASCADE)
    event_type = models.CharField(max_length=120)
    email_enabled = models.BooleanField(default=True)
    in_app_enabled = models.BooleanField(default=True)
    digest_enabled = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [('user', 'event_type')]

    def __str__(self):
        return f'{self.user}: {self.event_type}'


class UserSession(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='hanmak_sessions', on_delete=models.CASCADE)
    session_key = models.CharField(max_length=255, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    sso_provider = models.CharField(max_length=120, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.user} session {self.id}'


class ImpersonationRequest(models.Model):
    class Status(models.TextChoices):
        REQUESTED = 'requested', 'Requested'
        APPROVED = 'approved', 'Approved'
        ACTIVE = 'active', 'Active'
        ENDED = 'ended', 'Ended'
        DENIED = 'denied', 'Denied'
        EXPIRED = 'expired', 'Expired'

    organization = models.ForeignKey(Organization, related_name='impersonation_requests', on_delete=models.CASCADE)
    requester = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='requested_impersonations', on_delete=models.CASCADE)
    target_user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='targeted_impersonations', on_delete=models.CASCADE)
    reason = models.TextField()
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.REQUESTED)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='approved_impersonations', null=True, blank=True, on_delete=models.SET_NULL)
    approved_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class ObjectPermission(models.Model):
    class Scope(models.TextChoices):
        VIEW = 'view', 'View'
        COMMENT = 'comment', 'Comment'
        EDIT = 'edit', 'Edit'
        SEND = 'send', 'Send'
        OWNER = 'owner', 'Owner'

    organization = models.ForeignKey(Organization, related_name='object_permissions', on_delete=models.CASCADE)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='hanmak_object_permissions', null=True, blank=True, on_delete=models.CASCADE)
    team = models.ForeignKey(Team, related_name='object_permissions', null=True, blank=True, on_delete=models.CASCADE)
    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.PositiveBigIntegerField()
    content_object = GenericForeignKey('content_type', 'object_id')
    scope = models.CharField(max_length=32, choices=Scope.choices)
    granted_by = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='granted_hanmak_object_permissions', null=True, blank=True, on_delete=models.SET_NULL)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('user', 'team', 'content_type', 'object_id', 'scope')]

    def __str__(self):
        target = self.user or self.team
        return f'{target} can {self.scope} {self.content_type}:{self.object_id}'


class AccountRecoveryRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        USED = 'used', 'Used'
        EXPIRED = 'expired', 'Expired'
        REVOKED = 'revoked', 'Revoked'

    user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='hanmak_recovery_requests', on_delete=models.CASCADE)
    token_hash = models.CharField(max_length=128, unique=True)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.PENDING)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class RecoveryCode(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='hanmak_recovery_codes', on_delete=models.CASCADE)
    code_hash = models.CharField(max_length=128)
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class PasskeyChallenge(models.Model):
    class Purpose(models.TextChoices):
        REGISTRATION = 'registration', 'Registration'
        AUTHENTICATION = 'authentication', 'Authentication'

    user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='hanmak_passkey_challenges', on_delete=models.CASCADE)
    challenge = models.CharField(max_length=255, unique=True)
    purpose = models.CharField(max_length=32, choices=Purpose.choices)
    metadata = models.JSONField(default=dict, blank=True)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
