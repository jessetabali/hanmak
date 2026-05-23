from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import (
    AccountRecoveryRequest,
    Invitation,
    ImpersonationRequest,
    MFADevice,
    Membership,
    NotificationPreference,
    ObjectPermission,
    Organization,
    OrganizationDomain,
    PasskeyChallenge,
    RecoveryCode,
    Role,
    Team,
    UserProfile,
    UserSession,
)


class UserSerializer(serializers.ModelSerializer):
    display_name = serializers.SerializerMethodField()
    memberships = serializers.SerializerMethodField()
    mfa_enabled = serializers.SerializerMethodField()
    sso_enabled = serializers.SerializerMethodField()

    class Meta:
        model = get_user_model()
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name', 'display_name',
            'is_active', 'date_joined', 'memberships', 'mfa_enabled', 'sso_enabled',
        ]
        read_only_fields = ['id', 'date_joined']

    def get_display_name(self, obj):
        try:
            profile_name = obj.hanmak_profile.display_name
        except UserProfile.DoesNotExist:
            profile_name = ''
        return obj.get_full_name() or profile_name or obj.username

    def get_memberships(self, obj):
        memberships = obj.memberships.select_related('organization', 'team', 'custom_role').filter(is_active=True)
        return [
            {
                'id': membership.id,
                'organization': membership.organization_id,
                'organization_name': membership.organization.name,
                'team': membership.team_id,
                'team_name': membership.team.name if membership.team else '',
                'role': membership.role,
                'custom_role': membership.custom_role_id,
                'custom_role_name': membership.custom_role.name if membership.custom_role else '',
                'joined_at': membership.joined_at,
            }
            for membership in memberships
        ]

    def get_mfa_enabled(self, obj):
        return obj.mfa_devices.filter(is_confirmed=True).exists()

    def get_sso_enabled(self, obj):
        return obj.hanmak_sessions.exclude(sso_provider='').exists()


class CreateManagedUserSerializer(serializers.Serializer):
    class SetupMode:
        SETUP_EMAIL = 'setup_email'
        TEMPORARY_PASSWORD = 'temporary_password'

    email = serializers.EmailField()
    username = serializers.CharField(required=False, allow_blank=True, max_length=150)
    first_name = serializers.CharField(required=False, allow_blank=True, max_length=150)
    last_name = serializers.CharField(required=False, allow_blank=True, max_length=150)
    display_name = serializers.CharField(required=False, allow_blank=True, max_length=255)
    organization = serializers.PrimaryKeyRelatedField(queryset=Organization.objects.all())
    team = serializers.PrimaryKeyRelatedField(queryset=Team.objects.all(), required=False, allow_null=True)
    role = serializers.ChoiceField(choices=Membership.Role.choices, default=Membership.Role.SIGNER)
    custom_role = serializers.PrimaryKeyRelatedField(queryset=Role.objects.all(), required=False, allow_null=True)
    is_active = serializers.BooleanField(default=True)
    setup_mode = serializers.ChoiceField(
        choices=[SetupMode.SETUP_EMAIL, SetupMode.TEMPORARY_PASSWORD],
        default=SetupMode.SETUP_EMAIL,
    )
    temporary_password = serializers.CharField(required=False, allow_blank=True, write_only=True, min_length=8)

    def validate(self, attrs):
        User = get_user_model()
        email = attrs['email'].strip().lower()
        username = (attrs.get('username') or email.split('@')[0]).strip()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError({'email': 'A user with this email already exists.'})
        if User.objects.filter(username__iexact=username).exists():
            raise serializers.ValidationError({'username': 'A user with this username already exists.'})
        team = attrs.get('team')
        organization = attrs['organization']
        if team and team.organization_id != organization.id:
            raise serializers.ValidationError({'team': 'Team must belong to the selected organization.'})
        custom_role = attrs.get('custom_role')
        if custom_role and custom_role.organization_id != organization.id:
            raise serializers.ValidationError({'custom_role': 'Custom role must belong to the selected organization.'})
        if attrs.get('setup_mode') == self.SetupMode.TEMPORARY_PASSWORD and not attrs.get('temporary_password'):
            raise serializers.ValidationError({'temporary_password': 'Temporary password is required for this setup mode.'})
        attrs['email'] = email
        attrs['username'] = username
        return attrs


class OrganizationSerializer(serializers.ModelSerializer):
    subsidiary_count = serializers.IntegerField(source='subsidiaries.count', read_only=True)
    logo_url = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = ['id', 'parent', 'name', 'legal_name', 'slug', 'website', 'primary_contact_email', 'logo', 'logo_url', 'subsidiary_count', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_logo_url(self, obj):
        if not obj.logo:
            return ''
        request = self.context.get('request')
        return request.build_absolute_uri(obj.logo.url) if request else obj.logo.url


class OrganizationDomainSerializer(serializers.ModelSerializer):
    dns_record = serializers.SerializerMethodField()

    class Meta:
        model = OrganizationDomain
        fields = ['id', 'organization', 'domain', 'status', 'verification_token', 'dns_record', 'verified_at', 'created_at']
        read_only_fields = ['id', 'status', 'verification_token', 'dns_record', 'verified_at', 'created_at']

    def get_dns_record(self, obj):
        return f'hanmak-verify={obj.verification_token}'


class TeamSerializer(serializers.ModelSerializer):
    member_count = serializers.IntegerField(source='memberships.count', read_only=True)

    class Meta:
        model = Team
        fields = ['id', 'organization', 'name', 'description', 'member_count', 'created_at']
        read_only_fields = ['id', 'created_at']


class MembershipSerializer(serializers.ModelSerializer):
    user_detail = UserSerializer(source='user', read_only=True)
    organization_name = serializers.CharField(source='organization.name', read_only=True)
    team_name = serializers.CharField(source='team.name', read_only=True)
    custom_role_name = serializers.CharField(source='custom_role.name', read_only=True)

    class Meta:
        model = Membership
        fields = [
            'id', 'user', 'user_detail', 'organization', 'organization_name',
            'team', 'team_name', 'role', 'custom_role', 'custom_role_name', 'is_active', 'joined_at',
        ]
        read_only_fields = ['id', 'joined_at']

    def validate(self, attrs):
        attrs = super().validate(attrs)
        organization = attrs.get('organization') or getattr(self.instance, 'organization', None)
        team = attrs.get('team') if 'team' in attrs else getattr(self.instance, 'team', None)
        custom_role = attrs.get('custom_role') if 'custom_role' in attrs else getattr(self.instance, 'custom_role', None)
        if team and organization and team.organization_id != organization.id:
            raise serializers.ValidationError({'team': 'Team must belong to the selected organization.'})
        if custom_role and organization and custom_role.organization_id != organization.id:
            raise serializers.ValidationError({'custom_role': 'Custom role must belong to the selected organization.'})
        return attrs


class RoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Role
        fields = ['id', 'organization', 'name', 'description', 'is_system', 'permissions', 'created_at']
        read_only_fields = ['id', 'created_at']


class InvitationSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source='organization.name', read_only=True)
    team_name = serializers.CharField(source='team.name', read_only=True)
    custom_role_name = serializers.CharField(source='custom_role.name', read_only=True)

    class Meta:
        model = Invitation
        fields = [
            'id', 'organization', 'organization_name', 'email', 'full_name',
            'role', 'custom_role', 'custom_role_name', 'team', 'team_name', 'status', 'message', 'invited_by', 'accepted_by',
            'sent_at', 'accepted_at', 'expires_at', 'created_at',
        ]
        read_only_fields = ['id', 'status', 'invited_by', 'accepted_by', 'sent_at', 'accepted_at', 'created_at']

    def validate(self, attrs):
        attrs = super().validate(attrs)
        organization = attrs.get('organization') or getattr(self.instance, 'organization', None)
        team = attrs.get('team') if 'team' in attrs else getattr(self.instance, 'team', None)
        custom_role = attrs.get('custom_role') if 'custom_role' in attrs else getattr(self.instance, 'custom_role', None)
        if team and organization and team.organization_id != organization.id:
            raise serializers.ValidationError({'team': 'Team must belong to the selected organization.'})
        if custom_role and organization and custom_role.organization_id != organization.id:
            raise serializers.ValidationError({'custom_role': 'Custom role must belong to the selected organization.'})
        return attrs


class UserProfileSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)
    is_staff = serializers.BooleanField(source='user.is_staff', read_only=True)
    is_superuser = serializers.BooleanField(source='user.is_superuser', read_only=True)
    memberships = serializers.SerializerMethodField()
    roles = serializers.SerializerMethodField()
    role = serializers.SerializerMethodField()

    class Meta:
        model = UserProfile
        fields = [
            'id', 'user', 'username', 'email', 'display_name', 'title',
            'phone', 'timezone', 'locale', 'signature_name', 'preferences',
            'auth_version', 'failed_login_count', 'locked_until', 'last_failed_login_at',
            'is_staff', 'is_superuser', 'memberships', 'roles', 'role', 'updated_at',
        ]
        read_only_fields = ['id', 'auth_version', 'failed_login_count', 'locked_until', 'last_failed_login_at', 'updated_at']

    def get_memberships(self, obj):
        return UserSerializer(context=self.context).get_memberships(obj.user)

    def get_roles(self, obj):
        return sorted({membership['role'] for membership in self.get_memberships(obj)})

    def get_role(self, obj):
        roles = self.get_roles(obj)
        if 'super_admin' in roles:
            return 'super_admin'
        return roles[0] if roles else ''


class MFADeviceSerializer(serializers.ModelSerializer):
    class Meta:
        model = MFADevice
        fields = [
            'id', 'user', 'name', 'method', 'is_confirmed', 'credential_id',
            'public_key', 'sign_count', 'metadata', 'last_used_at', 'created_at',
        ]
        read_only_fields = ['id', 'is_confirmed', 'last_used_at', 'created_at']


class NotificationPreferenceSerializer(serializers.ModelSerializer):
    user = serializers.PrimaryKeyRelatedField(queryset=get_user_model().objects.all(), required=False)

    class Meta:
        model = NotificationPreference
        fields = ['id', 'user', 'event_type', 'email_enabled', 'in_app_enabled', 'digest_enabled', 'updated_at']
        read_only_fields = ['id', 'updated_at']
        validators = []


class UserSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserSession
        fields = ['id', 'user', 'session_key', 'ip_address', 'user_agent', 'sso_provider', 'revoked_at', 'last_seen_at', 'created_at']
        read_only_fields = ['id', 'created_at']


class ImpersonationRequestSerializer(serializers.ModelSerializer):
    requester_username = serializers.CharField(source='requester.username', read_only=True)
    target_username = serializers.CharField(source='target_user.username', read_only=True)
    approved_by_username = serializers.CharField(source='approved_by.username', read_only=True)

    class Meta:
        model = ImpersonationRequest
        fields = [
            'id', 'organization', 'requester', 'requester_username', 'target_user',
            'target_username', 'reason', 'status', 'approved_by', 'approved_by_username',
            'approved_at', 'expires_at', 'started_at', 'ended_at', 'created_at',
        ]
        read_only_fields = ['id', 'requester', 'status', 'approved_by', 'approved_at', 'started_at', 'ended_at', 'created_at']


class ObjectPermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ObjectPermission
        fields = [
            'id', 'organization', 'user', 'team', 'content_type', 'object_id',
            'scope', 'granted_by', 'expires_at', 'created_at',
        ]
        read_only_fields = ['id', 'granted_by', 'created_at']


class AccountRecoveryRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = AccountRecoveryRequest
        fields = ['id', 'user', 'status', 'ip_address', 'user_agent', 'expires_at', 'used_at', 'created_at']
        read_only_fields = ['id', 'status', 'ip_address', 'user_agent', 'used_at', 'created_at']


class RecoveryCodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = RecoveryCode
        fields = ['id', 'user', 'used_at', 'created_at']
        read_only_fields = ['id', 'used_at', 'created_at']


class PasskeyChallengeSerializer(serializers.ModelSerializer):
    class Meta:
        model = PasskeyChallenge
        fields = ['id', 'user', 'challenge', 'purpose', 'metadata', 'expires_at', 'consumed_at', 'created_at']
        read_only_fields = ['id', 'challenge', 'expires_at', 'consumed_at', 'created_at']
