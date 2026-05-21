"""
Security hardening tests — rate limiting and security headers.

Throttle tests use override_settings to set limits to '3/min' so they
trigger quickly without flooding the cache backend.
"""
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import Membership, Organization

User = get_user_model()

TIGHT_THROTTLE = {
    'login':          '3/min',
    'token_refresh':  '3/min',
    'public_signing': '3/min',
    'account_setup':  '3/min',
    'password_reset': '3/min',
    'anon':           '100/min',
    'user':           '1000/min',
}


@override_settings(
    REST_FRAMEWORK={
        **{},  # pulled in below
        'DEFAULT_THROTTLE_CLASSES': [
            'rest_framework.throttling.AnonRateThrottle',
            'rest_framework.throttling.UserRateThrottle',
        ],
        'DEFAULT_THROTTLE_RATES': TIGHT_THROTTLE,
        'DEFAULT_AUTHENTICATION_CLASSES': ['accounts.auth.HanMakJWTAuthentication'],
        'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.IsAuthenticated'],
        'DEFAULT_FILTER_BACKENDS': [],
        'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
        'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
        'PAGE_SIZE': 20,
    },
    CACHES={
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        }
    },
)
class LoginThrottleTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        User.objects.create_user(username='alice', password='pass')

    def tearDown(self):
        cache.clear()

    def test_login_throttled_after_limit(self):
        for _ in range(3):
            self.client.post('/api/v1/auth/login/', {'username': 'alice', 'password': 'wrong'}, format='json')
        response = self.client.post('/api/v1/auth/login/', {'username': 'alice', 'password': 'wrong'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_successful_login_before_limit(self):
        response = self.client.post('/api/v1/auth/login/', {'username': 'alice', 'password': 'pass'}, format='json')
        self.assertIn(response.status_code, [status.HTTP_200_OK, status.HTTP_400_BAD_REQUEST])
        self.assertNotEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_throttle_response_has_retry_after_header(self):
        for _ in range(4):
            r = self.client.post('/api/v1/auth/login/', {'username': 'alice', 'password': 'wrong'}, format='json')
        self.assertEqual(r.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertIn('Retry-After', r)


@override_settings(
    REST_FRAMEWORK={
        'DEFAULT_THROTTLE_CLASSES': [
            'rest_framework.throttling.AnonRateThrottle',
            'rest_framework.throttling.UserRateThrottle',
        ],
        'DEFAULT_THROTTLE_RATES': TIGHT_THROTTLE,
        'DEFAULT_AUTHENTICATION_CLASSES': ['accounts.auth.HanMakJWTAuthentication'],
        'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.IsAuthenticated'],
        'DEFAULT_FILTER_BACKENDS': [],
        'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
        'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
        'PAGE_SIZE': 20,
    },
    CACHES={
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        }
    },
)
class PublicSigningThrottleTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()

    def tearDown(self):
        cache.clear()

    def test_public_signing_throttled_after_limit(self):
        for _ in range(3):
            self.client.get('/api/v1/sign/nonexistent-token/')
        response = self.client.get('/api/v1/sign/nonexistent-token/')
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_public_signing_download_throttled_after_limit(self):
        for _ in range(3):
            self.client.get('/api/v1/sign/nonexistent-token/download/')
        response = self.client.get('/api/v1/sign/nonexistent-token/download/')
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)


class SecurityHeaderTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='alice', password='pass')
        self.org = Organization.objects.create(name='Test Org', slug='test')
        Membership.objects.create(user=self.user, organization=self.org, role=Membership.Role.ADMIN)
        self.client.force_authenticate(self.user)

    def test_x_content_type_options_nosniff(self):
        response = self.client.get('/api/v1/envelopes/')
        self.assertEqual(response.get('X-Content-Type-Options'), 'nosniff')

    def test_x_frame_options_deny(self):
        response = self.client.get('/api/v1/envelopes/')
        self.assertEqual(response.get('X-Frame-Options'), 'DENY')

    def test_basic_auth_not_available_in_test_mode(self):
        # In test/DEBUG mode BasicAuth may be enabled, but in production it must not be.
        # Verify the setting is controlled by DEBUG, not hardcoded.
        from django.conf import settings
        auth_classes = settings.REST_FRAMEWORK.get('DEFAULT_AUTHENTICATION_CLASSES', [])
        basic_auth = 'rest_framework.authentication.BasicAuthentication'
        if not settings.DEBUG:
            self.assertNotIn(basic_auth, auth_classes)
