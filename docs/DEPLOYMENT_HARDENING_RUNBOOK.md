# HanMak Deployment Hardening Runbook

Use this checklist before calling an environment production-ready.

## TLS And Domains

- Set `HANMAK_PRIMARY_DOMAIN` to the public app domain.
- Set `DJANGO_ALLOWED_HOSTS` to the exact app/API domains.
- Put TLS on the load balancer or reverse proxy.
- Set `USE_X_FORWARDED_PROTO=true` when TLS terminates before Django.
- Enable `SECURE_SSL_REDIRECT=true`, `SESSION_COOKIE_SECURE=true`, and `CSRF_COOKIE_SECURE=true`.
- If the edge proxy owns HTTP-to-HTTPS redirects instead of Django, set `HANMAK_TLS_REDIRECT_CONFIGURED=true` after verifying the redirect externally.
- Enable HSTS only after the domain is verified end-to-end.

## Secrets

- Store `DJANGO_SECRET_KEY`, database credentials, SMTP credentials, object storage keys, payment webhook secrets, SSO certificates, and API provider credentials in a secrets manager.
- Set `HANMAK_SECRETS_MANAGER` to the active provider name.
- Rotate secrets after staff/offboarding events and on a regular schedule.

## Static And Media

- Run `collectstatic` during release.
- Serve static assets from Nginx or a CDN.
- Keep uploaded media private unless an authenticated endpoint or signed URL intentionally exposes it.
- Set `AWS_STORAGE_BUCKET_NAME` or `HANMAK_MEDIA_BACKUP_POLICY` before production use.

## Backups

- Configure encrypted database backups with point-in-time recovery where supported.
- Back up object/media storage independently.
- Set `HANMAK_BACKUP_POLICY` and `HANMAK_MEDIA_BACKUP_POLICY` to describe the active backup policy.

## Restore Drill

- Restore the latest backup into an isolated environment.
- Run migrations.
- Verify login, organization switching, templates, envelopes, file library, signing, evidence bundles, and signed PDFs.
- Record the successful drill timestamp in `HANMAK_LAST_RESTORE_DRILL_AT`.

## Observability And Alerts

- Configure either `SENTRY_DSN` with `HANMAK_APM_PROVIDER=sentry` or `OTEL_EXPORTER_OTLP_ENDPOINT` with `HANMAK_APM_PROVIDER=otel`.
- Set `HANMAK_ALERT_WEBHOOK_URL` for hosted/external alert delivery.
- Add alert email subscriptions from System Health.
- Run `/api/v1/health-checks/run_checks/` after deployment and publish the status snapshot.

## Rate Limiting

DRF throttle classes are applied to high-risk endpoints. Default rates are set in `REST_FRAMEWORK.DEFAULT_THROTTLE_RATES` and can be overridden without code changes:

```text
THROTTLE_ANON=120/min          # All unauthenticated requests
THROTTLE_USER=600/min          # All authenticated requests
THROTTLE_LOGIN=10/min          # POST /auth/login/
THROTTLE_TOKEN_REFRESH=30/min  # POST /auth/refresh/
THROTTLE_PUBLIC_SIGNING=30/min # GET/POST /sign/{token}/, GET /sign/{token}/download/
THROTTLE_ACCOUNT_SETUP=5/min   # Invitation accept/inspect
THROTTLE_PASSWORD_RESET=5/min  # Password-reset request/complete
```

Tighten `THROTTLE_LOGIN` and `THROTTLE_PASSWORD_RESET` for production environments with high abuse risk. DRF uses the Django cache backend for throttle counters — ensure a persistent, shared cache (Redis) is configured rather than the default per-process `LocMemCache`.

## Security Headers

The following headers are enabled via Django's `SecurityMiddleware` in `hanmak/settings.py`:

```text
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
```

Ensure the following settings are `true` in production:

```text
SECURE_CONTENT_TYPE_NOSNIFF=true  (default: true)
X_FRAME_OPTIONS=DENY              (default: DENY)
SESSION_COOKIE_HTTPONLY=true      (default: true)
SESSION_COOKIE_SAMESITE=Lax      (default: Lax)
```

`BasicAuthentication` is only loaded when `DEBUG=true` — it must not be present in production.

## Acceptance Gate

- Run `python manage.py check`.
- Run migrations with `python manage.py migrate --check`.
- Run backend tenant/API tests: `python manage.py test accounts.tests.TenantScopedAPITests`.
- Run security hardening tests: `python manage.py test accounts.tests_security`.
- Verify throttle responses include a `Retry-After` header on `429` responses.
- Run Docker click-through QA through `http://127.0.0.1:8080/mock/`.
- Fix or document every visible action that errors, does nothing, or shows stale static data.
