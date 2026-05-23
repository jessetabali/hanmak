import { useState, useCallback } from 'react';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import { formatDate, formatDateTime, formatBytes } from '../../utils/formatting';
import Modal from '../../components/ui/Modal';
import Badge, { statusColor } from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

const TABS = ['overview', 'invoices', 'payment', 'usage', 'webhook_events'];
const TAB_LABELS = { overview: 'Overview', invoices: 'Invoices', payment: 'Payment Method', usage: 'Usage', webhook_events: 'Webhook Events' };

function UsageBar({ label, used, limit, bytes = false }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const display = bytes
    ? `${formatBytes(used)} / ${formatBytes(limit)}`
    : `${used ?? 0} / ${limit ?? '∞'}`;
  const barColor = pct > 90 ? 'var(--danger)' : pct > 70 ? 'var(--warning)' : 'var(--primary)';
  return (
    <div style={{ marginBottom: '0.875rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '0.25rem' }}>
        <span style={{ color: 'var(--text-muted)' }}>{label}</span>
        <span>{display}</span>
      </div>
      {limit ? (
        <div style={{ height: 6, background: 'var(--bg-secondary)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 3, transition: 'width 0.3s' }} />
        </div>
      ) : (
        <div style={{ height: 6, background: 'var(--bg-secondary)', borderRadius: 3 }} />
      )}
    </div>
  );
}

export default function Billing() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [upgradePlansModal, setUpgradePlansModal] = useState(false);
  const [cancelModal, setCancelModal] = useState(false);
  const [expandedEventId, setExpandedEventId] = useState(null);

  const { data: subsData, isLoading: subLoading } = useApiQuery(['subscription'], EP.SUBSCRIPTIONS);
  const { data: plansData, isLoading: plansLoading } = useApiQuery(['plans'], EP.PLANS);
  const { data: invoicesData, isLoading: invoicesLoading } = useApiQuery(
    ['invoices'],
    EP.INVOICES,
    {},
    { enabled: activeTab === 'invoices' }
  );
  const { data: paymentData, isLoading: paymentLoading } = useApiQuery(
    ['payment-methods'],
    EP.PAYMENT_METHODS,
    {},
    { enabled: activeTab === 'payment' }
  );
  const { data: usageData, isLoading: usageLoading } = useApiQuery(
    ['usage'],
    '/usage-records/',
    {},
    { enabled: activeTab === 'usage' }
  );
  const { data: webhookEventsData, isLoading: webhookEventsLoading } = useApiQuery(
    ['payment-webhook-events'],
    EP.PAYMENT_WEBHOOK_EVENTS,
    { page_size: 50 },
    { enabled: activeTab === 'webhook_events' }
  );

  const subscription = subsData?.results?.[0] ?? subsData;
  const plans = plansData?.results ?? plansData ?? [];
  const invoices = invoicesData?.results ?? invoicesData ?? [];
  const paymentMethods = paymentData?.results ?? paymentData ?? [];
  const usageRecords = usageData?.results ?? usageData ?? [];
  const webhookEvents = webhookEventsData?.results ?? webhookEventsData ?? [];

  // Resolve current plan object from plansData if possible
  const currentPlan = plans.find(
    (p) => p.id === subscription?.plan || p.name === subscription?.plan_name
  );
  const planFeatures = subscription?.features ?? currentPlan?.features ?? [];
  const organizationId = subscription?.organization ?? localStorage.getItem('HANMAK_ORGANIZATION_ID');

  const cancelMutation = useApiMutation(
    () => {
      const id = subscription?.id;
      return id
        ? apiClient.patch(`${EP.SUBSCRIPTIONS}${id}/`, { status: 'cancelled' })
        : Promise.reject(new Error('No active subscription'));
    },
    {
      invalidateKeys: ['subscription'],
      onSuccess: () => { toast.success('Subscription cancelled'); setCancelModal(false); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const openPortalMutation = useApiMutation(
    (payload) => {
      if (!organizationId) return Promise.reject(new Error('No organization selected'));
      if (payload.plan_id) {
        return apiClient.post(EP.SUBSCRIPTION_CHECKOUT_SESSION, {
          organization: organizationId,
          plan: payload.plan_id,
        });
      }
      return apiClient.post(EP.SUBSCRIPTION_BILLING_PORTAL, {
        organization: organizationId,
        return_url: window.location.href,
        metadata: payload,
      });
    },
    {
      onSuccess: (res) => {
        const url = res?.data?.url ?? res?.url;
        if (url) window.location.href = url;
        else toast.info('Portal session created — redirecting…');
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const handleSelectPlan = useCallback(
    (planId) => {
      openPortalMutation.mutate({ plan_id: planId });
      setUpgradePlansModal(false);
    },
    [openPortalMutation]
  );

  const handleUpdatePayment = useCallback(() => {
    openPortalMutation.mutate({ mode: 'payment_method' });
  }, [openPortalMutation]);

  const handlePayInvoice = useCallback(
    (invoiceId) => {
      openPortalMutation.mutate({ invoice_id: invoiceId });
    },
    [openPortalMutation]
  );

  const formatAmount = (amt) => {
    if (amt == null) return '—';
    // Try cents first; if the amount is small assume it's already dollars
    if (typeof amt === 'number' && amt > 1000) return `$${(amt / 100).toFixed(2)}`;
    if (typeof amt === 'number') return `$${amt.toFixed(2)}`;
    return String(amt);
  };

  const subStatus = subscription?.status || 'unknown';

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Billing</h1>
          <p className="page-subtitle">Subscription, invoices, and payment management</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.25rem', borderBottom: '1px solid var(--border)' }}>
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`tab${activeTab === tab ? ' active' : ''}`}
            style={{
              padding: '0.5rem 1rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
              cursor: 'pointer',
              fontWeight: activeTab === tab ? 600 : 400,
              color: activeTab === tab ? 'var(--primary)' : 'var(--text-muted)',
              fontSize: '0.9375rem',
            }}
            onClick={() => setActiveTab(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ─────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '1.5rem', alignItems: 'start' }}>
          {/* Main plan card */}
          <div className="flex flex-col gap-4">
            {subLoading ? (
              <Spinner center />
            ) : !subscription ? (
              <div className="flex flex-col gap-4">
                <EmptyState title="No active subscription" message="Subscribe to a plan to get started." />
                <div style={{ textAlign: 'center' }}>
                  <button className="btn btn-primary" onClick={() => setUpgradePlansModal(true)}>
                    View Plans
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Current Plan Card */}
                <div className="card" style={{ padding: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
                        Current Plan
                      </div>
                      <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>
                        {subscription.plan_name || currentPlan?.name || subscription.plan || '—'}
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.35rem' }}>
                        {subscription.amount != null
                          ? `${formatAmount(subscription.amount)} / ${subscription.interval || subscription.billing_cycle || 'month'}`
                          : subscription.price_display || currentPlan?.price_display || ''}
                      </div>
                    </div>
                    <Badge color={statusColor(subStatus)}>{subStatus}</Badge>
                  </div>

                  {subscription.current_period_end && (
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                      Renews {formatDate(subscription.current_period_end)}
                    </div>
                  )}

                  {/* Feature list */}
                  {planFeatures.length > 0 && (
                    <div style={{ marginBottom: '1.25rem' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem' }}>Included Features</div>
                      <div className="flex flex-col gap-1">
                        {planFeatures.map((f, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                            <span style={{ color: 'var(--success)' }}>✓</span>
                            <span>{typeof f === 'string' ? f : f.name || f.key || String(f)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Usage Bars */}
                  <div style={{ marginBottom: '1.25rem' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.75rem' }}>Usage</div>
                    <UsageBar
                      label="Envelopes"
                      used={subscription.envelope_usage ?? 0}
                      limit={subscription.envelope_limit}
                    />
                    <UsageBar
                      label="Storage"
                      used={subscription.storage_usage ?? 0}
                      limit={subscription.storage_limit}
                      bytes
                    />
                    <UsageBar
                      label="Seats"
                      used={subscription.seat_usage ?? 0}
                      limit={subscription.seat_limit}
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      className="btn btn-primary"
                      disabled={openPortalMutation.isPending}
                      onClick={() => setUpgradePlansModal(true)}
                    >
                      {openPortalMutation.isPending ? 'Loading…' : 'Upgrade / Change Plan'}
                    </button>
                    <button
                      className="btn btn-ghost"
                      style={{ color: 'var(--danger)' }}
                      onClick={() => setCancelModal(true)}
                    >
                      Cancel Subscription
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Plans comparison sidebar */}
          <div className="flex flex-col gap-3">
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.75rem' }}>
                {plansLoading ? 'Plans' : `${plans.length} Available Plan${plans.length !== 1 ? 's' : ''}`}
              </div>
              {plansLoading ? (
                <Spinner center />
              ) : plans.length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No plans available</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {plans.map((plan) => {
                    const isCurrent =
                      subscription?.plan === plan.id || subscription?.plan_name === plan.name;
                    return (
                      <div
                        key={plan.id}
                        style={{
                          padding: '0.75rem',
                          border: isCurrent ? '2px solid var(--primary)' : '1px solid var(--border)',
                          borderRadius: 7,
                          background: isCurrent ? 'rgba(79,142,247,0.04)' : 'var(--bg-secondary)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{plan.name}</span>
                          {isCurrent && <Badge color="primary">Current</Badge>}
                        </div>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--primary)', marginBottom: '0.5rem' }}>
                          {plan.price != null ? `${formatAmount(plan.price)}/mo` : plan.price_display || 'Custom'}
                        </div>
                        {plan.features?.slice(0, 3).map((f, i) => (
                          <div key={i} style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '0.3rem' }}>
                            <span style={{ color: 'var(--success)' }}>✓</span>
                            <span>{typeof f === 'string' ? f : f.name || String(f)}</span>
                          </div>
                        ))}
                        {!isCurrent && (
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ marginTop: '0.5rem', width: '100%', fontSize: '0.75rem' }}
                            disabled={openPortalMutation.isPending}
                            onClick={() => handleSelectPlan(plan.id)}
                          >
                            Switch to {plan.name}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Invoices Tab ──────────────────────────────────────── */}
      {activeTab === 'invoices' && (
        <div>
          {invoicesLoading ? (
            <Spinner center />
          ) : invoices.length === 0 ? (
            <EmptyState title="No invoices" message="Invoice history will appear here." />
          ) : (
            <div className="card" style={{ padding: 0 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Due Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => {
                    const isOverdue = inv.status === 'overdue' || inv.status === 'past_due';
                    return (
                      <tr key={inv.id}>
                        <td className="mono">{inv.invoice_number || inv.number || `#${inv.id}`}</td>
                        <td>{formatDate(inv.created_at || inv.date)}</td>
                        <td style={{ fontWeight: 600 }}>{formatAmount(inv.amount)}</td>
                        <td>
                          <Badge color={statusColor(inv.status)}>{inv.status || '—'}</Badge>
                        </td>
                        <td style={{ color: isOverdue ? 'var(--danger)' : 'var(--text-muted)', fontSize: '0.875rem' }}>
                          {inv.due_date ? formatDate(inv.due_date) : '—'}
                        </td>
                        <td>
                          <div className="flex gap-1">
                            {inv.pdf_url && (
                              <a
                                className="btn btn-ghost btn-sm"
                                href={inv.pdf_url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Download PDF
                              </a>
                            )}
                            {isOverdue && (
                              <button
                                className="btn btn-primary btn-sm"
                                disabled={openPortalMutation.isPending}
                                onClick={() => handlePayInvoice(inv.id)}
                              >
                                Pay Now
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Payment Method Tab ────────────────────────────────── */}
      {activeTab === 'payment' && (
        <div>
          {paymentLoading ? (
            <Spinner center />
          ) : (
            <div className="card" style={{ padding: '1.5rem' }}>
              <div style={{ fontWeight: 600, marginBottom: '1rem' }}>Payment Method</div>
              {paymentMethods.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
                  No payment method on file.
                </p>
              ) : (
                <div className="flex flex-col gap-3" style={{ marginBottom: '1.25rem' }}>
                  {paymentMethods.map((pm) => {
                    const isCard = pm.type === 'card' || pm.brand || pm.last4 || pm.last_four;
                    return (
                      <div
                        key={pm.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '1rem',
                          padding: '0.875rem 1rem',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          background: 'var(--bg-secondary)',
                        }}
                      >
                        <div style={{ fontSize: '1.75rem' }}>{isCard ? '💳' : '🏦'}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600 }}>
                            {pm.brand ? `${pm.brand.toUpperCase()} ` : (pm.type === 'bank' ? 'Bank account ' : '')}
                            ending in {pm.last4 || pm.last_four || '****'}
                          </div>
                          {isCard && (pm.exp_month || pm.expiry_month) && (
                            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                              Expires {pm.exp_month || pm.expiry_month}/{pm.exp_year || pm.expiry_year}
                            </div>
                          )}
                        </div>
                        {pm.is_default && <Badge color="primary">Default</Badge>}
                      </div>
                    );
                  })}
                </div>
              )}
              <button
                className="btn btn-primary"
                disabled={openPortalMutation.isPending}
                onClick={handleUpdatePayment}
              >
                {openPortalMutation.isPending ? 'Opening…' : 'Update Payment Method'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Usage Tab ─────────────────────────────────────────── */}
      {activeTab === 'usage' && (
        <div>
          {usageLoading ? (
            <Spinner center />
          ) : (
            <div className="flex flex-col gap-4">
              {/* Bar chart representation */}
              {usageRecords.length > 0 && (
                <div className="card" style={{ padding: '1.5rem' }}>
                  <div style={{ fontWeight: 600, marginBottom: '1rem' }}>Resource Usage</div>
                  {usageRecords.map((rec, i) => (
                    <UsageBar
                      key={rec.id || i}
                      label={rec.resource || rec.metric || rec.name || `Resource ${i + 1}`}
                      used={rec.used ?? rec.quantity ?? rec.value ?? 0}
                      limit={rec.limit}
                      bytes={String(rec.resource || rec.metric || '').toLowerCase().includes('storage')}
                    />
                  ))}
                </div>
              )}

              {usageRecords.length === 0 ? (
                <EmptyState title="No usage records" message="Usage data will appear here after activity." />
              ) : (
                <div className="card" style={{ padding: 0 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Resource</th>
                        <th>Used</th>
                        <th>Limit</th>
                        <th>Period</th>
                        <th>Overage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usageRecords.map((rec, i) => {
                        const used = rec.used ?? rec.quantity ?? rec.value ?? 0;
                        const limit = rec.limit;
                        const overage = limit != null && used > limit ? used - limit : 0;
                        return (
                          <tr key={rec.id || i}>
                            <td style={{ fontWeight: 600 }}>
                              {rec.resource || rec.metric || rec.name || '—'}
                            </td>
                            <td>{used}</td>
                            <td>{limit ?? '∞'}</td>
                            <td style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                              {rec.period_start
                                ? `${formatDate(rec.period_start)} – ${formatDate(rec.period_end)}`
                                : rec.period || formatDate(rec.created_at)}
                            </td>
                            <td>
                              {overage > 0 ? (
                                <span style={{ color: 'var(--danger)', fontWeight: 600 }}>+{overage}</span>
                              ) : (
                                <span style={{ color: 'var(--text-muted)' }}>—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Webhook Events Tab ───────────────────────────────── */}
      {activeTab === 'webhook_events' && (
        <div>
          {webhookEventsLoading ? (
            <Spinner center />
          ) : webhookEvents.length === 0 ? (
            <EmptyState title="No webhook events" message="Payment webhook events from Stripe or your payment processor will appear here." />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Event Type</th>
                      <th>Status</th>
                      <th>Amount</th>
                      <th>Created</th>
                      <th>Payload</th>
                    </tr>
                  </thead>
                  <tbody>
                    {webhookEvents.map((ev) => {
                      const isExpanded = expandedEventId === ev.id;
                      const payload = ev.payload ?? ev.data ?? ev.body;
                      const payloadStr = payload
                        ? (typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2))
                        : null;
                      const evStatus = ev.status ?? ev.processing_status ?? 'received';
                      const evAmount = ev.amount ?? ev.data?.object?.amount ?? ev.payload?.data?.object?.amount;
                      return (
                        <>
                          <tr key={ev.id}>
                            <td>
                              <span className="mono" style={{ fontSize: '0.8125rem' }}>
                                {ev.event_type || ev.type || '—'}
                              </span>
                            </td>
                            <td>
                              <Badge color={statusColor(evStatus)}>{evStatus}</Badge>
                            </td>
                            <td style={{ fontWeight: 600 }}>
                              {evAmount != null ? formatAmount(evAmount) : '—'}
                            </td>
                            <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                              {formatDateTime(ev.created_at || ev.received_at || ev.timestamp)}
                            </td>
                            <td>
                              {payloadStr ? (
                                <button
                                  className="btn btn-ghost btn-sm"
                                  style={{ fontSize: '0.75rem' }}
                                  onClick={() => setExpandedEventId(isExpanded ? null : ev.id)}
                                >
                                  {isExpanded ? 'Hide' : 'View'}
                                </button>
                              ) : (
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>
                              )}
                            </td>
                          </tr>
                          {isExpanded && payloadStr && (
                            <tr key={`${ev.id}-payload`}>
                              <td colSpan={5} style={{ padding: 0, background: 'var(--bg-secondary)' }}>
                                <pre
                                  style={{
                                    margin: 0,
                                    padding: '0.875rem 1rem',
                                    fontSize: '0.75rem',
                                    fontFamily: 'monospace',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-all',
                                    color: 'var(--text-muted)',
                                    maxHeight: 320,
                                    overflowY: 'auto',
                                  }}
                                >
                                  {payloadStr}
                                </pre>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Plans Modal ───────────────────────────────────────── */}
      <Modal
        open={upgradePlansModal}
        onClose={() => setUpgradePlansModal(false)}
        title="Upgrade / Change Plan"
        size="lg"
        footer={<button className="btn btn-ghost" onClick={() => setUpgradePlansModal(false)}>Close</button>}
      >
        {plansLoading ? (
          <Spinner center />
        ) : plans.length === 0 ? (
          <EmptyState title="No plans available" message="Contact support to learn about available plans." />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
            {plans.map((plan) => {
              const isCurrent =
                subscription?.plan === plan.id || subscription?.plan_name === plan.name;
              return (
                <div
                  key={plan.id}
                  className="card"
                  style={{
                    padding: '1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                    border: isCurrent ? '2px solid var(--primary)' : undefined,
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '1.0625rem' }}>{plan.name}</div>
                  <div style={{ fontSize: '1.375rem', fontWeight: 600 }}>
                    {plan.price != null
                      ? `${formatAmount(plan.price)}/month`
                      : plan.price_display || 'Custom'}
                  </div>
                  {plan.features?.length > 0 && (
                    <div className="flex flex-col gap-1" style={{ flex: 1 }}>
                      {plan.features.slice(0, 6).map((f, i) => (
                        <div key={i} style={{ fontSize: '0.8125rem', display: 'flex', gap: '0.375rem', alignItems: 'flex-start' }}>
                          <span style={{ color: 'var(--success)', flexShrink: 0 }}>✓</span>
                          <span>{typeof f === 'string' ? f : f.name || String(f)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    className={`btn btn-sm ${isCurrent ? 'btn-ghost' : 'btn-primary'}`}
                    disabled={isCurrent || openPortalMutation.isPending}
                    onClick={() => handleSelectPlan(plan.id)}
                  >
                    {isCurrent ? 'Current Plan' : 'Select'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      {/* ── Cancel Subscription Dialog ────────────────────────── */}
      <ConfirmDialog
        open={cancelModal}
        onClose={() => setCancelModal(false)}
        onConfirm={() => cancelMutation.mutate()}
        title="Cancel Subscription"
        message="Are you sure you want to cancel your subscription? Access will continue until the end of the current billing period."
        confirmLabel="Cancel Subscription"
        danger
        loading={cancelMutation.isPending}
      />
    </div>
  );
}
