from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password, make_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import FileExtensionValidator
from django.db import transaction
from django.utils import timezone
from rest_framework import decorators, permissions, response, status, viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework_simplejwt.tokens import RefreshToken
from datetime import datetime
import secrets

from auditlog.models import AuditEvent
from auditlog.services import log_admin_event

from .auth import bump_auth_version, current_auth_version
from .models import (
    AccountRecoveryRequest,
    ImpersonationRequest,
    Invitation,
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
from .passkeys import (
    credential_creation_options_to_json,
    credential_request_options_to_json,
    deserialize_passkey_state,
    parse_authentication_response,
    parse_registration_response,
    passkey_server,
    passkey_user_entity,
    serialize_passkey_state,
    stored_attested_credentials,
)
from .permissions import OrganizationRolePermission, OrganizationScopedQuerySetMixin, feature_flag_allows, feature_flag_allows_request, user_has_org_role, user_organization_ids
from .serializers import (
    CreateManagedUserSerializer,
    InvitationSerializer,
    MFADeviceSerializer,
    MembershipSerializer,
    NotificationPreferenceSerializer,
    ObjectPermissionSerializer,
    OrganizationSerializer,
    OrganizationDomainSerializer,
    AccountRecoveryRequestSerializer,
    ImpersonationRequestSerializer,
    PasskeyChallengeSerializer,
    RecoveryCodeSerializer,
    RoleSerializer,
    TeamSerializer,
    UserProfileSerializer,
    UserSerializer,
    UserSessionSerializer,
)


LOGO_CONTENT_TYPES = {'image/png', 'image/jpeg', 'image/gif', 'image/webp'}
LOGO_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp']
MAX_LOGO_BYTES = 2 * 1024 * 1024


class UserViewSet(viewsets.ModelViewSet):
    feature_flag_key = 'admin_users'
    queryset = get_user_model().objects.all().order_by('id')
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if not feature_flag_allows_request(request, self):
            raise PermissionDenied('The "admin_users" feature is not released for this organization.')

    def get_queryset(self):
        queryset = super().get_queryset()
        organization_ids = user_organization_ids(self.request.user)
        if organization_ids is None:
            return queryset
        if not organization_ids:
            return queryset.none()
        return queryset.filter(memberships__organization_id__in=organization_ids, memberships__is_active=True).distinct()

    def _user_admin_organization_ids(self, user):
        if self.request.user.is_superuser:
            return list(user.memberships.values_list('organization_id', flat=True))
        return [
            organization_id for organization_id in user.memberships.values_list('organization_id', flat=True)
            if user_has_org_role(self.request.user, organization_id, [Membership.Role.ADMIN])
        ]

    def _assert_can_manage_user(self, user):
        if not self._user_admin_organization_ids(user):
            return response.Response({'detail': 'Admin membership is required to manage this user.'}, status=status.HTTP_403_FORBIDDEN)
        return None

    def _create_recovery_request(self, user, request):
        token = secrets.token_urlsafe(32)
        recovery = AccountRecoveryRequest.objects.create(
            user=user,
            token_hash=make_password(token),
            ip_address=request.META.get('REMOTE_ADDR'),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
            expires_at=timezone.now() + timezone.timedelta(hours=1),
        )
        return recovery, token

    def _queue_setup_email(self, organization, user, request):
        from messaging.models import EmailMessage
        from messaging.services import render_setup_email
        from messaging.tasks import deliver_email_message_task

        recovery, token = self._create_recovery_request(user, request)
        base = settings.HANMAK_PUBLIC_BASE_URL.rstrip('/')
        setup_url = f'{base}/account-setup?token={token}'
        subject, body, html_body = render_setup_email(organization=organization, user=user, setup_url=setup_url)
        queued_email = EmailMessage.objects.create(
            organization=organization,
            kind=EmailMessage.Kind.INVITATION,
            to_email=user.email,
            subject=subject,
            body=body,
            html_body=html_body,
            queued_by=request.user if request.user.is_authenticated else None,
        )
        deliver_email_message_task.apply_async(args=[queued_email.id], queue='email')
        return recovery, token, queued_email

    @decorators.action(detail=False, methods=['post'])
    def create_managed(self, request):
        serializer = CreateManagedUserSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        organization = serializer.validated_data['organization']
        if not user_has_org_role(request.user, organization.id, [Membership.Role.ADMIN]):
            return response.Response({'detail': 'Admin membership is required to create users.'}, status=status.HTTP_403_FORBIDDEN)

        User = get_user_model()
        user = User(
            username=serializer.validated_data['username'],
            email=serializer.validated_data['email'],
            first_name=serializer.validated_data.get('first_name', ''),
            last_name=serializer.validated_data.get('last_name', ''),
            is_active=serializer.validated_data.get('is_active', True),
        )
        setup_mode = serializer.validated_data.get('setup_mode')
        temporary_password = serializer.validated_data.get('temporary_password', '')
        if setup_mode == CreateManagedUserSerializer.SetupMode.TEMPORARY_PASSWORD:
            user.set_password(temporary_password)
        else:
            user.set_unusable_password()
        user.save()

        Membership.objects.create(
            user=user,
            organization=organization,
            team=serializer.validated_data.get('team'),
            role=serializer.validated_data.get('role', Membership.Role.SIGNER),
            custom_role=serializer.validated_data.get('custom_role'),
            is_active=True,
        )
        display_name = serializer.validated_data.get('display_name', '').strip()
        if display_name:
            UserProfile.objects.update_or_create(user=user, defaults={'display_name': display_name})

        recovery = None
        queued_email = None
        setup_token = ''
        if setup_mode == CreateManagedUserSerializer.SetupMode.SETUP_EMAIL:
            recovery, setup_token, queued_email = self._queue_setup_email(organization, user, request)

        log_admin_event(
            organization=organization,
            actor=request.user,
            event_type='admin.user_created',
            message=f'Created managed user {user.email}',
            request=request,
            metadata={'user': user.id, 'setup_mode': setup_mode},
        )

        data = self.get_serializer(user).data
        data['membership'] = MembershipSerializer(user.memberships.select_related('organization', 'team').get(organization=organization)).data
        data['setup_mode'] = setup_mode
        data['recovery_request'] = recovery.id if recovery else None
        data['queued_email'] = queued_email.id if queued_email else None
        return response.Response(data, status=status.HTTP_201_CREATED)

    @decorators.action(detail=True, methods=['post'])
    def suspend(self, request, pk=None):
        user = self.get_object()
        denied = self._assert_can_manage_user(user)
        if denied:
            return denied
        user.is_active = False
        user.save(update_fields=['is_active'])
        bump_auth_version(user)
        for organization_id in self._user_admin_organization_ids(user):
            log_admin_event(organization=Organization.objects.get(id=organization_id), actor=request.user, event_type='admin.user_suspended', message=f'Suspended user {user.email}', request=request, metadata={'user': user.id})
        return response.Response(self.get_serializer(user).data)

    @decorators.action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        user = self.get_object()
        denied = self._assert_can_manage_user(user)
        if denied:
            return denied
        user.is_active = True
        user.save(update_fields=['is_active'])
        for organization_id in self._user_admin_organization_ids(user):
            log_admin_event(organization=Organization.objects.get(id=organization_id), actor=request.user, event_type='admin.user_activated', message=f'Activated user {user.email}', request=request, metadata={'user': user.id})
        return response.Response(self.get_serializer(user).data)

    @decorators.action(detail=True, methods=['post'])
    def reset_password(self, request, pk=None):
        user = self.get_object()
        denied = self._assert_can_manage_user(user)
        if denied:
            return denied
        admin_org_ids = self._user_admin_organization_ids(user)
        organization = Organization.objects.get(id=admin_org_ids[0])
        recovery, token, queued_email = self._queue_setup_email(organization, user, request)
        bump_auth_version(user)
        log_admin_event(organization=organization, actor=request.user, event_type='admin.password_reset_forced', message=f'Forced password reset for {user.email}', request=request, metadata={'user': user.id, 'recovery_request': recovery.id})
        return response.Response({'ok': True, 'recovery_request': recovery.id, 'queued_email': queued_email.id})

    @decorators.action(detail=True, methods=['post'])
    def cancel_setup_tokens(self, request, pk=None):
        user = self.get_object()
        denied = self._assert_can_manage_user(user)
        if denied:
            return denied
        count = AccountRecoveryRequest.objects.filter(
            user=user,
            status=AccountRecoveryRequest.Status.PENDING,
        ).update(status=AccountRecoveryRequest.Status.REVOKED)
        admin_org_ids = self._user_admin_organization_ids(user)
        if admin_org_ids:
            organization = Organization.objects.get(id=admin_org_ids[0])
            log_admin_event(organization=organization, actor=request.user, event_type='admin.setup_tokens_revoked', message=f'Revoked setup tokens for {user.email}', request=request, metadata={'user': user.id, 'revoked_count': count})
        return response.Response({'ok': True, 'revoked_count': count})

    @decorators.action(detail=True, methods=['post'])
    def revoke_sessions(self, request, pk=None):
        user = self.get_object()
        denied = self._assert_can_manage_user(user)
        if denied:
            return denied
        count = UserSession.objects.filter(user=user, revoked_at__isnull=True).update(revoked_at=timezone.now())
        bump_auth_version(user)
        return response.Response({'ok': True, 'revoked_count': count})

    @decorators.action(detail=True, methods=['post'])
    def impersonation_preview(self, request, pk=None):
        user = self.get_object()
        denied = self._assert_can_manage_user(user)
        if denied:
            return denied
        organization_id = self._user_admin_organization_ids(user)[0]
        organization = Organization.objects.get(id=organization_id)
        impersonation = ImpersonationRequest.objects.create(
            organization=organization,
            requester=request.user,
            target_user=user,
            reason=request.data.get('reason') or 'Admin support request',
            expires_at=timezone.now() + timezone.timedelta(minutes=30),
        )
        log_admin_event(
            organization=organization,
            actor=request.user,
            event_type='admin.impersonation_requested',
            message=f'Requested impersonation approval for {user.email}',
            request=request,
            severity=AuditEvent.Severity.SECURITY,
            metadata={'impersonation_request': impersonation.id, 'target_user': user.id},
        )
        return response.Response({
            'ok': True,
            'message': f'Impersonation request recorded for {user.get_username()}. Real session switching remains disabled until approved.',
            'request': ImpersonationRequestSerializer(impersonation).data,
        })


class ImpersonationRequestViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'admin_users'
    queryset = ImpersonationRequest.objects.select_related('organization', 'requester', 'target_user', 'approved_by').all().order_by('-created_at')
    serializer_class = ImpersonationRequestSerializer
    permission_classes = [OrganizationRolePermission]
    write_roles = [Membership.Role.ADMIN]

    def perform_create(self, serializer):
        self._assert_related_organization_access(serializer)
        impersonation = serializer.save(requester=self.request.user)
        log_admin_event(
            organization=impersonation.organization,
            actor=self.request.user,
            event_type='admin.impersonation_requested',
            message=f'Requested impersonation approval for {impersonation.target_user.email}',
            request=self.request,
            severity=AuditEvent.Severity.SECURITY,
            metadata={'impersonation_request': impersonation.id, 'target_user': impersonation.target_user_id},
        )

    @decorators.action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        impersonation = self.get_object()
        if impersonation.status != ImpersonationRequest.Status.REQUESTED:
            return response.Response({'detail': f'Impersonation request is {impersonation.status}.'}, status=400)
        if impersonation.requester_id == request.user.id:
            return response.Response({'detail': 'A second admin must approve impersonation requests.'}, status=400)
        impersonation.status = ImpersonationRequest.Status.APPROVED
        impersonation.approved_by = request.user
        impersonation.approved_at = timezone.now()
        impersonation.expires_at = impersonation.expires_at or timezone.now() + timezone.timedelta(minutes=30)
        impersonation.save(update_fields=['status', 'approved_by', 'approved_at', 'expires_at'])
        log_admin_event(
            organization=impersonation.organization,
            actor=request.user,
            event_type='admin.impersonation_approved',
            message=f'Approved impersonation request for {impersonation.target_user.email}',
            request=request,
            severity=AuditEvent.Severity.SECURITY,
            metadata={'impersonation_request': impersonation.id, 'target_user': impersonation.target_user_id},
        )
        return response.Response(self.get_serializer(impersonation).data)

    @decorators.action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        impersonation = self.get_object()
        if impersonation.status not in [ImpersonationRequest.Status.APPROVED, ImpersonationRequest.Status.ACTIVE]:
            return response.Response({'detail': f'Impersonation request is {impersonation.status}.'}, status=400)
        if impersonation.requester_id != request.user.id and not request.user.is_superuser:
            return response.Response({'detail': 'Only the requester can start this approved impersonation session.'}, status=403)
        if impersonation.expires_at and impersonation.expires_at <= timezone.now():
            impersonation.status = ImpersonationRequest.Status.EXPIRED
            impersonation.save(update_fields=['status'])
            return response.Response({'detail': 'Impersonation approval has expired.'}, status=400)
        if not Membership.objects.filter(user=impersonation.target_user, organization=impersonation.organization, is_active=True).exists():
            return response.Response({'detail': 'Target user is not active in this organization.'}, status=400)
        impersonation.status = ImpersonationRequest.Status.ACTIVE
        impersonation.started_at = impersonation.started_at or timezone.now()
        impersonation.save(update_fields=['status', 'started_at'])
        refresh = RefreshToken.for_user(impersonation.target_user)
        refresh['auth_version'] = current_auth_version(impersonation.target_user)
        refresh['impersonation_request'] = impersonation.id
        refresh['impersonated_by'] = request.user.id
        refresh['impersonation_organization'] = impersonation.organization_id
        log_admin_event(
            organization=impersonation.organization,
            actor=request.user,
            event_type='admin.impersonation_started',
            message=f'Started impersonation session for {impersonation.target_user.email}',
            request=request,
            severity=AuditEvent.Severity.SECURITY,
            metadata={'impersonation_request': impersonation.id, 'target_user': impersonation.target_user_id},
        )
        return response.Response({
            'ok': True,
            'impersonation': self.get_serializer(impersonation).data,
            'target_user': UserSerializer(impersonation.target_user, context={'request': request}).data,
            'refresh': str(refresh),
            'access': str(refresh.access_token),
        })

    @decorators.action(detail=True, methods=['post'])
    def end(self, request, pk=None):
        impersonation = self.get_object()
        if impersonation.status != ImpersonationRequest.Status.ACTIVE:
            return response.Response({'detail': f'Impersonation request is {impersonation.status}.'}, status=400)
        if impersonation.requester_id != request.user.id and not request.user.is_superuser:
            return response.Response({'detail': 'Only the requester can end this impersonation session.'}, status=403)
        impersonation.status = ImpersonationRequest.Status.ENDED
        impersonation.ended_at = timezone.now()
        impersonation.save(update_fields=['status', 'ended_at'])
        bump_auth_version(impersonation.target_user)
        log_admin_event(
            organization=impersonation.organization,
            actor=request.user,
            event_type='admin.impersonation_ended',
            message=f'Ended impersonation session for {impersonation.target_user.email}',
            request=request,
            severity=AuditEvent.Severity.SECURITY,
            metadata={'impersonation_request': impersonation.id, 'target_user': impersonation.target_user_id},
        )
        return response.Response(self.get_serializer(impersonation).data)

    @decorators.action(detail=True, methods=['post'])
    def deny(self, request, pk=None):
        impersonation = self.get_object()
        if impersonation.status != ImpersonationRequest.Status.REQUESTED:
            return response.Response({'detail': f'Impersonation request is {impersonation.status}.'}, status=400)
        impersonation.status = ImpersonationRequest.Status.DENIED
        impersonation.approved_by = request.user
        impersonation.approved_at = timezone.now()
        impersonation.save(update_fields=['status', 'approved_by', 'approved_at'])
        log_admin_event(
            organization=impersonation.organization,
            actor=request.user,
            event_type='admin.impersonation_denied',
            message=f'Denied impersonation request for {impersonation.target_user.email}',
            request=request,
            severity=AuditEvent.Severity.SECURITY,
            metadata={'impersonation_request': impersonation.id, 'target_user': impersonation.target_user_id},
        )
        return response.Response(self.get_serializer(impersonation).data)


class OrganizationViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    admin_feature_flag_key = 'admin_organizations'
    queryset = Organization.objects.all().order_by('name')
    serializer_class = OrganizationSerializer
    permission_classes = [OrganizationRolePermission]
    write_roles = OrganizationRolePermission.write_roles

    def _assert_admin_organizations_enabled(self, organization=None):
        if organization:
            if not feature_flag_allows(self.request.user, organization.id, self.admin_feature_flag_key):
                return response.Response({'detail': f'The "{self.admin_feature_flag_key}" feature is not released for this organization.'}, status=status.HTTP_403_FORBIDDEN)
            return None
        organization_ids = user_organization_ids(self.request.user)
        if organization_ids is None or any(feature_flag_allows(self.request.user, org_id, self.admin_feature_flag_key) for org_id in organization_ids):
            return None
        return response.Response({'detail': f'The "{self.admin_feature_flag_key}" feature is not released for this organization.'}, status=status.HTTP_403_FORBIDDEN)

    def create(self, request, *args, **kwargs):
        gated = self._assert_admin_organizations_enabled()
        if gated:
            return gated
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        gated = self._assert_admin_organizations_enabled(self.get_object())
        if gated:
            return gated
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        gated = self._assert_admin_organizations_enabled(self.get_object())
        if gated:
            return gated
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        gated = self._assert_admin_organizations_enabled(self.get_object())
        if gated:
            return gated
        return super().destroy(request, *args, **kwargs)

    def perform_create(self, serializer):
        self._assert_related_organization_access(serializer)
        organization = serializer.save()
        if not self.request.user.is_superuser:
            Membership.objects.get_or_create(
                user=self.request.user,
                organization=organization,
                defaults={'role': Membership.Role.ADMIN},
            )

    def _assert_organization_feature(self, organization, key):
        if not feature_flag_allows(self.request.user, organization.id, key):
            return response.Response({'detail': f'The "{key}" feature is not released for this organization.'}, status=status.HTTP_403_FORBIDDEN)
        return None

    @decorators.action(detail=True, methods=['get'])
    def export_data(self, request, pk=None):
        organization = self.get_object()
        return response.Response({
            'organization': self.get_serializer(organization).data,
            'domains': OrganizationDomainSerializer(organization.domains.all(), many=True).data,
            'teams': TeamSerializer(organization.teams.all(), many=True).data,
            'memberships': MembershipSerializer(organization.memberships.select_related('user', 'team'), many=True).data,
            'roles': RoleSerializer(organization.roles.all(), many=True).data,
            'invitations': InvitationSerializer(organization.invitations.all(), many=True).data,
        })

    @decorators.action(detail=True, methods=['get', 'patch'])
    def branding(self, request, pk=None):
        organization = self.get_object()
        gated = self._assert_organization_feature(organization, 'settings_branding')
        if gated:
            return gated
        from configcenter.models import AppSetting
        from configcenter.serializers import AppSettingSerializer

        setting, _ = AppSetting.objects.get_or_create(
            organization=organization,
            namespace='branding',
            key='theme',
            defaults={'value': {}, 'is_secret': False},
        )
        if request.method == 'PATCH':
            setting.value = {
                **(setting.value if isinstance(setting.value, dict) else {}),
                **(request.data.get('value') if isinstance(request.data.get('value'), dict) else request.data),
            }
            setting.save(update_fields=['value', 'updated_at'])
            log_admin_event(organization=organization, actor=request.user, event_type='admin.branding_updated', message='Updated organization branding', request=request, metadata={'setting': setting.id})
        data = AppSettingSerializer(setting).data
        data['logo_url'] = OrganizationSerializer(organization, context={'request': request}).data.get('logo_url')
        return response.Response(data)

    @decorators.action(detail=True, methods=['post'])
    def upload_logo(self, request, pk=None):
        organization = self.get_object()
        gated = self._assert_organization_feature(organization, 'settings_branding')
        if gated:
            return gated
        logo = request.FILES.get('logo')
        if not logo:
            return response.Response({'detail': 'logo file is required.'}, status=400)
        if logo.size > MAX_LOGO_BYTES:
            return response.Response({'detail': 'Logo must be 2 MB or smaller.'}, status=400)
        content_type = getattr(logo, 'content_type', '')
        if content_type not in LOGO_CONTENT_TYPES:
            return response.Response({'detail': 'Logo must be a PNG, JPEG, GIF, or WebP image.'}, status=400)
        try:
            FileExtensionValidator(allowed_extensions=LOGO_EXTENSIONS)(logo)
        except DjangoValidationError:
            return response.Response({'detail': 'Logo file extension must be png, jpg, jpeg, gif, or webp.'}, status=400)
        organization.logo = logo
        organization.save(update_fields=['logo', 'updated_at'])
        log_admin_event(organization=organization, actor=request.user, event_type='admin.logo_uploaded', message='Uploaded organization logo', request=request, metadata={'filename': logo.name})
        return response.Response(self.get_serializer(organization).data)

    @decorators.action(detail=True, methods=['post'])
    def transfer_ownership(self, request, pk=None):
        organization = self.get_object()
        target_user_id = request.data.get('user')
        if not target_user_id:
            return response.Response({'detail': 'Target user is required.'}, status=status.HTTP_400_BAD_REQUEST)
        membership = Membership.objects.filter(organization=organization, user_id=target_user_id, is_active=True).first()
        if not membership:
            return response.Response({'detail': 'Target user must be an active organization member.'}, status=status.HTTP_400_BAD_REQUEST)
        membership.role = Membership.Role.ADMIN
        membership.save(update_fields=['role'])
        log_admin_event(organization=organization, actor=request.user, event_type='admin.ownership_transferred', message=f'Granted admin ownership to {membership.user.email}', request=request, severity=AuditEvent.Severity.SECURITY, metadata={'user': membership.user_id})
        return response.Response({'ok': True, 'owner_membership': MembershipSerializer(membership).data})

    @decorators.action(detail=True, methods=['post'])
    def request_deletion(self, request, pk=None):
        organization = self.get_object()
        from configcenter.models import AppSetting
        from messaging.models import EmailMessage
        from messaging.tasks import deliver_email_message_task

        confirmation_token = secrets.token_urlsafe(32)
        contact_email = organization.primary_contact_email or request.user.email
        cooling_off_until = timezone.now() + timezone.timedelta(days=7)
        setting, _ = AppSetting.objects.update_or_create(
            organization=organization,
            namespace='admin',
            key='deletion_request',
            defaults={
                'value': {
                    'requested_by': request.user.id,
                    'reason': request.data.get('reason', ''),
                    'requested_at': timezone.now().isoformat(),
                    'cooling_off_until': cooling_off_until.isoformat(),
                    'confirmation_token_hash': make_password(confirmation_token),
                    'confirmation_sent_to': contact_email,
                    'export_recommended': True,
                    'status': 'pending_confirmation',
                },
                'is_secret': False,
            },
        )
        if contact_email:
            _base = settings.HANMAK_PUBLIC_BASE_URL.rstrip('/')
            confirm_url = f'{_base}/admin/organizations?deletion_token={confirmation_token}&organization={organization.id}'
            message = EmailMessage.objects.create(
                organization=organization,
                kind=EmailMessage.Kind.INVITATION,
                to_email=contact_email,
                subject=f'Confirm deletion request for {organization.name}',
                body=(
                    f'A deletion request was created for {organization.name}.\n\n'
                    f'Reason: {request.data.get("reason", "")}\n'
                    f'Cooling-off ends: {cooling_off_until.isoformat()}\n\n'
                    f'Confirm after the cooling-off period here:\n{confirm_url}\n\n'
                    'Export tenant data before confirming deletion.'
                ),
                html_body=(
                    '<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#172033;">'
                    f'<h1>Confirm deletion request for {organization.name}</h1>'
                    f'<p>A deletion request was created. The cooling-off period ends at <strong>{cooling_off_until.isoformat()}</strong>.</p>'
                    f'<p><a href="{confirm_url}">Confirm deletion request</a></p>'
                    '<p>Export tenant data before confirming deletion.</p>'
                    '</body></html>'
                ),
                queued_by=request.user,
            )
            deliver_email_message_task.apply_async(args=[message.id], queue='email')
            setting.value = {**setting.value, 'queued_email': message.id}
            setting.save(update_fields=['value'])
        public_value = {key: value for key, value in setting.value.items() if key != 'confirmation_token_hash'}
        log_admin_event(organization=organization, actor=request.user, event_type='admin.deletion_requested', message='Organization deletion requested', request=request, severity=AuditEvent.Severity.WARNING, metadata=public_value)
        return response.Response({'ok': True, 'deletion_request': public_value})

    @decorators.action(detail=True, methods=['post'])
    def confirm_deletion_request(self, request, pk=None):
        organization = self.get_object()
        from configcenter.models import AppSetting

        setting = AppSetting.objects.filter(organization=organization, namespace='admin', key='deletion_request').first()
        if not setting or not isinstance(setting.value, dict):
            return response.Response({'detail': 'No deletion request is pending.'}, status=404)
        value = setting.value
        if value.get('status') != 'pending_confirmation':
            return response.Response({'detail': f'Deletion request is {value.get("status", "not pending")}.'}, status=400)
        token = request.data.get('token', '')
        if not token or not check_password(token, value.get('confirmation_token_hash', '')):
            return response.Response({'detail': 'Deletion confirmation token is invalid.'}, status=400)
        cooling_off_until = datetime.fromisoformat(value['cooling_off_until'])
        if timezone.is_naive(cooling_off_until):
            cooling_off_until = timezone.make_aware(cooling_off_until, timezone.get_current_timezone())
        if cooling_off_until > timezone.now():
            return response.Response({'detail': 'Deletion request is still in the cooling-off period.', 'cooling_off_until': value['cooling_off_until']}, status=400)
        setting.value = {
            **value,
            'status': 'confirmed',
            'confirmed_by': request.user.id,
            'confirmed_at': timezone.now().isoformat(),
        }
        setting.save(update_fields=['value'])
        public_value = {key: value for key, value in setting.value.items() if key != 'confirmation_token_hash'}
        log_admin_event(organization=organization, actor=request.user, event_type='admin.deletion_confirmed', message='Organization deletion confirmed after cooling-off period', request=request, severity=AuditEvent.Severity.SECURITY, metadata=public_value)
        return response.Response({'ok': True, 'deletion_request': public_value})


class OrganizationDomainViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'admin_organizations'
    queryset = OrganizationDomain.objects.select_related('organization').all().order_by('domain')
    serializer_class = OrganizationDomainSerializer
    permission_classes = [OrganizationRolePermission]
    write_roles = OrganizationRolePermission.write_roles

    def perform_create(self, serializer):
        self._assert_related_organization_access(serializer)
        token = f'hm_verify_{secrets.token_urlsafe(12)}'
        serializer.save(verification_token=token)

    @decorators.action(detail=True, methods=['post'])
    def verify(self, request, pk=None):
        domain = self.get_object()
        domain.status = OrganizationDomain.Status.VERIFIED
        domain.verified_at = timezone.now()
        domain.save(update_fields=['status', 'verified_at'])
        return response.Response(self.get_serializer(domain).data)


class TeamViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'admin_teams'
    queryset = Team.objects.select_related('organization').all().order_by('organization__name', 'name')
    serializer_class = TeamSerializer
    permission_classes = [OrganizationRolePermission]
    write_roles = OrganizationRolePermission.write_roles

    def perform_create(self, serializer):
        self._assert_related_organization_access(serializer)
        team = serializer.save()
        log_admin_event(
            organization=team.organization,
            actor=self.request.user,
            event_type='admin.team_created',
            message=f'Created team {team.name}',
            request=self.request,
            metadata={'team': team.id},
        )

    def perform_update(self, serializer):
        team = serializer.save()
        log_admin_event(
            organization=team.organization,
            actor=self.request.user,
            event_type='admin.team_updated',
            message=f'Updated team {team.name}',
            request=self.request,
            metadata={'team': team.id},
        )

    def perform_destroy(self, instance):
        organization = instance.organization
        metadata = {'team': instance.id, 'name': instance.name}
        instance.delete()
        log_admin_event(
            organization=organization,
            actor=self.request.user,
            event_type='admin.team_deleted',
            message=f'Deleted team {metadata["name"]}',
            request=self.request,
            metadata=metadata,
        )


class MembershipViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'admin_users'
    queryset = Membership.objects.select_related('user', 'organization', 'team').all().order_by('organization__name', 'user__username')
    serializer_class = MembershipSerializer
    permission_classes = [OrganizationRolePermission]
    write_roles = OrganizationRolePermission.write_roles

    def perform_update(self, serializer):
        old = self.get_object()
        old_role = old.role
        old_team_id = old.team_id
        membership = serializer.save()
        if old_role != membership.role or old_team_id != membership.team_id:
            log_admin_event(organization=membership.organization, actor=self.request.user, event_type='admin.membership_updated', message=f'Updated membership for {membership.user.email}', request=self.request, metadata={'membership': membership.id, 'old_role': old_role, 'new_role': membership.role, 'old_team': old_team_id, 'new_team': membership.team_id})


class RoleViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'admin_roles'
    queryset = Role.objects.select_related('organization').all().order_by('organization__name', 'name')
    serializer_class = RoleSerializer
    permission_classes = [OrganizationRolePermission]
    write_roles = OrganizationRolePermission.write_roles

    def perform_create(self, serializer):
        self._assert_related_organization_access(serializer)
        role = serializer.save()
        if role.organization:
            log_admin_event(organization=role.organization, actor=self.request.user, event_type='admin.role_created', message=f'Created role {role.name}', request=self.request, metadata={'role': role.id, 'permissions': role.permissions})

    def perform_update(self, serializer):
        role = serializer.save()
        if role.organization:
            log_admin_event(organization=role.organization, actor=self.request.user, event_type='admin.role_updated', message=f'Updated role {role.name}', request=self.request, metadata={'role': role.id, 'permissions': role.permissions})

    def perform_destroy(self, instance):
        if instance.is_system:
            raise PermissionDenied('System roles cannot be deleted.')
        organization = instance.organization
        metadata = {'role': instance.id, 'name': instance.name, 'permissions': instance.permissions}
        Membership.objects.filter(custom_role=instance).update(custom_role=None)
        instance.delete()
        if organization:
            log_admin_event(
                organization=organization,
                actor=self.request.user,
                event_type='admin.role_deleted',
                message=f'Deleted role {metadata["name"]}',
                request=self.request,
                metadata=metadata,
            )


class InvitationViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'admin_users'
    queryset = Invitation.objects.select_related('organization', 'team', 'invited_by', 'accepted_by').all().order_by('-created_at')
    serializer_class = InvitationSerializer
    permission_classes = [OrganizationRolePermission]
    write_roles = OrganizationRolePermission.write_roles

    def _assert_feature_flag_access(self, request):
        if self.action in ['accept', 'inspect_token']:
            return
        return super()._assert_feature_flag_access(request)

    def get_permissions(self):
        if self.action in ['accept', 'inspect_token']:
            return [permissions.AllowAny()]
        return super().get_permissions()

    def create(self, request, *args, **kwargs):
        result = super().create(request, *args, **kwargs)
        if getattr(self, '_created_invite_token', ''):
            result.data['queued_email'] = getattr(self, '_created_invite_email_id', None)
        return result

    def perform_create(self, serializer):
        self._assert_related_organization_access(serializer)
        token = secrets.token_urlsafe(32)
        invitation = serializer.save(
            invited_by=self.request.user,
            sent_at=timezone.now(),
            expires_at=timezone.now() + timezone.timedelta(days=7),
            token_hash=make_password(token),
        )
        message = self._queue_invitation_email(invitation, token)
        self._created_invite_token = token
        self._created_invite_email_id = message.id
        log_admin_event(organization=invitation.organization, actor=self.request.user, event_type='admin.invitation_created', message=f'Invited {invitation.email}', request=self.request, metadata={'invitation': invitation.id})

    def _queue_invitation_email(self, invitation, token):
        from messaging.models import EmailMessage
        from messaging.tasks import deliver_email_message_task

        base = settings.HANMAK_PUBLIC_BASE_URL.rstrip('/')
        accept_url = f'{base}/accept-invite?token={token}'
        subject = f'Join {invitation.organization.name} on HanMak'
        body = (
            f'Hello {invitation.full_name or invitation.email},\n\n'
            f'You have been invited to {invitation.organization.name} on HanMak.\n'
            f'Accept your invitation here:\n{accept_url}\n\n'
            'This invitation expires in seven days.'
        )
        html = (
            '<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#172033;">'
            '<div style="max-width:620px;margin:0 auto;padding:28px 16px;">'
            '<h1 style="margin:0 0 12px;">You are invited to HanMak</h1>'
            f'<p>You have been invited to <strong>{invitation.organization.name}</strong>.</p>'
            f'<p><a href="{accept_url}" style="display:inline-block;background:#2563eb;color:white;text-decoration:none;border-radius:7px;padding:12px 18px;font-weight:700;">Accept invitation</a></p>'
            '<p style="color:#64748b;font-size:12px;">This invitation expires in seven days.</p>'
            '</div></body></html>'
        )
        message = EmailMessage.objects.create(
            organization=invitation.organization,
            invitation=invitation,
            kind=EmailMessage.Kind.INVITATION,
            to_email=invitation.email,
            subject=subject,
            body=body,
            html_body=html,
            queued_by=self.request.user if self.request.user.is_authenticated else None,
        )
        deliver_email_message_task.apply_async(args=[message.id], queue='email')
        return message

    @decorators.action(detail=True, methods=['post'])
    def revoke(self, request, pk=None):
        invitation = self.get_object()
        invitation.status = Invitation.Status.REVOKED
        invitation.save(update_fields=['status'])
        log_admin_event(organization=invitation.organization, actor=request.user, event_type='admin.invitation_revoked', message=f'Revoked invitation for {invitation.email}', request=request, metadata={'invitation': invitation.id})
        return response.Response(self.get_serializer(invitation).data)

    @decorators.action(detail=True, methods=['post'])
    def resend(self, request, pk=None):
        invitation = self.get_object()
        if invitation.status != Invitation.Status.PENDING:
            return response.Response({'detail': 'Only pending invitations can be resent.'}, status=400)
        token = secrets.token_urlsafe(32)
        invitation.token_hash = make_password(token)
        invitation.sent_at = timezone.now()
        invitation.expires_at = timezone.now() + timezone.timedelta(days=7)
        invitation.save(update_fields=['token_hash', 'sent_at', 'expires_at'])
        message = self._queue_invitation_email(invitation, token)
        log_admin_event(organization=invitation.organization, actor=request.user, event_type='admin.invitation_resent', message=f'Resent invitation for {invitation.email}', request=request, metadata={'invitation': invitation.id, 'email_message': message.id})
        return response.Response({**self.get_serializer(invitation).data, 'queued_email': message.id})

    @decorators.action(detail=False, methods=['post'])
    def inspect_token(self, request):
        invitation = self._invitation_from_token(request.data.get('token', ''))
        if not invitation:
            return response.Response({'detail': 'Invitation token is invalid.'}, status=400)
        if invitation.expires_at and invitation.expires_at <= timezone.now():
            invitation.status = Invitation.Status.EXPIRED
            invitation.save(update_fields=['status'])
            return response.Response({'detail': 'Invitation token has expired.', 'status': Invitation.Status.EXPIRED}, status=400)
        return response.Response(self.get_serializer(invitation).data)

    @decorators.action(detail=False, methods=['post'])
    def accept(self, request):
        invitation = self._invitation_from_token(request.data.get('token', ''))
        if not invitation:
            return response.Response({'detail': 'Invitation token is invalid.'}, status=400)
        if invitation.status != Invitation.Status.PENDING:
            return response.Response({'detail': f'Invitation is {invitation.status}.'}, status=400)
        if invitation.expires_at and invitation.expires_at <= timezone.now():
            invitation.status = Invitation.Status.EXPIRED
            invitation.save(update_fields=['status'])
            return response.Response({'detail': 'Invitation token has expired.'}, status=400)
        password = request.data.get('password', '')
        if len(password) < 8:
            return response.Response({'password': 'Password must be at least 8 characters.'}, status=400)
        User = get_user_model()
        user = User.objects.filter(email__iexact=invitation.email).first()
        if not user:
            username = (request.data.get('username') or invitation.email.split('@')[0]).strip()
            if not username:
                return response.Response({'username': 'Username is required.'}, status=400)
            if User.objects.filter(username__iexact=username).exists():
                return response.Response({'username': 'A user with this username already exists.'}, status=400)
            user = User.objects.create_user(
                username=username,
                email=invitation.email,
                password=password,
            )
        else:
            user.set_password(password)
            user.is_active = True
            user.save(update_fields=['password', 'is_active'])
            bump_auth_version(user)
        if invitation.full_name and not user.get_full_name():
            parts = invitation.full_name.split(' ', 1)
            user.first_name = parts[0]
            user.last_name = parts[1] if len(parts) > 1 else ''
            user.save(update_fields=['first_name', 'last_name'])
        Membership.objects.update_or_create(
            user=user,
            organization=invitation.organization,
            defaults={'team': invitation.team, 'role': invitation.role, 'custom_role': invitation.custom_role, 'is_active': True},
        )
        invitation.status = Invitation.Status.ACCEPTED
        invitation.accepted_by = user
        invitation.accepted_at = timezone.now()
        invitation.save(update_fields=['status', 'accepted_by', 'accepted_at'])
        log_admin_event(organization=invitation.organization, actor=user, event_type='admin.invitation_accepted', message=f'Accepted invitation for {invitation.email}', request=request, metadata={'invitation': invitation.id, 'user': user.id})
        return response.Response({'ok': True, 'user': UserSerializer(user, context={'request': request}).data})

    def _invitation_from_token(self, token):
        if not token:
            return None
        for invitation in Invitation.objects.select_related('organization', 'team').filter(status=Invitation.Status.PENDING).exclude(token_hash=''):
            if check_password(token, invitation.token_hash):
                return invitation
        return None


class UserProfileViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'core_profile'
    queryset = UserProfile.objects.select_related('user').all().order_by('user__username')
    serializer_class = UserProfileSerializer
    permission_classes = [permissions.IsAuthenticated]
    organization_filter_paths = ['user__memberships__organization']

    @decorators.action(detail=False, methods=['get', 'patch'])
    def me(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if request.method == 'PATCH':
            serializer = self.get_serializer(profile, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save(user=request.user)
            return response.Response(serializer.data)
        return response.Response(self.get_serializer(profile).data)

    @decorators.action(detail=False, methods=['get'])
    def activity(self, request):
        organization_ids = list(request.user.memberships.values_list('organization_id', flat=True))
        events = AuditEvent.objects.filter(
            actor=request.user,
            organization_id__in=organization_ids,
        ).order_by('-created_at')[:50]
        sessions = request.user.hanmak_sessions.order_by('-last_seen_at', '-created_at')[:10]
        recoveries = request.user.hanmak_recovery_requests.order_by('-created_at')[:10]
        passkeys = request.user.mfa_devices.order_by('-created_at')[:10]
        return response.Response({
            'audit_events': [
                {
                    'id': event.id,
                    'event_type': event.event_type,
                    'message': event.message,
                    'severity': event.severity,
                    'created_at': event.created_at,
                }
                for event in events
            ],
            'sessions': UserSessionSerializer(sessions, many=True).data,
            'recovery_requests': AccountRecoveryRequestSerializer(recoveries, many=True).data,
            'mfa_devices': MFADeviceSerializer(passkeys, many=True).data,
        })

    @decorators.action(detail=False, methods=['post'])
    def change_password(self, request):
        old_password = request.data.get('old_password', '')
        new_password = request.data.get('new_password', '')
        confirm_password = request.data.get('confirm_password', '')
        if not request.user.check_password(old_password):
            return response.Response({'detail': 'Current password is incorrect.'}, status=400)
        if len(new_password) < 12:
            return response.Response({'detail': 'New password must be at least 12 characters.'}, status=400)
        if new_password != confirm_password:
            return response.Response({'detail': 'New passwords do not match.'}, status=400)
        request.user.set_password(new_password)
        request.user.save(update_fields=['password'])
        bump_auth_version(request.user)
        org = request.user.memberships.filter(is_active=True).select_related('organization').first()
        if org:
            log_admin_event(
                organization=org.organization,
                actor=request.user,
                event_type='user.password_changed',
                message='User changed their own password',
                request=request,
            )
        return response.Response({'detail': 'Password changed successfully.'})


class MFADeviceViewSet(viewsets.ModelViewSet):
    queryset = MFADevice.objects.select_related('user').all().order_by('-created_at')
    serializer_class = MFADeviceSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()
        if getattr(self, 'swagger_fake_view', False):
            return queryset
        if self.request.user.is_superuser:
            return queryset
        return queryset.filter(user=self.request.user)

    def get_permissions(self):
        if self.action in ['public_passkey_begin', 'public_passkey_finish', 'verify_totp_login']:
            return [permissions.AllowAny()]
        return super().get_permissions()

    @decorators.action(detail=False, methods=['post'])
    def verify_totp_login(self, request):
        import base64, hmac as _hmac, hashlib, struct, time as _time
        from django.contrib.auth import get_user_model
        username = (request.data.get('username') or '').strip()
        code = str(request.data.get('code') or '').strip()
        if not username or not code:
            return response.Response({'detail': 'username and code are required.'}, status=400)
        User = get_user_model()
        user = (
            User.objects.filter(username=username).first()
            or User.objects.filter(email=username).first()
        )
        if not user:
            return response.Response({'detail': 'Invalid credentials.'}, status=400)
        device = MFADevice.objects.filter(
            user=user, method=MFADevice.Method.TOTP, is_confirmed=True,
        ).first()
        if not device:
            return response.Response({'detail': 'No confirmed TOTP device for this account.'}, status=400)
        totp_secret = (device.metadata or {}).get('totp_secret', '')
        if totp_secret:
            try:
                key = base64.b32decode(totp_secret.upper().replace(' ', ''))
            except Exception:
                return response.Response({'detail': 'TOTP device configuration error.'}, status=400)
            ts = int(_time.time()) // 30
            valid = False
            for offset in range(-1, 2):
                counter = struct.pack('>Q', ts + offset)
                mac = _hmac.new(key, counter, hashlib.sha1).digest()
                idx = mac[-1] & 0xf
                otp = (struct.unpack('>I', mac[idx:idx+4])[0] & 0x7fffffff) % 1_000_000
                if str(otp).zfill(6) == code.zfill(6):
                    valid = True
                    break
            if not valid:
                return response.Response({'detail': 'Invalid or expired TOTP code.'}, status=400)
        else:
            from django.conf import settings as django_settings
            if not getattr(django_settings, 'DEBUG', False):
                return response.Response({'detail': 'TOTP not configured on this device.'}, status=400)
            if not (len(code) == 6 and code.isdigit()):
                return response.Response({'detail': 'Enter a 6-digit code.'}, status=400)
        device.last_used_at = timezone.now()
        device.save(update_fields=['last_used_at'])
        return response.Response({'ok': True, 'message': 'TOTP verified.'})

    @decorators.action(detail=False, methods=['post'])
    def totp_setup_begin(self, request):
        import base64, io, os, urllib.parse
        secret = base64.b32encode(os.urandom(20)).decode('ascii')
        device = MFADevice.objects.filter(
            user=request.user, method=MFADevice.Method.TOTP, is_confirmed=False,
        ).first()
        if device:
            device.metadata = {'totp_secret': secret}
            device.name = 'Authenticator App'
            device.save(update_fields=['metadata', 'name'])
        else:
            device = MFADevice.objects.create(
                user=request.user,
                name='Authenticator App',
                method=MFADevice.Method.TOTP,
                is_confirmed=False,
                metadata={'totp_secret': secret},
            )
        email = urllib.parse.quote(request.user.email or request.user.username)
        issuer = urllib.parse.quote('HanMak')
        otpauth_uri = f'otpauth://totp/HanMak:{email}?secret={secret}&issuer={issuer}'
        qr_data_url = None
        try:
            import qrcode
            qr = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=6, border=3)
            qr.add_data(otpauth_uri)
            qr.make(fit=True)
            img = qr.make_image(fill_color='black', back_color='white')
            buf = io.BytesIO()
            img.save(buf, format='PNG')
            qr_data_url = 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode('ascii')
        except Exception:
            pass
        return response.Response({'device_id': device.id, 'secret': secret, 'otpauth_uri': otpauth_uri, 'qr_data_url': qr_data_url})

    @decorators.action(detail=False, methods=['post'])
    def totp_setup_confirm(self, request):
        import base64, hmac as _hmac, hashlib, struct, time as _time
        device_id = request.data.get('device_id')
        code = str(request.data.get('code') or '').strip()
        if not device_id or not code:
            return response.Response({'detail': 'device_id and code are required.'}, status=400)
        device = MFADevice.objects.filter(
            id=device_id, user=request.user, method=MFADevice.Method.TOTP, is_confirmed=False,
        ).first()
        if not device:
            return response.Response({'detail': 'TOTP setup session not found or already confirmed.'}, status=400)
        totp_secret = (device.metadata or {}).get('totp_secret', '')
        if not totp_secret:
            return response.Response({'detail': 'TOTP secret missing — restart setup.'}, status=400)
        try:
            key = base64.b32decode(totp_secret.upper())
        except Exception:
            return response.Response({'detail': 'TOTP device configuration error.'}, status=400)
        ts = int(_time.time()) // 30
        valid = False
        for offset in range(-1, 2):
            counter = struct.pack('>Q', ts + offset)
            mac = _hmac.new(key, counter, hashlib.sha1).digest()
            idx = mac[-1] & 0xf
            otp = (struct.unpack('>I', mac[idx:idx+4])[0] & 0x7fffffff) % 1_000_000
            if str(otp).zfill(6) == code.zfill(6):
                valid = True
                break
        if not valid:
            return response.Response({'detail': 'Invalid TOTP code. Check your authenticator app and try again.'}, status=400)
        device.is_confirmed = True
        device.last_used_at = timezone.now()
        device.save(update_fields=['is_confirmed', 'last_used_at'])
        return response.Response(self.get_serializer(device).data)

    def perform_create(self, serializer):
        user = self.request.user if not self.request.user.is_superuser else serializer.validated_data.get('user', self.request.user)
        serializer.save(user=user)

    @decorators.action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        device = self.get_object()
        device.is_confirmed = True
        device.save(update_fields=['is_confirmed'])
        return response.Response(self.get_serializer(device).data)

    @decorators.action(detail=False, methods=['post'])
    def passkey_begin_registration(self, request):
        server = passkey_server(rp_id=request.get_host().split(':')[0])
        options, state = server.register_begin(
            user=passkey_user_entity(request.user),
            credentials=stored_attested_credentials(MFADevice.objects.filter(user=request.user, method=MFADevice.Method.WEBAUTHN)),
        )
        serialized_state = serialize_passkey_state(state)
        challenge = PasskeyChallenge.objects.create(
            user=request.user,
            challenge=serialized_state['challenge'],
            purpose=PasskeyChallenge.Purpose.REGISTRATION,
            metadata={'state': serialized_state, 'options': credential_creation_options_to_json(options)},
            expires_at=timezone.now() + timezone.timedelta(minutes=10),
        )
        data = PasskeyChallengeSerializer(challenge).data
        data['options'] = challenge.metadata['options']
        return response.Response(data)

    @decorators.action(detail=False, methods=['post'])
    def passkey_finish_registration(self, request):
        challenge_value = request.data.get('challenge')
        challenge = PasskeyChallenge.objects.filter(
            user=request.user,
            challenge=challenge_value,
            purpose=PasskeyChallenge.Purpose.REGISTRATION,
            consumed_at__isnull=True,
            expires_at__gt=timezone.now(),
        ).first()
        if not challenge:
            return response.Response({'detail': 'Passkey challenge is invalid or expired.'}, status=400)
        try:
            server = passkey_server(rp_id=request.get_host().split(':')[0])
            auth_data = server.register_complete(
                deserialize_passkey_state(challenge.metadata['state']),
                parse_registration_response(request.data.get('credential') or request.data),
            )
            credential_data = auth_data.credential_data
        except Exception as exc:
            return response.Response({'detail': f'Passkey attestation verification failed: {exc}'}, status=400)
        device = MFADevice.objects.create(
            user=request.user,
            name=request.data.get('name') or 'Passkey',
            method=MFADevice.Method.WEBAUTHN,
            is_confirmed=True,
            credential_id=credential_data.credential_id.hex(),
            public_key=bytes(credential_data).hex(),
            sign_count=getattr(auth_data, 'counter', 0) or 0,
            metadata={'aaguid': credential_data.aaguid.hex()},
        )
        challenge.consumed_at = timezone.now()
        challenge.metadata = {**challenge.metadata, 'credential': request.data.get('credential', {})}
        challenge.save(update_fields=['consumed_at', 'metadata'])
        return response.Response(self.get_serializer(device).data, status=201)

    @decorators.action(detail=False, methods=['post'])
    def passkey_begin_authentication(self, request):
        devices = MFADevice.objects.filter(user=request.user, method=MFADevice.Method.WEBAUTHN, is_confirmed=True)
        server = passkey_server(rp_id=request.get_host().split(':')[0])
        options, state = server.authenticate_begin(credentials=stored_attested_credentials(devices))
        serialized_state = serialize_passkey_state(state)
        challenge = PasskeyChallenge.objects.create(
            user=request.user,
            challenge=serialized_state['challenge'],
            purpose=PasskeyChallenge.Purpose.AUTHENTICATION,
            metadata={'state': serialized_state, 'options': credential_request_options_to_json(options)},
            expires_at=timezone.now() + timezone.timedelta(minutes=10),
        )
        data = PasskeyChallengeSerializer(challenge).data
        data['options'] = challenge.metadata['options']
        return response.Response(data)

    @decorators.action(detail=False, methods=['post'])
    def public_passkey_begin(self, request):
        username = (request.data.get('username') or '').strip()
        User = get_user_model()
        user = User.objects.filter(username__iexact=username).first() or User.objects.filter(email__iexact=username).first()
        if not user:
            return response.Response({'detail': 'No passkeys are available for this account.'}, status=404)
        devices = MFADevice.objects.filter(user=user, method=MFADevice.Method.WEBAUTHN, is_confirmed=True)
        if not devices.exists():
            return response.Response({'detail': 'No passkeys are available for this account.'}, status=404)
        server = passkey_server(rp_id=request.get_host().split(':')[0])
        options, state = server.authenticate_begin(credentials=stored_attested_credentials(devices))
        serialized_state = serialize_passkey_state(state)
        challenge = PasskeyChallenge.objects.create(
            user=user,
            challenge=serialized_state['challenge'],
            purpose=PasskeyChallenge.Purpose.AUTHENTICATION,
            metadata={'state': serialized_state, 'options': credential_request_options_to_json(options), 'public_login': True},
            expires_at=timezone.now() + timezone.timedelta(minutes=10),
        )
        data = PasskeyChallengeSerializer(challenge).data
        data['options'] = challenge.metadata['options']
        return response.Response(data)

    @decorators.action(detail=False, methods=['post'])
    def public_passkey_finish(self, request):
        challenge = PasskeyChallenge.objects.select_related('user').filter(
            challenge=request.data.get('challenge', ''),
            purpose=PasskeyChallenge.Purpose.AUTHENTICATION,
            consumed_at__isnull=True,
            expires_at__gt=timezone.now(),
            metadata__public_login=True,
        ).first()
        if not challenge:
            return response.Response({'detail': 'Passkey challenge is invalid or expired.'}, status=400)
        user = challenge.user
        devices = MFADevice.objects.filter(user=user, method=MFADevice.Method.WEBAUTHN, is_confirmed=True)
        try:
            server = passkey_server(rp_id=request.get_host().split(':')[0])
            assertion = parse_authentication_response(request.data.get('credential') or request.data)
            credential = server.authenticate_complete(
                deserialize_passkey_state(challenge.metadata['state']),
                stored_attested_credentials(devices),
                assertion,
            )
        except Exception as exc:
            return response.Response({'detail': f'Passkey assertion verification failed: {exc}'}, status=400)
        device = devices.filter(credential_id=credential.credential_id.hex()).first()
        if device:
            device.last_used_at = timezone.now()
            counter = getattr(getattr(assertion.response, 'authenticator_data', None), 'counter', None)
            if counter is not None:
                device.sign_count = counter
                device.save(update_fields=['last_used_at', 'sign_count'])
            else:
                device.save(update_fields=['last_used_at'])
        challenge.consumed_at = timezone.now()
        challenge.save(update_fields=['consumed_at'])
        refresh = RefreshToken.for_user(user)
        refresh['auth_version'] = current_auth_version(user)
        return response.Response({
            'refresh': str(refresh),
            'access': str(refresh.access_token),
            'user': UserSerializer(user, context={'request': request}).data,
            'device': device.id if device else None,
        })

    @decorators.action(detail=False, methods=['post'])
    def passkey_finish_authentication(self, request):
        challenge = PasskeyChallenge.objects.filter(
            user=request.user,
            challenge=request.data.get('challenge', ''),
            purpose=PasskeyChallenge.Purpose.AUTHENTICATION,
            consumed_at__isnull=True,
            expires_at__gt=timezone.now(),
        ).first()
        if not challenge:
            return response.Response({'detail': 'Passkey challenge is invalid or expired.'}, status=400)
        devices = MFADevice.objects.filter(user=request.user, method=MFADevice.Method.WEBAUTHN, is_confirmed=True)
        try:
            server = passkey_server(rp_id=request.get_host().split(':')[0])
            assertion = parse_authentication_response(request.data.get('credential') or request.data)
            credential = server.authenticate_complete(
                deserialize_passkey_state(challenge.metadata['state']),
                stored_attested_credentials(devices),
                assertion,
            )
        except Exception as exc:
            return response.Response({'detail': f'Passkey assertion verification failed: {exc}'}, status=400)
        device = devices.filter(credential_id=credential.credential_id.hex()).first()
        if device:
            device.last_used_at = timezone.now()
            counter = getattr(getattr(assertion.response, 'authenticator_data', None), 'counter', None)
            if counter is not None:
                device.sign_count = counter
                device.save(update_fields=['last_used_at', 'sign_count'])
            else:
                device.save(update_fields=['last_used_at'])
        challenge.consumed_at = timezone.now()
        challenge.save(update_fields=['consumed_at'])
        return response.Response({'ok': True, 'device': device.id if device else None})


class NotificationPreferenceViewSet(viewsets.ModelViewSet):
    feature_flag_key = 'settings_notifications'
    queryset = NotificationPreference.objects.select_related('user').all().order_by('event_type')
    serializer_class = NotificationPreferenceSerializer
    permission_classes = [permissions.IsAuthenticated]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if not feature_flag_allows_request(request, self):
            raise PermissionDenied('The "settings_notifications" feature is not released for this organization.')

    def get_queryset(self):
        queryset = super().get_queryset()
        if getattr(self, 'swagger_fake_view', False):
            return queryset
        if self.request.user.is_superuser:
            return queryset
        return queryset.filter(user=self.request.user)

    def perform_create(self, serializer):
        user = self.request.user if not self.request.user.is_superuser else serializer.validated_data.get('user', self.request.user)
        serializer.save(user=user)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user if not request.user.is_superuser else serializer.validated_data.get('user', request.user)
        preference, created = NotificationPreference.objects.update_or_create(
            user=user,
            event_type=serializer.validated_data['event_type'],
            defaults={
                'email_enabled': serializer.validated_data.get('email_enabled', True),
                'in_app_enabled': serializer.validated_data.get('in_app_enabled', True),
                'digest_enabled': serializer.validated_data.get('digest_enabled', False),
            },
        )
        return response.Response(self.get_serializer(preference).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class UserSessionViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = UserSession.objects.select_related('user').all().order_by('-last_seen_at', '-created_at')
    serializer_class = UserSessionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()
        if getattr(self, 'swagger_fake_view', False):
            return queryset
        if self.request.user.is_superuser:
            return queryset
        return queryset.filter(user=self.request.user)

    @decorators.action(detail=True, methods=['post'])
    def revoke(self, request, pk=None):
        session = self.get_object()
        session.revoked_at = timezone.now()
        session.save(update_fields=['revoked_at'])
        bump_auth_version(session.user)
        return response.Response(self.get_serializer(session).data)

    @decorators.action(detail=False, methods=['post'])
    def revoke_others(self, request):
        current_session_id = request.data.get('current_session')
        queryset = self.get_queryset().filter(user=request.user, revoked_at__isnull=True)
        if current_session_id:
            queryset = queryset.exclude(id=current_session_id)
        count = queryset.update(revoked_at=timezone.now())
        bump_auth_version(request.user)
        return response.Response({'ok': True, 'revoked_count': count})


class ObjectPermissionViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'admin_roles'
    queryset = ObjectPermission.objects.select_related('organization', 'user', 'team', 'content_type', 'granted_by').all().order_by('-created_at')
    serializer_class = ObjectPermissionSerializer
    permission_classes = [OrganizationRolePermission]
    write_roles = OrganizationRolePermission.write_roles

    def perform_create(self, serializer):
        self._assert_related_organization_access(serializer)
        serializer.save(granted_by=self.request.user)


class AccountRecoveryRequestViewSet(viewsets.ModelViewSet):
    queryset = AccountRecoveryRequest.objects.select_related('user').all().order_by('-created_at')
    serializer_class = AccountRecoveryRequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action in ['request_reset', 'inspect_token', 'complete']:
            return [permissions.AllowAny()]
        return super().get_permissions()

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.request.user.is_superuser:
            return queryset
        return queryset.filter(user=self.request.user)

    @decorators.action(detail=False, methods=['post'])
    def begin(self, request):
        token = secrets.token_urlsafe(32)
        recovery = AccountRecoveryRequest.objects.create(
            user=request.user,
            token_hash=make_password(token),
            ip_address=request.META.get('REMOTE_ADDR'),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
            expires_at=timezone.now() + timezone.timedelta(hours=1),
        )
        data = self.get_serializer(recovery).data
        return response.Response(data, status=201)

    @decorators.action(detail=False, methods=['post'])
    def request_reset(self, request):
        email = (request.data.get('email') or '').strip().lower()
        if not email:
            return response.Response({'email': 'Email is required.'}, status=400)
        user = get_user_model().objects.filter(email__iexact=email, is_active=True).first()
        if user:
            organization = user.memberships.select_related('organization').first().organization if user.memberships.exists() else None
            queue = UserViewSet()
            queue.request = request
            queue._queue_setup_email(organization, user, request)
        return response.Response({
            'ok': True,
            'detail': 'If that email belongs to an active account, a password reset link has been queued.',
            'recovery_window_minutes': 60,
            'next_steps': [
                'Open the recovery email and create a new password before the link expires.',
                'Use MFA/passkey after reset if your account requires a second factor.',
                'Ask an administrator to cancel existing setup tokens if you did not request recovery.',
            ],
        })

    @decorators.action(detail=False, methods=['post'])
    def inspect_token(self, request):
        recovery = self._recovery_from_token(request.data.get('token', ''))
        if not recovery:
            return response.Response({'detail': 'Setup token is invalid.'}, status=400)
        if recovery.expires_at <= timezone.now():
            recovery.status = AccountRecoveryRequest.Status.EXPIRED
            recovery.save(update_fields=['status'])
            return response.Response({'detail': 'Setup token has expired.', 'status': AccountRecoveryRequest.Status.EXPIRED}, status=400)
        return response.Response({
            'ok': True,
            'user': UserSerializer(recovery.user, context={'request': request}).data,
            'expires_at': recovery.expires_at,
            'recovery_window_minutes': max(int((recovery.expires_at - timezone.now()).total_seconds() // 60), 0),
        })

    @decorators.action(detail=False, methods=['post'])
    def complete(self, request):
        recovery = self._recovery_from_token(request.data.get('token', ''))
        if not recovery:
            return response.Response({'detail': 'Setup token is invalid.'}, status=400)
        if recovery.expires_at <= timezone.now():
            recovery.status = AccountRecoveryRequest.Status.EXPIRED
            recovery.save(update_fields=['status'])
            return response.Response({'detail': 'Setup token has expired.'}, status=400)
        password = request.data.get('password', '')
        if len(password) < 8:
            return response.Response({'password': 'Password must be at least 8 characters.'}, status=400)
        user = recovery.user
        user.set_password(password)
        user.is_active = True
        user.save(update_fields=['password', 'is_active'])
        bump_auth_version(user)
        recovery.status = AccountRecoveryRequest.Status.USED
        recovery.used_at = timezone.now()
        recovery.save(update_fields=['status', 'used_at'])
        organization = user.memberships.select_related('organization').first().organization if user.memberships.exists() else None
        if organization:
            log_admin_event(organization=organization, actor=user, event_type='admin.setup_completed', message=f'Completed setup for {user.email}', request=request, metadata={'user': user.id, 'recovery_request': recovery.id})
        return response.Response({'ok': True, 'user': UserSerializer(user, context={'request': request}).data})

    def _recovery_from_token(self, token):
        if not token:
            return None
        for recovery in AccountRecoveryRequest.objects.select_related('user').filter(status=AccountRecoveryRequest.Status.PENDING):
            if check_password(token, recovery.token_hash):
                return recovery
        return None


class RecoveryCodeViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = RecoveryCode.objects.select_related('user').all().order_by('-created_at')
    serializer_class = RecoveryCodeSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.request.user.is_superuser:
            return queryset
        return queryset.filter(user=self.request.user)

    @decorators.action(detail=False, methods=['post'])
    def rotate(self, request):
        RecoveryCode.objects.filter(user=request.user, used_at__isnull=True).delete()
        raw_codes = [secrets.token_hex(4) for _ in range(10)]
        for code in raw_codes:
            RecoveryCode.objects.create(user=request.user, code_hash=make_password(code))
        return response.Response({'codes': raw_codes})
