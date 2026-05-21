from rest_framework.settings import api_settings
from rest_framework.throttling import AnonRateThrottle


class _ScopedThrottle(AnonRateThrottle):
    """
    Base class that reads its rate from api_settings on every request rather
    than caching it as a class attribute.  This ensures override_settings
    works correctly in tests when DEFAULT_THROTTLE_RATES is swapped out.
    """

    def get_rate(self):
        return api_settings.DEFAULT_THROTTLE_RATES.get(self.scope)


class LoginRateThrottle(_ScopedThrottle):
    """10 login attempts per minute per IP — brute-force protection."""
    scope = 'login'


class TokenRefreshRateThrottle(_ScopedThrottle):
    """30 refresh requests per minute per IP."""
    scope = 'token_refresh'


class PublicSigningRateThrottle(_ScopedThrottle):
    """30 requests per minute per IP on public signing endpoints."""
    scope = 'public_signing'


class AccountSetupRateThrottle(_ScopedThrottle):
    """5 account-setup completions per minute per IP — prevents invitation abuse."""
    scope = 'account_setup'


class PasswordResetRateThrottle(_ScopedThrottle):
    """5 password-reset requests per minute per IP."""
    scope = 'password_reset'
