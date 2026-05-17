import os


def configure_observability():
    provider = (os.environ.get('HANMAK_APM_PROVIDER') or '').lower()
    sentry_dsn = os.environ.get('SENTRY_DSN')
    if provider == 'sentry' and sentry_dsn:
        try:
            import sentry_sdk
            from sentry_sdk.integrations.celery import CeleryIntegration
            from sentry_sdk.integrations.django import DjangoIntegration
            from sentry_sdk.integrations.redis import RedisIntegration

            sentry_sdk.init(
                dsn=sentry_dsn,
                integrations=[DjangoIntegration(), CeleryIntegration(), RedisIntegration()],
                environment=os.environ.get('HANMAK_ENVIRONMENT', 'production'),
                release=os.environ.get('HANMAK_RELEASE') or None,
                traces_sample_rate=float(os.environ.get('HANMAK_APM_SAMPLE_RATE', '0.1')),
                send_default_pii=False,
            )
            return {'provider': 'sentry', 'configured': True}
        except Exception as exc:
            return {'provider': 'sentry', 'configured': False, 'error': str(exc)}

    otel_endpoint = os.environ.get('OTEL_EXPORTER_OTLP_ENDPOINT')
    if provider in ['opentelemetry', 'otel'] and otel_endpoint:
        try:
            from opentelemetry import trace
            from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
            from opentelemetry.instrumentation.django import DjangoInstrumentor
            from opentelemetry.sdk.resources import Resource
            from opentelemetry.sdk.trace import TracerProvider
            from opentelemetry.sdk.trace.export import BatchSpanProcessor

            resource = Resource.create({
                'service.name': os.environ.get('OTEL_SERVICE_NAME', 'hanmak-backend'),
                'deployment.environment': os.environ.get('HANMAK_ENVIRONMENT', 'production'),
                'service.version': os.environ.get('HANMAK_RELEASE', ''),
            })
            provider_instance = TracerProvider(resource=resource)
            provider_instance.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=otel_endpoint)))
            trace.set_tracer_provider(provider_instance)
            DjangoInstrumentor().instrument()
            return {'provider': 'opentelemetry', 'configured': True}
        except Exception as exc:
            return {'provider': 'opentelemetry', 'configured': False, 'error': str(exc)}

    return {'provider': provider or 'none', 'configured': False}
