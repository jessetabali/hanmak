from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer, TokenRefreshSerializer
from rest_framework_simplejwt.settings import api_settings
from django.contrib.auth import get_user_model
from django.conf import settings
from django.utils import timezone

from .models import UserProfile


def current_auth_version(user):
    profile, _ = UserProfile.objects.get_or_create(user=user)
    return profile.auth_version


def bump_auth_version(user):
    profile, _ = UserProfile.objects.get_or_create(user=user)
    profile.auth_version += 1
    profile.save(update_fields=['auth_version', 'updated_at'])
    return profile.auth_version


class HanMakTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['auth_version'] = current_auth_version(user)
        return token

    def validate(self, attrs):
        User = get_user_model()
        username = attrs.get(self.username_field)
        user = User.objects.filter(**{self.username_field: username}).first()
        profile = None
        if user:
            profile, _ = UserProfile.objects.get_or_create(user=user)
            if profile.locked_until and profile.locked_until > timezone.now():
                remaining_seconds = max(int((profile.locked_until - timezone.now()).total_seconds()), 1)
                remaining_minutes = max((remaining_seconds + 59) // 60, 1)
                raise AuthenticationFailed(
                    f'Account is temporarily locked. Try again in about {remaining_minutes} minute(s), or use Forgot Password.',
                    code='account_locked',
                )
        try:
            data = super().validate(attrs)
        except Exception:
            if profile:
                threshold = getattr(settings, 'HANMAK_LOGIN_LOCKOUT_FAILURES', 5)
                lock_minutes = getattr(settings, 'HANMAK_LOGIN_LOCKOUT_MINUTES', 15)
                profile.failed_login_count += 1
                profile.last_failed_login_at = timezone.now()
                update_fields = ['failed_login_count', 'last_failed_login_at', 'updated_at']
                if profile.failed_login_count >= threshold:
                    profile.locked_until = timezone.now() + timezone.timedelta(minutes=lock_minutes)
                    update_fields.append('locked_until')
                profile.save(update_fields=update_fields)
                attempts_remaining = max(threshold - profile.failed_login_count, 0)
                if profile.locked_until and profile.locked_until > timezone.now():
                    raise AuthenticationFailed(
                        f'Account locked for {lock_minutes} minute(s) after too many failed sign-in attempts. Use Forgot Password if you need access now.',
                        code='account_locked',
                    )
                raise AuthenticationFailed(
                    f'Invalid username or password. {attempts_remaining} attempt(s) remaining before temporary lockout.',
                    code='invalid_credentials',
                )
            raise AuthenticationFailed('Invalid username or password.', code='invalid_credentials')
        if profile and (profile.failed_login_count or profile.locked_until):
            profile.failed_login_count = 0
            profile.locked_until = None
            profile.save(update_fields=['failed_login_count', 'locked_until', 'updated_at'])
        data['mfa_required'] = user.mfa_devices.filter(is_confirmed=True).exists()
        data['mfa_methods'] = list(user.mfa_devices.filter(is_confirmed=True).values_list('method', flat=True).distinct())
        return data


class HanMakJWTAuthentication(JWTAuthentication):
    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        token_version = validated_token.get('auth_version')
        if token_version is None:
            raise AuthenticationFailed('Token is missing auth version.', code='token_stale')
        if int(token_version) != current_auth_version(user):
            raise AuthenticationFailed('Token has been revoked.', code='token_stale')
        return user


class HanMakTokenRefreshSerializer(TokenRefreshSerializer):
    def validate(self, attrs):
        refresh = self.token_class(attrs['refresh'])
        user_id = refresh.get(api_settings.USER_ID_CLAIM)
        token_version = refresh.get('auth_version')
        User = get_user_model()
        user = User.objects.filter(**{api_settings.USER_ID_FIELD: user_id}).first()
        if not user or token_version is None or int(token_version) != current_auth_version(user):
            raise AuthenticationFailed('Refresh token has been revoked.', code='token_stale')
        data = super().validate(attrs)
        return data
