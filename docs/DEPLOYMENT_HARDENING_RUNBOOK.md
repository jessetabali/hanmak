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

## Acceptance Gate

- Run `python manage.py check`.
- Run migrations with `python manage.py migrate --check`.
- Run backend tenant/API tests.
- Run Docker click-through QA through `http://127.0.0.1:8080/mock/`.
- Fix or document every visible action that errors, does nothing, or shows stale static data.
