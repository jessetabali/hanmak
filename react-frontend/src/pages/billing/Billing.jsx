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

const TABS = ['overview', 'invoices', 'payment', 'usage'];
const TAB_LABELS = { overview: 'Overview', invoices: 'Invoices', payment: 'Payment Method', usage: 'Usage' };

export default function Billing() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [checkoutModal, setCheckoutModal] = useState(false);
  const [cancelModal, setCancelModal] = useState(false);

  const { data: subData, isLoading: subLoading, refetch: refetchSub } = useApiQuery(['subscription'], EP.SUBSCRIPTIONS);
  const { data: plansData, isLoading: plansLoading } = useApiQuery(['plans'], EP.PLANS);
  const { data: invoicesData, isLoading: invoicesLoading } = useApiQuery(['invoices'], EP.INVOICES, {}, { enabled: activeTab === 'invoices' });
  const { data: paymentData, isLoading: paymentLoading } = useApiQuery(['payment-methods'], EP.PAYMENT_METHODS, {}, { enabled: activeTab === 'payment' });
  const { data: usageData, isLoading: usageLoading } = useApiQuery(['usage'], '/usage-records/', {}, { enabled: activeTab === 'usage' });

  const sub = subData?.results?.[0] ?? subData;
  const plans = plansData?.results ?? plansData ?? [];
  const invoices = invoicesData?.results ?? invoicesData ?? [];
  const paymentMethods = paymentData?.results ?? paymentData ?? [];
  const usageRecords = usageData?.results ?? usageData ?? [];

  const cancelMutation = useApiMutation(
    () => apiClient.post(`${EP.SUBSCRIPTIONS}${sub?.id}/cancel/`, {}),
    {
      invalidateKeys: ['subscription'],
      onSuccess: () => { toast.success('Subscription cancelled'); setCancelModal(false); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const openPortalMutation = useApiMutation(
    (payload) => apiClient.post(EP.PAYMENT_PORTAL_SESSIONS, payload),
    {
      onSuccess: (data) => {
        if (data?.data?.url) window.open(data.data.url, '_blank');
        else toast.info('Payment portal opened');
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const handleSelectPlan = useCallback((planId) => {
    openPortalMutation.mutate({ plan: planId });
    setCheckoutModal(false);
  }, [openPortalMutation]);

  const handleUpdatePayment = useCallback(() => {
    openPortalMutation.mutate({ mode: 'payment_method' });
  }, [openPortalMutation]);

  const subStatus = sub?.status || 'unknown';

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Billing</h1>
          <p className="page-subtitle">Subscription, invoices, and payment management</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: '1.5rem' }}>
        {TABS.map(tab => (
          <button
            key={tab}
            className={`tab${activeTab === tab ? ' active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="flex flex-col gap-4">
          {subLoading ? <Spinner center /> : !sub ? (
            <EmptyState title="No active subscription" message="Subscribe to a plan to get started." />
          ) : (
            <>
              {/* Current Plan Card */}
              <div className="card" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Current Plan</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{sub.plan_name || sub.plan || '—'}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                      {sub.amount ? `$${(sub.amount / 100).toFixed(2)} / ${sub.interval || 'month'}` : sub.price_display || ''}
                    </div>
                  </div>
                  <Badge color={statusColor(subStatus)}>{subStatus}</Badge>
                </div>

                {sub.current_period_end && (
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                    Renews {formatDate(sub.current_period_end)}
                  </div>
                )}

                {/* Feature list */}
                {sub.features?.length > 0 && (
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem' }}>Included Features</div>
                    <div className="flex flex-col gap-1">
                      {sub.features.map((f, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                          <span style={{ color: 'var(--success)' }}>✓</span>
                          <span>{typeof f === 'string' ? f : f.name || f.key}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Usage bars */}
                {(sub.envelope_usage != null || sub.storage_usage != null || sub.seat_usage != null) && (
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.75rem' }}>Usage</div>
                    {[
                      { label: 'Envelopes Sent', current: sub.envelope_usage, limit: sub.envelope_limit },
                      { label: 'Storage', current: sub.storage_usage, limit: sub.storage_limit, bytes: true },
                      { label: 'Seats', current: sub.seat_usage, limit: sub.seat_limit },
                    ].filter(u => u.current != null).map((u) => {
                      const pct = u.limit ? Math.min(100, Math.round((u.current / u.limit) * 100)) : 0;
                      const display = u.bytes
                        ? `${formatBytes(u.current)} / ${formatBytes(u.limit)}`
                        : `${u.current} / ${u.limit || '∞'}`;
                      return (
                        <div key={u.label} style={{ marginBottom: '0.75rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '0.25rem' }}>
                            <span style={{ color: 'var(--text-muted)' }}>{u.label}</span>
                            <span>{display}</span>
                          </div>
                          {u.limit && (
                            <div style={{ height: 6, background: 'var(--bg-secondary)', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: pct > 90 ? 'var(--danger)' : pct > 70 ? 'var(--warning)' : 'var(--primary)', borderRadius: 3, transition: 'width 0.3s' }} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex gap-2">
                  <button className="btn btn-primary" onClick={() => setCheckoutModal(true)} disabled={openPortalMutation.isPending}>
                    Change Plan
                  </button>
                  <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => setCancelModal(true)}>
                    Cancel Subscription
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Invoices Tab */}
      {activeTab === 'invoices' && (
        <div>
          {invoicesLoading ? <Spinner center /> : invoices.length === 0 ? (
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
                    <th>Download</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="mono">{inv.invoice_number || inv.number || `#${inv.id}`}</td>
                      <td>{formatDate(inv.created_at || inv.date)}</td>
                      <td>
                        {inv.amount != null
                          ? `$${(inv.amount / 100).toFixed(2)}`
                          : inv.amount_display || '—'}
                      </td>
                      <td>
                        <Badge color={statusColor(inv.status)}>{inv.status || '—'}</Badge>
                      </td>
                      <td>
                        {inv.pdf_url ? (
                          <a className="btn btn-ghost btn-sm" href={inv.pdf_url} target="_blank" rel="noreferrer">PDF</a>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Payment Method Tab */}
      {activeTab === 'payment' && (
        <div>
          {paymentLoading ? <Spinner center /> : (
            <div className="card" style={{ padding: '1.5rem' }}>
              <div style={{ fontWeight: 600, marginBottom: '1rem' }}>Payment Method</div>
              {paymentMethods.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>No payment method on file.</p>
              ) : (
                <div className="flex flex-col gap-3" style={{ marginBottom: '1rem' }}>
                  {paymentMethods.map((pm) => (
                    <div key={pm.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', border: '1px solid var(--border)', borderRadius: 8 }}>
                      <div style={{ fontSize: '1.5rem' }}>💳</div>
                      <div>
                        <div style={{ fontWeight: 600 }}>
                          {pm.brand ? `${pm.brand.toUpperCase()} ` : ''}ending in {pm.last4 || pm.last_four || '****'}
                        </div>
                        <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                          Expires {pm.exp_month || pm.expiry_month}/{pm.exp_year || pm.expiry_year}
                        </div>
                      </div>
                      {pm.is_default && <Badge color="primary">Default</Badge>}
                    </div>
                  ))}
                </div>
              )}
              <button className="btn btn-primary" disabled={openPortalMutation.isPending} onClick={handleUpdatePayment}>
                {openPortalMutation.isPending ? 'Opening…' : 'Update Payment Method'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Usage Tab */}
      {activeTab === 'usage' && (
        <div>
          {usageLoading ? <Spinner center /> : usageRecords.length === 0 ? (
            <EmptyState title="No usage records" message="Usage data will appear here." />
          ) : (
            <div className="card" style={{ padding: 0 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Resource</th>
                    <th>Quantity</th>
                    <th>Unit</th>
                    <th>Period</th>
                  </tr>
                </thead>
                <tbody>
                  {usageRecords.map((rec, i) => (
                    <tr key={rec.id || i}>
                      <td>{rec.resource || rec.metric || '—'}</td>
                      <td>{rec.quantity ?? rec.value ?? '—'}</td>
                      <td>{rec.unit || '—'}</td>
                      <td style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                        {rec.period_start ? `${formatDate(rec.period_start)} – ${formatDate(rec.period_end)}` : formatDate(rec.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Plan Comparison Modal */}
      <Modal
        open={checkoutModal}
        onClose={() => setCheckoutModal(false)}
        title="Change Plan"
        size="lg"
        footer={<button className="btn btn-ghost" onClick={() => setCheckoutModal(false)}>Close</button>}
      >
        {plansLoading ? <Spinner center /> : plans.length === 0 ? (
          <EmptyState title="No plans available" />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
            {plans.map((plan) => (
              <div key={plan.id} className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{plan.name}</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                  {plan.price != null ? `$${(plan.price / 100).toFixed(0)}/mo` : plan.price_display || 'Custom'}
                </div>
                {plan.features?.length > 0 && (
                  <div className="flex flex-col gap-1" style={{ flex: 1 }}>
                    {plan.features.slice(0, 5).map((f, i) => (
                      <div key={i} style={{ fontSize: '0.8125rem', display: 'flex', gap: '0.375rem' }}>
                        <span style={{ color: 'var(--success)' }}>✓</span>
                        <span>{typeof f === 'string' ? f : f.name || f}</span>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  className={`btn btn-sm ${sub?.plan === plan.id || sub?.plan_name === plan.name ? 'btn-ghost' : 'btn-primary'}`}
                  disabled={sub?.plan === plan.id || openPortalMutation.isPending}
                  onClick={() => handleSelectPlan(plan.id)}
                >
                  {sub?.plan === plan.id || sub?.plan_name === plan.name ? 'Current Plan' : 'Select'}
                </button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Cancel Subscription Dialog */}
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
