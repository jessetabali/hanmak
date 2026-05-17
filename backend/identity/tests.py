import base64

import jwt
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import Membership, Organization
from identity.models import SSOConnection, SSOState


class SSOValidationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.user = User.objects.create_user(username='sso-admin', password='pass')
        self.organization = Organization.objects.create(name='SSO Org', slug='sso-org')
        Membership.objects.create(user=self.user, organization=self.organization, role=Membership.Role.ADMIN)
        self.client.force_authenticate(self.user)

    def test_oidc_callback_validates_hs_signed_id_token_and_nonce(self):
        connection = SSOConnection.objects.create(
            organization=self.organization,
            name='OIDC',
            provider_type=SSOConnection.ProviderType.OIDC,
            config={
                'client_id': 'hanmak-client',
                'client_secret': 'oidc-secret-for-tests-with-enough-length',
                'issuer': 'https://idp.example.test',
                'algorithms': ['HS256'],
            },
        )
        state = SSOState.objects.create(
            connection=connection,
            user=self.user,
            state='state-token',
            nonce='nonce-token',
            redirect_uri='http://testserver/callback',
            expires_at=timezone.now() + timezone.timedelta(minutes=5),
        )
        token = jwt.encode(
            {
                'sub': 'user-123',
                'email': 'person@example.com',
                'aud': 'hanmak-client',
                'iss': 'https://idp.example.test',
                'nonce': state.nonce,
            },
            'oidc-secret-for-tests-with-enough-length',
            algorithm='HS256',
        )

        response = self.client.post(f'/api/v1/sso-connections/{connection.id}/oidc_callback/', {
            'state': state.state,
            'id_token': token,
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['subject'], 'user-123')
        state.refresh_from_db()
        self.assertIsNotNone(state.consumed_at)

    def test_saml_acs_requires_signed_response_configuration(self):
        connection = SSOConnection.objects.create(
            organization=self.organization,
            name='SAML',
            provider_type=SSOConnection.ProviderType.SAML,
        )
        saml_response = base64.b64encode(b'<Response/>').decode()

        response = self.client.post(f'/api/v1/sso-connections/{connection.id}/saml_acs/', {
            'SAMLResponse': saml_response,
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('x509_cert', response.data['detail'])

    def test_sso_mapping_policy_can_be_updated_and_validated(self):
        connection = SSOConnection.objects.create(
            organization=self.organization,
            name='OIDC',
            provider_type=SSOConnection.ProviderType.OIDC,
            config={
                'client_id': 'hanmak-client',
                'client_secret': 'oidc-secret-for-tests-with-enough-length',
                'issuer': 'https://idp.example.test',
                'authorization_endpoint': 'https://idp.example.test/auth',
                'token_endpoint': 'https://idp.example.test/token',
            },
        )

        update = self.client.patch(f'/api/v1/sso-connections/{connection.id}/mapping-policy/', {
            'email_claim': 'preferred_username',
            'jit_provisioning': True,
        }, format='json')
        validation = self.client.get(f'/api/v1/sso-connections/{connection.id}/validate_config/')

        self.assertEqual(update.status_code, status.HTTP_200_OK)
        self.assertEqual(update.data['login_mapping']['email_claim'], 'preferred_username')
        self.assertTrue(validation.data['ok'])
        self.assertTrue(validation.data['login_mapping']['jit_provisioning'])
