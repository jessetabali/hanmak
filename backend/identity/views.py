import hashlib
import secrets
import base64
from urllib.parse import urlencode

import jwt
import requests
from django.contrib.auth import get_user_model
from django.utils import timezone
from lxml import etree
from rest_framework import decorators, permissions, response, viewsets
from signxml import XMLVerifier

from accounts.permissions import OrganizationScopedQuerySetMixin
from accounts.models import Membership, Organization, Team

from .models import JITProvisioningSettings, LDAPConnection, SCIMConnection, SCIMExternalIdentity, SocialProvider, SSOConnection, SSOState
from .serializers import (
    JITProvisioningSettingsSerializer,
    LDAPConnectionSerializer,
    SCIMConnectionSerializer,
    SCIMExternalIdentitySerializer,
    SocialProviderSerializer,
    SSOConnectionSerializer,
    SSOStateSerializer,
)


class SSOConnectionViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'identity_sso_scim'
    queryset = SSOConnection.objects.select_related('organization').all().order_by('name')
    serializer_class = SSOConnectionSerializer
    permission_classes = [permissions.IsAuthenticated]

    @decorators.action(detail=True, methods=['post'])
    def test(self, request, pk=None):
        connection = self.get_object()
        validation = self._config_validation(connection)
        status_code = 200 if validation['ok'] else 400
        return response.Response({'id': connection.id, **validation}, status=status_code)

    @decorators.action(detail=True, methods=['get'])
    def validate_config(self, request, pk=None):
        connection = self.get_object()
        return response.Response({'id': connection.id, **self._config_validation(connection)})

    @decorators.action(detail=True, methods=['post'])
    def refresh_oidc_metadata(self, request, pk=None):
        connection = self.get_object()
        if connection.provider_type != SSOConnection.ProviderType.OIDC:
            return response.Response({'detail': 'This action is only available for OIDC connections.'}, status=400)
        issuer = request.data.get('issuer') or (connection.config or {}).get('issuer') or connection.metadata_url
        if not issuer:
            return response.Response({'detail': 'issuer or metadata_url is required.'}, status=400)
        url = issuer.rstrip('/')
        if not url.endswith('/.well-known/openid-configuration'):
            url = f'{url}/.well-known/openid-configuration'
        try:
            metadata_response = requests.get(url, timeout=10)
            metadata_response.raise_for_status()
            metadata = metadata_response.json()
        except requests.RequestException as exc:
            return response.Response({'detail': f'OIDC metadata fetch failed: {exc}'}, status=400)
        config = {**(connection.config or {})}
        for source, target in [
            ('issuer', 'issuer'),
            ('authorization_endpoint', 'authorization_endpoint'),
            ('token_endpoint', 'token_endpoint'),
            ('userinfo_endpoint', 'userinfo_endpoint'),
            ('jwks_uri', 'jwks_uri'),
        ]:
            if metadata.get(source):
                config[target] = metadata[source]
        if metadata.get('id_token_signing_alg_values_supported'):
            config['algorithms'] = metadata['id_token_signing_alg_values_supported']
        config.setdefault('login_mapping', self._default_login_mapping(connection))
        connection.config = config
        connection.metadata_url = url
        connection.save(update_fields=['config', 'metadata_url', 'updated_at'])
        return response.Response(self.get_serializer(connection).data)

    @decorators.action(detail=True, methods=['get', 'patch'], url_path='mapping-policy')
    def mapping_policy(self, request, pk=None):
        connection = self.get_object()
        config = {**(connection.config or {})}
        mapping = {**self._default_login_mapping(connection), **(config.get('login_mapping') or {})}
        if request.method == 'PATCH':
            incoming = {
                key: value for key, value in request.data.items()
                if key in mapping
            }
            mapping.update(incoming)
            config['login_mapping'] = mapping
            connection.config = config
            connection.save(update_fields=['config', 'updated_at'])
        return response.Response({
            'connection': connection.id,
            'provider_type': connection.provider_type,
            'login_mapping': mapping,
        })

    def _default_login_mapping(self, connection):
        if connection.provider_type == SSOConnection.ProviderType.SAML:
            return {
                'subject_claim': 'NameID',
                'email_claim': 'email',
                'name_claim': 'displayName',
                'auto_link_verified_email': False,
                'jit_provisioning': False,
                'default_role': Membership.Role.SIGNER,
            }
        return {
            'subject_claim': 'sub',
            'email_claim': 'email',
            'name_claim': 'name',
            'auto_link_verified_email': False,
            'jit_provisioning': False,
            'default_role': Membership.Role.SIGNER,
        }

    def _config_validation(self, connection):
        config = connection.config or {}
        if connection.provider_type == SSOConnection.ProviderType.OIDC:
            required = ['client_id', 'issuer', 'authorization_endpoint', 'token_endpoint']
            if not config.get('jwks_uri') and not config.get('client_secret'):
                required.append('jwks_uri')
        elif connection.provider_type == SSOConnection.ProviderType.SAML:
            required = ['entity_id', 'acs_url', 'x509_cert']
        else:
            required = []
        missing = [field for field in required if not config.get(field)]
        mapping = {**self._default_login_mapping(connection), **(config.get('login_mapping') or {})}
        mapping_missing = [field for field in ['subject_claim', 'email_claim', 'default_role'] if not mapping.get(field)]
        return {
            'ok': not missing and not mapping_missing,
            'missing_fields': missing,
            'missing_mapping_fields': mapping_missing,
            'login_mapping': mapping,
            'message': 'Configuration shape is valid' if not missing else 'Configuration is missing required fields.',
        }

    @decorators.action(detail=True, methods=['post'])
    def oidc_authorize(self, request, pk=None):
        connection = self.get_object()
        if connection.provider_type != SSOConnection.ProviderType.OIDC:
            return response.Response({'detail': 'This action is only available for OIDC connections.'}, status=400)
        config = connection.config or {}
        state = SSOState.objects.create(
            connection=connection,
            user=request.user,
            state=secrets.token_urlsafe(32),
            nonce=secrets.token_urlsafe(32),
            redirect_uri=request.data.get('redirect_uri') or config.get('redirect_uri', ''),
            expires_at=timezone.now() + timezone.timedelta(minutes=10),
        )
        params = {
            'client_id': config.get('client_id', ''),
            'redirect_uri': state.redirect_uri,
            'response_type': 'code',
            'scope': config.get('scope', 'openid email profile'),
            'state': state.state,
            'nonce': state.nonce,
        }
        authorize_url = config.get('authorization_endpoint', '')
        return response.Response({'authorization_url': f'{authorize_url}?{urlencode(params)}', 'state': SSOStateSerializer(state).data})

    @decorators.action(detail=True, methods=['post'])
    def oidc_callback(self, request, pk=None):
        connection = self.get_object()
        if connection.provider_type != SSOConnection.ProviderType.OIDC:
            return response.Response({'detail': 'This action is only available for OIDC connections.'}, status=400)
        state = SSOState.objects.filter(
            connection=connection,
            state=request.data.get('state', ''),
            consumed_at__isnull=True,
            expires_at__gt=timezone.now(),
        ).first()
        if not state:
            return response.Response({'detail': 'SSO state is invalid or expired.'}, status=400)
        config = connection.config or {}
        try:
            token_response = {}
            if request.data.get('code'):
                if not config.get('token_endpoint'):
                    return response.Response({'detail': 'token_endpoint is required for OIDC code exchange.'}, status=400)
                token_payload = {
                    'grant_type': 'authorization_code',
                    'code': request.data['code'],
                    'redirect_uri': state.redirect_uri,
                    'client_id': config.get('client_id', ''),
                    'client_secret': config.get('client_secret', ''),
                }
                token_http_response = requests.post(config['token_endpoint'], data=token_payload, timeout=10)
                token_http_response.raise_for_status()
                token_response = token_http_response.json()
            id_token = request.data.get('id_token') or token_response.get('id_token')
            if not id_token:
                return response.Response({'detail': 'id_token is required after OIDC callback.'}, status=400)
            claims = self._validate_oidc_id_token(id_token, config)
            if state.nonce and claims.get('nonce') != state.nonce:
                return response.Response({'detail': 'OIDC nonce validation failed.'}, status=400)
            subject, email = self._extract_login_identity(connection, claims)
        except requests.RequestException as exc:
            return response.Response({'detail': f'OIDC token exchange failed: {exc}'}, status=400)
        except jwt.PyJWTError as exc:
            return response.Response({'detail': f'OIDC ID-token validation failed: {exc}'}, status=400)
        except Exception as exc:
            return response.Response({'detail': f'OIDC callback failed: {exc}'}, status=400)
        state.consumed_at = timezone.now()
        state.save(update_fields=['consumed_at'])
        return response.Response({
            'ok': True,
            'connection': connection.id,
            'subject': subject,
            'email': email,
            'claims': claims,
        })

    def _validate_oidc_id_token(self, id_token, config):
        client_id = config.get('client_id')
        issuer = config.get('issuer')
        algorithms = config.get('algorithms') or ['RS256']
        if not client_id:
            raise jwt.InvalidTokenError('client_id is required.')
        if config.get('jwks_uri'):
            signing_key = jwt.PyJWKClient(config['jwks_uri']).get_signing_key_from_jwt(id_token)
            return jwt.decode(
                id_token,
                signing_key.key,
                algorithms=algorithms,
                audience=client_id,
                issuer=issuer,
                options={'verify_at_hash': False},
            )
        if any(algorithm.startswith('HS') for algorithm in algorithms) and config.get('client_secret'):
            return jwt.decode(
                id_token,
                config['client_secret'],
                algorithms=algorithms,
                audience=client_id,
                issuer=issuer,
                options={'verify_at_hash': False},
            )
        raise jwt.InvalidTokenError('jwks_uri is required for asymmetric OIDC ID-token validation.')

    @decorators.action(detail=True, methods=['post'])
    def saml_acs(self, request, pk=None):
        connection = self.get_object()
        if connection.provider_type != SSOConnection.ProviderType.SAML:
            return response.Response({'detail': 'This action is only available for SAML connections.'}, status=400)
        config = connection.config or {}
        saml_response = request.data.get('SAMLResponse')
        x509_cert = config.get('x509_cert') or config.get('idp_x509_cert')
        if not saml_response:
            return response.Response({'detail': 'SAMLResponse is required.'}, status=400)
        if not x509_cert:
            return response.Response({'detail': 'x509_cert is required for SAML signature validation.'}, status=400)
        try:
            xml = base64.b64decode(saml_response)
            verified = XMLVerifier().verify(xml, x509_cert=x509_cert).signed_xml
            name_ids = verified.xpath(
                '//*[local-name()="NameID"]/text()',
            )
            attributes = {}
            for attribute in verified.xpath('//*[local-name()="Attribute"]'):
                name = attribute.get('Name') or attribute.get('FriendlyName')
                values = attribute.xpath('./*[local-name()="AttributeValue"]/text()')
                if name:
                    attributes[name] = values[0] if len(values) == 1 else values
        except (ValueError, etree.XMLSyntaxError) as exc:
            return response.Response({'detail': f'SAML response parsing failed: {exc}'}, status=400)
        except Exception as exc:
            return response.Response({'detail': f'SAML signature validation failed: {exc}'}, status=400)
        subject, email = self._extract_login_identity(connection, {**attributes, 'NameID': name_ids[0] if name_ids else ''})
        return response.Response({
            'ok': True,
            'connection': connection.id,
            'subject': subject,
            'email': email,
            'attributes': attributes,
        })

    def _extract_login_identity(self, connection, claims):
        mapping = {**self._default_login_mapping(connection), **((connection.config or {}).get('login_mapping') or {})}
        subject = claims.get(mapping.get('subject_claim')) or claims.get('sub') or claims.get('NameID') or ''
        email = claims.get(mapping.get('email_claim')) or claims.get('email') or ''
        return subject, email


class SCIMConnectionViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'identity_sso_scim'
    queryset = SCIMConnection.objects.select_related('organization').all().order_by('organization__name')
    serializer_class = SCIMConnectionSerializer
    permission_classes = [permissions.IsAuthenticated]

    @decorators.action(detail=True, methods=['post'], url_path='rotate-token')
    def rotate_token(self, request, pk=None):
        connection = self.get_object()
        plaintext = 'scim_' + secrets.token_urlsafe(32)
        connection.token_prefix = plaintext[:14]
        connection.token_hash = hashlib.sha256(plaintext.encode()).hexdigest()
        connection.save(update_fields=['token_prefix', 'token_hash'])
        return response.Response({'token': plaintext, 'token_prefix': connection.token_prefix})


class SCIMExternalIdentityViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'identity_sso_scim'
    queryset = SCIMExternalIdentity.objects.select_related('organization').all()
    serializer_class = SCIMExternalIdentitySerializer
    permission_classes = [permissions.IsAuthenticated]

    @decorators.action(detail=False, methods=['post'], url_path='provision-user')
    def provision_user(self, request):
        organization_id = request.data.get('organization')
        email = request.data.get('userName') or request.data.get('email')
        external_id = request.data.get('externalId') or request.data.get('id')
        if not organization_id or not email or not external_id:
            return response.Response({'detail': 'organization, userName/email, and externalId/id are required.'}, status=400)
        organization = Organization.objects.filter(id=organization_id).first()
        if not organization:
            return response.Response({'detail': 'Organization not found.'}, status=404)
        identity, _ = SCIMExternalIdentity.objects.update_or_create(
            organization_id=organization_id,
            provider='scim',
            external_id=external_id,
            defaults={'user_email': email, 'raw': request.data},
        )
        User = get_user_model()
        active = request.data.get('active', True)
        user, _ = User.objects.get_or_create(username=email, defaults={'email': email, 'is_active': bool(active)})
        if user.email != email or user.is_active != bool(active):
            user.email = email
            user.is_active = bool(active)
            user.save(update_fields=['email', 'is_active'])
        membership, _ = Membership.objects.update_or_create(
            user=user,
            organization=organization,
            defaults={'is_active': bool(active), 'role': request.data.get('role') or Membership.Role.SIGNER},
        )
        return response.Response({
            'identity': SCIMExternalIdentitySerializer(identity).data,
            'user': {'id': user.id, 'email': user.email, 'username': user.username, 'is_active': user.is_active},
            'membership': {'id': membership.id, 'organization': organization.id, 'is_active': membership.is_active, 'role': membership.role},
        })

    @decorators.action(detail=False, methods=['post'], url_path='provision-group')
    def provision_group(self, request):
        organization_id = request.data.get('organization')
        external_id = request.data.get('externalId') or request.data.get('id')
        display_name = request.data.get('displayName') or request.data.get('name')
        if not organization_id or not external_id or not display_name:
            return response.Response({'detail': 'organization, externalId/id, and displayName/name are required.'}, status=400)
        organization = Organization.objects.filter(id=organization_id).first()
        if not organization:
            return response.Response({'detail': 'Organization not found.'}, status=404)
        team, _ = Team.objects.update_or_create(
            organization=organization,
            name=display_name,
            defaults={'description': request.data.get('description', 'Provisioned by SCIM')},
        )
        identity, _ = SCIMExternalIdentity.objects.update_or_create(
            organization=organization,
            provider='scim_group',
            external_id=external_id,
            defaults={'user_email': f'group-{team.id}@scim.local', 'raw': request.data},
        )
        members = request.data.get('members') or []
        linked = 0
        for member in members:
            email = member.get('value') or member.get('email')
            if not email:
                continue
            membership = Membership.objects.filter(organization=organization, user__email__iexact=email).first()
            if membership:
                membership.team = team
                membership.save(update_fields=['team'])
                linked += 1
        return response.Response({
            'identity': SCIMExternalIdentitySerializer(identity).data,
            'team': {'id': team.id, 'name': team.name, 'organization': organization.id},
            'linked_members': linked,
        })


class LDAPConnectionViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'identity_sso_scim'
    queryset = LDAPConnection.objects.select_related('organization').all()
    serializer_class = LDAPConnectionSerializer
    permission_classes = [permissions.IsAuthenticated]

    @decorators.action(detail=True, methods=['post'])
    def test(self, request, pk=None):
        ldap = self.get_object()
        try:
            import ldap3
            server = ldap3.Server(ldap.host, port=ldap.port, use_ssl=ldap.use_ssl, connect_timeout=5)
            conn = ldap3.Connection(
                server,
                user=ldap.bind_dn or None,
                password=ldap.bind_password or None,
                auto_bind=True,
            )
            conn.unbind()
            return response.Response({'ok': True, 'message': 'LDAP bind succeeded.'})
        except ImportError:
            return response.Response({'ok': False, 'message': 'ldap3 library not installed.'}, status=400)
        except Exception as exc:
            return response.Response({'ok': False, 'message': str(exc)}, status=400)


class JITProvisioningSettingsViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'identity_sso_scim'
    queryset = JITProvisioningSettings.objects.select_related('organization').all()
    serializer_class = JITProvisioningSettingsSerializer
    permission_classes = [permissions.IsAuthenticated]

    def create(self, request, *args, **kwargs):
        organization_id = request.data.get('organization')
        instance = self.get_queryset().filter(organization_id=organization_id).first()
        if instance:
            serializer = self.get_serializer(instance, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return response.Response(serializer.data)
        return super().create(request, *args, **kwargs)


class SocialProviderViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'identity_sso_scim'
    queryset = SocialProvider.objects.select_related('organization').all().order_by('provider_type')
    serializer_class = SocialProviderSerializer
    permission_classes = [permissions.IsAuthenticated]
