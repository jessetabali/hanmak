import re

from drf_spectacular.utils import OpenApiParameter, OpenApiTypes, extend_schema
from django.db import connection
from django.db.models import Q
from rest_framework import decorators, permissions, response, views, viewsets

from accounts.permissions import OrganizationScopedQuerySetMixin, feature_flag_allows_request, request_organization_ids, user_organization_ids
from auditlog.models import AuditEvent
from documents.models import Document
from envelopes.models import Envelope, Template
from .models import SearchIndex
from .serializers import SearchIndexSerializer
from .services import rebuild_search_index_for_organization


class SearchIndexViewSet(OrganizationScopedQuerySetMixin, viewsets.ModelViewSet):
    feature_flag_key = 'operations_console'
    queryset = SearchIndex.objects.select_related('organization').all().order_by('-weight', '-updated_at')
    serializer_class = SearchIndexSerializer
    permission_classes = [permissions.IsAuthenticated]

    @decorators.action(detail=False, methods=['post'])
    def rebuild(self, request):
        organization_id = request.data.get('organization')
        organization_ids = request_organization_ids(request)
        if organization_ids is not None and int(organization_id) not in organization_ids:
            return response.Response({'detail': 'You do not have access to that organization.'}, status=403)
        from accounts.models import Organization
        organization = Organization.objects.filter(id=organization_id).first()
        if not organization:
            return response.Response({'detail': 'Organization not found.'}, status=404)
        count = rebuild_search_index_for_organization(organization)
        return response.Response({'indexed': count, 'organization': organization.id})


class GlobalSearchView(views.APIView):
    feature_flag_key = 'operations_console'
    permission_classes = [permissions.IsAuthenticated]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if not feature_flag_allows_request(request, self):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('The "operations_console" feature is not released for this organization.')

    @extend_schema(
        parameters=[OpenApiParameter('q', OpenApiTypes.STR, OpenApiParameter.QUERY)],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request):
        query = request.query_params.get('q', '').strip()
        organization_ids = request_organization_ids(request)
        if not query:
            return response.Response({'query': query, 'ranking': {'strategy': 'none'}, 'results': []})

        index_queryset = self._indexed_queryset(query)
        if organization_ids is not None:
            index_queryset = index_queryset.filter(organization_id__in=organization_ids)
        indexed_results = [self._indexed_result(item, query) for item in index_queryset[:100]]
        indexed_results.sort(key=lambda item: (-item['rank'], -item['weight'], item['title'].lower()))
        if indexed_results:
            return response.Response({
                'query': query,
                'ranking': {'strategy': self._ranking_strategy()},
                'results': indexed_results[:25],
            })

        envelopes = Envelope.objects.select_related('organization').filter(name__icontains=query)
        templates = Template.objects.select_related('organization').filter(name__icontains=query)
        documents = Document.objects.select_related('organization').filter(title__icontains=query)
        audit_events = AuditEvent.objects.select_related('organization').filter(message__icontains=query)

        if organization_ids is not None:
            envelopes = envelopes.filter(organization_id__in=organization_ids)
            templates = templates.filter(organization_id__in=organization_ids)
            documents = documents.filter(organization_id__in=organization_ids)
            audit_events = audit_events.filter(organization_id__in=organization_ids)

        results = []
        results.extend(self._fallback_result('envelope', item.id, item.name, item.organization_id, query) for item in envelopes[:10])
        results.extend(self._fallback_result('template', item.id, item.name, item.organization_id, query) for item in templates[:10])
        results.extend(self._fallback_result('document', item.id, item.title, item.organization_id, query) for item in documents[:10])
        results.extend(self._fallback_result('audit_event', item.id, item.message, item.organization_id, query) for item in audit_events[:10])
        results.sort(key=lambda item: (-item['rank'], item['title'].lower()))
        return response.Response({'query': query, 'ranking': {'strategy': 'live_fallback'}, 'results': results[:25]})

    def _indexed_queryset(self, query):
        if connection.vendor == 'postgresql':
            try:
                from django.contrib.postgres.search import SearchQuery, SearchRank, SearchVector
                from django.db.models import TextField
                from django.db.models.functions import Cast
                vector = (
                    SearchVector('title', weight='A')
                    + SearchVector(Cast('keywords', output_field=TextField()), weight='B')
                    + SearchVector('body', weight='C')
                )
                search_query = SearchQuery(query, search_type='websearch')
                return (
                    SearchIndex.objects
                    .annotate(search_rank=SearchRank(vector, search_query))
                    .filter(search_rank__gt=0)
                    .order_by('-search_rank', '-weight', '-updated_at')
                )
            except Exception:
                pass
        token_filter = Q()
        for token in self._tokens(query):
            token_filter |= Q(title__icontains=token) | Q(body__icontains=token) | Q(keywords__icontains=token)
        return SearchIndex.objects.filter(token_filter or Q(title__icontains=query))

    def _indexed_result(self, item, query):
        postgres_rank = getattr(item, 'search_rank', None)
        rank_details = self._rank_details(item, query)
        rank = rank_details['score']
        if postgres_rank is not None:
            rank += float(postgres_rank or 0) * 1000
        return {
            'type': item.object_type,
            'id': item.object_id,
            'title': item.title,
            'organization': item.organization_id,
            'source': 'index',
            'weight': item.weight,
            'rank': round(rank, 4),
            'rank_details': rank_details,
            'snippet': self._snippet(item, query),
        }

    def _fallback_result(self, object_type, object_id, title, organization_id, query):
        title_text = title or ''
        query_lower = query.lower()
        rank = 1
        if title_text.lower() == query_lower:
            rank += 100
        if title_text.lower().startswith(query_lower):
            rank += 50
        if query_lower in title_text.lower():
            rank += 25
        for token in self._tokens(query):
            if token in title_text.lower():
                rank += 10
        return {
            'type': object_type,
            'id': object_id,
            'title': title_text,
            'organization': organization_id,
            'source': 'live',
            'rank': rank,
            'snippet': title_text,
        }

    def _rank(self, item, query):
        return self._rank_details(item, query)['score']

    def _rank_details(self, item, query):
        q = query.lower()
        title = (item.title or '').lower()
        body = (item.body or '').lower()
        keywords = ' '.join(item.keywords or []).lower()
        rank = item.weight
        details = {'base_weight': item.weight, 'exact_title': 0, 'prefix_title': 0, 'title_hits': 0, 'keyword_hits': 0, 'body_hits': 0, 'all_terms': 0}
        if title == q:
            rank += 100
            details['exact_title'] = 100
        if title.startswith(q):
            rank += 50
            details['prefix_title'] = 50
        if q in title:
            rank += 25
            details['title_hits'] += 25
        if q in keywords:
            rank += 15
            details['keyword_hits'] += 15
        if q in body:
            rank += 5
            details['body_hits'] += 5
        tokens = self._tokens(query)
        if tokens and all(token in f'{title} {keywords} {body}' for token in tokens):
            rank += 20
            details['all_terms'] = 20
        for token in tokens:
            if token in title:
                rank += 8
                details['title_hits'] += 8
            if token in keywords:
                rank += 5
                details['keyword_hits'] += 5
            if token in body:
                rank += 2
                details['body_hits'] += 2
        details['score'] = rank
        return details

    def _tokens(self, query):
        return [token for token in re.findall(r'[a-z0-9]+', query.lower()) if len(token) > 1]

    def _snippet(self, item, query):
        text = item.body or item.title or ''
        if not text:
            return ''
        lower = text.lower()
        positions = [lower.find(token) for token in self._tokens(query) if token in lower]
        start = max(min(positions) - 60, 0) if positions else 0
        snippet = text[start:start + 180].strip()
        return snippet or item.title

    def _ranking_strategy(self):
        return 'postgres_full_text' if connection.vendor == 'postgresql' else 'weighted_terms'
