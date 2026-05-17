from django.core.exceptions import FieldDoesNotExist
from django.contrib.contenttypes.models import ContentType
from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import SAFE_METHODS, BasePermission

from .models import Membership, ObjectPermission, Organization, Role


DEFAULT_ORGANIZATION_FILTER_PATHS = [
    'organization',
    'team__organization',
    'template__organization',
    'template_version__template__organization',
    'party__template_version__template__organization',
    'envelope__organization',
    'recipient__envelope__organization',
    'document__organization',
    'source_file__organization',
    'legal_hold__organization',
    'endpoint__organization',
    'event__organization',
    'task_run__organization',
    'api_key__organization',
    'workflow__organization',
    'run__envelope__organization',
    'definition__organization',
    'user__memberships__organization',
]


def user_organization_ids(user):
    if not user or not user.is_authenticated:
        return []
    if user_is_app_super_admin(user):
        return None
    return list(
        Membership.objects.filter(user=user, is_active=True)
        .values_list('organization_id', flat=True)
        .distinct()
    )


def user_is_app_super_admin(user):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    return Membership.objects.filter(
        user=user,
        role=Membership.Role.SUPER_ADMIN,
        is_active=True,
    ).exists()


def user_has_org_access(user, organization_id):
    organization_ids = user_organization_ids(user)
    if organization_ids is None:
        return True
    return organization_id in organization_ids


def user_is_org_admin(user, organization):
    if not user or not user.is_authenticated:
        return False
    if user_is_app_super_admin(user):
        return True
    return Membership.objects.filter(
        user=user,
        organization=organization,
        role__in=[Membership.Role.ADMIN, Membership.Role.SUPER_ADMIN],
        is_active=True,
    ).exists()


def user_has_org_role(user, organization_id, allowed_roles):
    if not user or not user.is_authenticated:
        return False
    if user_is_app_super_admin(user):
        return True
    return Membership.objects.filter(
        user=user,
        organization_id=organization_id,
        role__in=allowed_roles,
        is_active=True,
    ).exists()


def user_has_custom_permission(user, organization_id, permission):
    if not user or not user.is_authenticated or not permission:
        return False
    if user_is_app_super_admin(user):
        return True
    membership = Membership.objects.filter(user=user, organization_id=organization_id, is_active=True).first()
    if not membership:
        return False
    role = membership.custom_role
    if not role:
        role = Role.objects.filter(organization_id=organization_id, name__iexact=membership.role).first()
    permissions = role.permissions if role else []
    if '*' in permissions or permission in permissions:
        return True
    if ':' not in permission:
        return False
    resource, action = permission.split(':', 1)
    resource_aliases = {resource}
    if not resource.endswith('s'):
        resource_aliases.add(f'{resource}s')
    resource_aliases.add(resource.replace('-', '_'))
    resource_aliases.add(resource.replace('_', '-'))
    return any(f'{alias}:{action}' in permissions for alias in resource_aliases)


def user_team_ids(user, organization_id=None):
    queryset = Membership.objects.filter(user=user, is_active=True, team__isnull=False)
    if organization_id:
        queryset = queryset.filter(organization_id=organization_id)
    return list(queryset.values_list('team_id', flat=True).distinct())


def active_object_permission_queryset(user, content_type, organization_id, scopes):
    now = timezone.now()
    grant_filter = Q(user=user)
    team_ids = user_team_ids(user, organization_id)
    if team_ids:
        grant_filter |= Q(team_id__in=team_ids)
    return ObjectPermission.objects.filter(
        organization_id=organization_id,
        content_type=content_type,
        scope__in=scopes,
    ).filter(
        Q(expires_at__isnull=True) | Q(expires_at__gt=now)
    ).filter(grant_filter)


def object_permission_scopes_for_method(method):
    if method in SAFE_METHODS:
        return [
            ObjectPermission.Scope.VIEW,
            ObjectPermission.Scope.COMMENT,
            ObjectPermission.Scope.EDIT,
            ObjectPermission.Scope.SEND,
            ObjectPermission.Scope.OWNER,
        ]
    return [
        ObjectPermission.Scope.EDIT,
        ObjectPermission.Scope.SEND,
        ObjectPermission.Scope.OWNER,
    ]


def custom_permission_action_for_method(method):
    if method in SAFE_METHODS:
        return 'view'
    if method == 'POST':
        return 'create'
    if method == 'DELETE':
        return 'delete'
    return 'edit'


def organization_has_model_grants(organization_ids, model):
    if model in (Organization, ObjectPermission):
        return False
    content_type = ContentType.objects.get_for_model(model)
    return ObjectPermission.objects.filter(
        organization_id__in=organization_ids,
        content_type=content_type,
    ).filter(
        Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now())
    ).exists()


def restrict_queryset_to_object_grants(queryset, user, organization_ids, scopes=None):
    if not organization_has_model_grants(organization_ids, queryset.model):
        return queryset
    permitted_ids = set()
    content_type = ContentType.objects.get_for_model(queryset.model)
    scopes = scopes or object_permission_scopes_for_method('GET')
    for organization_id in organization_ids:
        if user_has_org_role(user, organization_id, [Membership.Role.ADMIN, Membership.Role.MANAGER]):
            return queryset
        permitted_ids.update(
            active_object_permission_queryset(user, content_type, organization_id, scopes)
            .values_list('object_id', flat=True)
        )
    if not permitted_ids:
        return queryset.none()
    return queryset.filter(id__in=permitted_ids)


def user_has_object_grant(user, obj, scopes):
    organization_id = extract_organization_id(obj)
    if organization_id is None and isinstance(obj, Organization):
        organization_id = obj.id
    if not organization_id:
        return False
    if user_has_org_role(user, organization_id, [Membership.Role.ADMIN, Membership.Role.MANAGER]):
        return True
    content_type = ContentType.objects.get_for_model(obj.__class__)
    if not ObjectPermission.objects.filter(organization_id=organization_id, content_type=content_type, object_id=obj.id).exists():
        return True
    return active_object_permission_queryset(user, content_type, organization_id, scopes).filter(object_id=obj.id).exists()


def model_has_lookup_path(model, path):
    current_model = model
    for segment in path.split('__'):
        try:
            field = current_model._meta.get_field(segment)
        except FieldDoesNotExist:
            return False
        if not field.is_relation:
            return False
        current_model = field.related_model
        if current_model is None:
            return False
    return current_model == Organization


def extract_organization_id(value):
    if isinstance(value, Organization):
        return value.id
    for attr in ('organization_id',):
        organization_id = getattr(value, attr, None)
        if organization_id:
            return organization_id
    for attr in ('organization',):
        organization = getattr(value, attr, None)
        if organization:
            return getattr(organization, 'id', None)
    for attr in ('envelope', 'template', 'document', 'legal_hold', 'endpoint', 'event', 'task_run', 'workflow'):
        related = getattr(value, attr, None)
        if related:
            organization_id = extract_organization_id(related)
            if organization_id:
                return organization_id
    return None


def _request_organization_id(request):
    candidates = [
        request.query_params.get('organization'),
        request.query_params.get('organization_id'),
        request.headers.get('X-HanMak-Organization'),
    ]
    data = getattr(request, 'data', None)
    if isinstance(data, dict):
        candidates.extend([data.get('organization'), data.get('organization_id')])
    for candidate in candidates:
        if candidate in (None, ''):
            continue
        try:
            return int(candidate)
        except (TypeError, ValueError):
            return None
    return None


def request_organization_ids(request):
    organization_ids = user_organization_ids(request.user)
    requested_organization_id = _request_organization_id(request)
    if requested_organization_id:
        if organization_ids is None:
            return [requested_organization_id]
        if requested_organization_id in organization_ids:
            return [requested_organization_id]
        return []
    return organization_ids


def feature_flag_allows(user, organization_id, key):
    if not key or not user or not user.is_authenticated:
        return True
    from configcenter.models import FeatureFlag

    flag = FeatureFlag.objects.filter(organization_id=organization_id, key=key).first()
    if not flag:
        return True
    if not flag.is_enabled or flag.release_stage in [
        FeatureFlag.ReleaseStage.PLANNED,
        FeatureFlag.ReleaseStage.INTERNAL,
        FeatureFlag.ReleaseStage.PAUSED,
        FeatureFlag.ReleaseStage.RETIRED,
    ]:
        return False
    rollout = int(flag.rollout_percentage or 0)
    if rollout >= 100:
        return True
    if rollout <= 0:
        return False
    basis = f'{key}:{getattr(user, "id", "")}:{organization_id}'
    bucket = sum(ord(char) for char in basis) % 100
    return bucket < rollout


def feature_flag_allows_request(request, view, organization_id=None):
    key = getattr(view, 'feature_flag_key', None)
    if not key:
        return True
    if organization_id is None:
        organization_id = _request_organization_id(request)
    organization_ids = user_organization_ids(request.user)
    if organization_id:
        if not user_has_org_access(request.user, organization_id):
            return False
        return feature_flag_allows(request.user, organization_id, key)
    if organization_ids is None:
        return True
    if not organization_ids:
        return False
    return any(feature_flag_allows(request.user, org_id, key) for org_id in organization_ids)


class OrganizationScopedQuerySetMixin:
    organization_filter_paths = None

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        self._assert_feature_flag_access(request)

    def _assert_feature_flag_access(self, request):
        key = getattr(self, 'feature_flag_key', None)
        if not key:
            return
        organization_id = _request_organization_id(request)
        lookup_value = self.kwargs.get(getattr(self, 'lookup_url_kwarg', None) or self.lookup_field)
        if organization_id is None and lookup_value:
            try:
                obj = self.get_queryset().filter(**{self.lookup_field: lookup_value}).first()
            except (TypeError, ValueError):
                obj = None
            if obj is not None:
                organization_id = extract_organization_id(obj)
                if organization_id is None and isinstance(obj, Organization):
                    organization_id = obj.id
        if not feature_flag_allows_request(request, self, organization_id=organization_id):
            raise PermissionDenied(f'The "{key}" feature is not released for this organization.')

    def get_organization_filter_paths(self):
        if self.organization_filter_paths is not None:
            return self.organization_filter_paths
        model = self.get_queryset_model()
        return [path for path in DEFAULT_ORGANIZATION_FILTER_PATHS if model_has_lookup_path(model, path)]

    def get_queryset_model(self):
        return self.queryset.model

    def get_queryset(self):
        queryset = super().get_queryset()
        organization_ids = request_organization_ids(self.request)
        if organization_ids is None:
            return queryset
        if not organization_ids:
            return queryset.none()
        key = getattr(self, 'feature_flag_key', None)
        if key:
            organization_ids = [
                organization_id
                for organization_id in organization_ids
                if feature_flag_allows(self.request.user, organization_id, key)
            ]
            if not organization_ids:
                return queryset.none()
        if queryset.model == Organization:
            return queryset.filter(id__in=organization_ids)

        organization_filter = Q()
        for path in self.get_organization_filter_paths():
            organization_filter |= Q(**{f'{path}_id__in': organization_ids})
        if not organization_filter:
            return queryset.none()
        scoped_queryset = queryset.filter(organization_filter).distinct()
        return restrict_queryset_to_object_grants(scoped_queryset, self.request.user, organization_ids)

    def _assert_related_organization_access(self, serializer):
        organization_ids = user_organization_ids(self.request.user)
        if organization_ids is None:
            return
        if self.request.method not in SAFE_METHODS:
            allowed_roles = getattr(self, 'write_roles', None)
            if allowed_roles:
                allowed_organization_ids = set(Membership.objects.filter(
                    user=self.request.user,
                    role__in=allowed_roles,
                    is_active=True,
                ).values_list('organization_id', flat=True))
            else:
                allowed_organization_ids = set(organization_ids)
        else:
            allowed_organization_ids = set(organization_ids)
        for value in serializer.validated_data.values():
            organization_id = extract_organization_id(value)
            if organization_id and organization_id not in allowed_organization_ids:
                permission_resource = getattr(self, 'permission_resource', None) or self.get_queryset_model().__name__.lower()
                permission_action = custom_permission_action_for_method(self.request.method)
                if not user_has_custom_permission(self.request.user, organization_id, f'{permission_resource}:{permission_action}'):
                    raise serializers.ValidationError('You do not have access to that organization.')

    def perform_create(self, serializer):
        self._assert_related_organization_access(serializer)
        serializer.save()


class OrganizationRolePermission(BasePermission):
    write_roles = [Membership.Role.ADMIN, Membership.Role.MANAGER]

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return user_has_object_grant(request.user, obj, object_permission_scopes_for_method(request.method))
        organization_id = extract_organization_id(obj)
        if organization_id is None and isinstance(obj, Organization):
            organization_id = obj.id
        write_roles = getattr(view, 'write_roles', self.write_roles)
        if user_has_org_role(request.user, organization_id, write_roles):
            return True
        permission_resource = getattr(view, 'permission_resource', None) or obj.__class__.__name__.lower()
        permission_action = custom_permission_action_for_method(request.method)
        if user_has_custom_permission(request.user, organization_id, f'{permission_resource}:{permission_action}'):
            return True
        content_type = ContentType.objects.get_for_model(obj.__class__)
        if not ObjectPermission.objects.filter(organization_id=organization_id, content_type=content_type, object_id=obj.id).exists():
            return False
        return active_object_permission_queryset(
            request.user,
            content_type,
            organization_id,
            object_permission_scopes_for_method(request.method),
        ).filter(object_id=obj.id).exists()

    def perform_update(self, serializer):
        self._assert_related_organization_access(serializer)
        serializer.save()
