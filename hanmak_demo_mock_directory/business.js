// ==================== BILLING ====================
registerPage('billing', () => `
<div class="page-header">
  <div><h1 class="page-title">Billing & Usage</h1><p class="page-subtitle">Plan limits, consumption metrics, and payment management</p></div>
  <div class="flex gap-2">
    <button class="btn btn-ghost" onclick="openPaymentMethodOverrideLive()">${icon('credit-card')} Override Payment</button>
    <button class="btn btn-ghost" onclick="openSubscriptionOverrideLive()">${icon('shield')} Allocate Plan</button>
    <button class="btn btn-ghost" onclick="openBillingPortalLive()">${icon('credit-card')} Billing Portal</button>
    <button class="btn btn-primary" onclick="openUpgradeModal()">${icon('trending-up')} Upgrade Plan</button>
  </div>
</div>

<div id="billing-plan-banner" style="background:linear-gradient(135deg,#1e3a5f,#2563eb);border-radius:12px;padding:1.5rem;margin-bottom:1.5rem;color:white;display:flex;justify-content:space-between;align-items:center">
  <div>
    <div style="font-size:0.8rem;opacity:0.75;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px">Current Plan</div>
    <div style="font-weight:800;font-size:1.75rem;margin-bottom:4px" id="billing-plan-name">Loading…</div>
    <div id="billing-plan-price" style="opacity:0.8;font-size:0.875rem"></div>
  </div>
  <div style="text-align:right">
    <div style="font-size:0.875rem;opacity:0.75;margin-bottom:4px">Billing Cycle</div>
    <div id="billing-period" style="font-size:1.25rem;font-weight:700">—</div>
    <div id="billing-status" style="font-size:0.8rem;opacity:0.75;margin-top:4px"></div>
  </div>
</div>

<div class="stats-grid" style="--cols:4;margin-bottom:1.5rem" id="billing-stats">
  <div class="stat-card"><div class="stat-label">Envelopes Sent</div><div class="stat-value" id="billing-stat-envelopes">—</div></div>
  <div class="stat-card"><div class="stat-label">Active Users</div><div class="stat-value" id="billing-stat-users">—</div></div>
  <div class="stat-card"><div class="stat-label">Storage Used</div><div class="stat-value" id="billing-stat-storage">—</div></div>
  <div class="stat-card"><div class="stat-label">API Calls (MTD)</div><div class="stat-value" id="billing-stat-api">—</div></div>
</div>

<div style="display:grid;grid-template-columns:1fr 320px;gap:1.5rem">
  <div class="flex flex-col gap-4">
    <div class="card" style="padding:1.5rem">
      <div style="font-weight:600;margin-bottom:1.25rem">Usage This Billing Period</div>
      <div id="billing-usage-bars"><div style="text-align:center;color:var(--text-muted);padding:1rem">Loading usage…</div></div>
    </div>
    <div class="card">
      <div style="padding:1.25rem;border-bottom:1px solid var(--border);font-weight:600">Invoice History</div>
      <table class="table">
        <thead><tr><th>Period</th><th>Amount</th><th>Status</th><th>Invoice</th></tr></thead>
        <tbody id="billing-invoices-body">
          <tr><td colspan="4" style="text-align:center;padding:1rem;color:var(--text-muted)">Loading invoices…</td></tr>
        </tbody>
      </table>
    </div>
    <div class="card">
      <div style="padding:1.25rem;border-bottom:1px solid var(--border);font-weight:600;display:flex;justify-content:space-between;align-items:center">
        <span>Payment Webhook Events</span>
        <button class="btn btn-ghost btn-sm" onclick="loadBillingPaymentWebhooksLive()">${icon('refresh')} Refresh</button>
      </div>
      <div id="billing-webhook-events" style="padding:1rem">
        <div style="text-align:center;color:var(--text-muted);padding:1rem">Loading payment webhooks…</div>
      </div>
    </div>
  </div>

  <div class="flex flex-col gap-4">
    <div class="card" style="padding:1.25rem">
      <div style="font-weight:600;margin-bottom:1rem">Payment Method</div>
      <div id="billing-payment-method"><div style="text-align:center;color:var(--text-muted);padding:1rem">Loading payment method…</div></div>
      <button class="btn btn-ghost btn-sm" style="width:100%" onclick="openBillingPortalLive()">${icon('credit-card')} Manage Payment</button>
    </div>
    <div class="card" style="padding:1.25rem">
      <div style="font-weight:600;margin-bottom:1rem">All Plans</div>
      <div id="billing-plans-comparison"><div style="text-align:center;color:var(--text-muted);padding:1rem">Loading plans…</div></div>
    </div>
  </div>
</div>
`);

async function openUpgradeModal() {
  try {
    await ensureHanmakApi();
    const data = await hanmakApi('/plans/');
    const plans = data.results || data;
    openModal(`
      <div class="modal-header"><h3 class="modal-title">${icon('trending-up')} Upgrade Plan</h3><button class="modal-close" onclick="closeModal()">x</button></div>
      <div class="modal-body">
        <div class="flex flex-col gap-2">
          ${plans.map(plan => `<div style="display:flex;justify-content:space-between;align-items:center;padding:0.875rem;border:1px solid var(--border);border-radius:8px">
            <div><div style="font-weight:700">${escapeHtml(plan.name)}</div><div style="font-size:0.78rem;color:var(--text-muted)">${(plan.features || []).slice(0, 4).map(escapeHtml).join(', ') || 'Plan features configured in backend'}</div></div>
            <div style="text-align:right"><div style="font-weight:800">$${Number(plan.monthly_price || 0).toFixed(0)}/mo</div><button class="btn btn-primary btn-sm" onclick="startCheckoutLive(${plan.id})">${icon('external-link')} Checkout</button></div>
          </div>`).join('')}
        </div>
      </div>
      <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Close</button></div>
    `);
  } catch (error) {
    showToast(`Could not load checkout plans: ${error.message}`, 'error', 8000);
  }
}

async function billingOrganizationOptionsLive(selected = '') {
  const data = await hanmakApi('/organizations/', {headers: {'X-HanMak-Organization': ''}});
  const organizations = data.results || data;
  return organizations.map(org => `<option value="${org.id}" ${String(selected) === String(org.id) ? 'selected' : ''}>${escapeHtml(org.name)}</option>`).join('');
}

async function openSubscriptionOverrideLive() {
  try {
    await ensureHanmakApi();
    const orgId = await firstOrganizationId();
    const [plansData, subData, organizationOptions] = await Promise.all([
      hanmakApi('/plans/'),
      hanmakApi(`/subscriptions/?organization=${orgId}`),
      billingOrganizationOptionsLive(orgId),
    ]);
    const plans = plansData.results || plansData;
    const sub = (subData.results || subData)[0] || {};
    openModal(`
      <div class="modal-header"><h3 class="modal-title">${icon('shield')} Allocate Plan</h3><button class="modal-close" onclick="closeModal()">x</button></div>
      <div class="modal-body">
        <input id="billing-subscription-id" type="hidden" value="${sub.id || ''}">
        <div class="form-group"><label class="form-label">Organization</label><select id="billing-subscription-org" class="form-input">${organizationOptions}</select></div>
        <div class="form-group"><label class="form-label">Plan</label><select id="billing-subscription-plan" class="form-input">${plans.map(plan => `<option value="${plan.id}" ${String(sub.plan || '') === String(plan.id) ? 'selected' : ''}>${escapeHtml(plan.name)} - $${Number(plan.monthly_price || 0).toFixed(0)}/mo</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">Status</label><select id="billing-subscription-status" class="form-input">${['trialing','active','past_due','cancelled'].map(status => `<option value="${status}" ${sub.status === status ? 'selected' : ''}>${titleCaseStatus(status)}</option>`).join('')}</select></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem">
          <div class="form-group"><label class="form-label">Period Start</label><input id="billing-subscription-start" class="form-input" type="date" value="${sub.current_period_start || ''}"></div>
          <div class="form-group"><label class="form-label">Period End</label><input id="billing-subscription-end" class="form-input" type="date" value="${sub.current_period_end || ''}"></div>
        </div>
      </div>
      <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveSubscriptionOverrideLive()">${icon('save')} Save</button></div>
    `);
  } catch (error) {
    showToast(`Plan allocation unavailable: ${error.message}`, 'error', 8000);
  }
}

async function saveSubscriptionOverrideLive() {
  const id = document.getElementById('billing-subscription-id')?.value;
  const payload = {
    organization: Number(document.getElementById('billing-subscription-org')?.value),
    plan: Number(document.getElementById('billing-subscription-plan')?.value),
    status: document.getElementById('billing-subscription-status')?.value || 'active',
    current_period_start: document.getElementById('billing-subscription-start')?.value || null,
    current_period_end: document.getElementById('billing-subscription-end')?.value || null,
  };
  try {
    await hanmakApi(id ? `/subscriptions/${id}/` : '/subscriptions/', {
      method: id ? 'PATCH' : 'POST',
      body: JSON.stringify(payload),
    });
    localStorage.setItem('HANMAK_ORGANIZATION_ID', payload.organization);
    closeModal();
    showToast('Subscription allocation saved', 'success');
    billing_init();
  } catch (error) {
    showToast(`Subscription allocation failed: ${error.message}`, 'error', 8000);
  }
}

// ==================== LICENSE ====================
registerPage('license', () => `
<div class="page-header">
  <div><h1 class="page-title">License</h1><p class="page-subtitle">License key, edition features, and software information</p></div>
  <div class="flex gap-2">
    <button class="btn btn-ghost" onclick="openLicenseOverrideLive()">${icon('shield')} Override License</button>
    <button class="btn btn-primary" onclick="openGenerateLicenseLive()">${icon('key')} Generate License</button>
  </div>
</div>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem">
  <div class="flex flex-col gap-4">
    <div class="card" style="padding:1.5rem">
      <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.25rem">
        <div style="width:50px;height:50px;background:var(--primary);border-radius:12px;display:flex;align-items:center;justify-content:center;color:white;font-size:1.5rem">${icon('award')}</div>
        <div>
          <div style="font-weight:700;font-size:1.25rem">HanMak</div>
          <div id="license-edition-subtitle" style="color:var(--text-muted);font-size:0.875rem">Loading…</div>
        </div>
      </div>
      <div id="license-details-list" class="flex flex-col gap-2" style="font-size:0.875rem">
        <div style="text-align:center;color:var(--text-muted);padding:1rem">Loading license information…</div>
      </div>
    </div>
    <div class="card" style="padding:1.5rem">
      <div style="font-weight:600;margin-bottom:0.75rem">Activate License Key</div>
      <div class="flex gap-2">
        <input id="license-key-input" class="form-input" placeholder="HM-XXX-YYYY-ZZZZ" style="flex:1;font-family:var(--font-mono)">
        <button class="btn btn-primary" onclick="_activateLicenseLive()">${icon('key')} Activate</button>
      </div>
    </div>
  </div>
  <div class="flex flex-col gap-4">
    <div class="card" style="padding:1.5rem">
      <div style="font-weight:600;margin-bottom:1rem">Edition Features</div>
      <div id="license-features-list" class="flex flex-col gap-2" style="font-size:0.875rem">
        <div style="text-align:center;color:var(--text-muted);padding:1rem">Loading licensed features...</div>
      </div>
    </div>
    <div class="card" style="padding:1.25rem">
      <div style="font-weight:600;margin-bottom:0.75rem">Third-Party Licenses</div>
      <div style="font-size:0.8125rem;color:var(--text-muted);margin-bottom:0.5rem">HanMak uses open source software under the following licenses:</div>
      <div class="flex flex-wrap gap-2">
        ${['Django (BSD)','React (MIT)','PostgreSQL (PostgreSQL)','Redis (BSD)','Celery (BSD)','Pillow (HPND)','OpenPyXL (MIT)'].map(lib=>`
          <span class="badge badge-secondary" style="font-size:0.75rem">${lib}</span>`).join('')}
      </div>
      <button class="btn btn-ghost btn-sm" style="margin-top:0.75rem" onclick="openThirdPartyLicensesLive()">${icon('file-text')} View Full Licenses</button>
    </div>
  </div>
</div>
`);

// ── Live wiring: Billing ─────────────────────────────────────────────────────

function _fmtUsage(v) {
  if (v === undefined || v === null) return '—';
  if (v >= 1000000) return (v/1000000).toFixed(1)+'M';
  if (v >= 1000) return (v/1000).toFixed(1)+'K';
  return String(v);
}

async function billing_init() {
  await ensureHanmakApi();
  const orgId = await firstOrganizationId();
  await Promise.all([
    loadBillingInvoices(orgId),
    loadBillingPaymentMethod(orgId),
    loadBillingPaymentWebhooks(orgId),
  ]);

  // Load subscription + plan
  try {
    const subData = await hanmakApi(`/subscriptions/?organization=${orgId}`);
    const subs = subData.results || subData;
    const sub = subs[0];
    if (sub) {
      const plan = sub.plan_detail || {};
      const planName = plan.name || sub.plan || 'Unknown';
      const price = plan.monthly_price ? `$${Number(plan.monthly_price).toFixed(0)}/month` : '';
      document.getElementById('billing-plan-name').textContent = planName;
      document.getElementById('billing-plan-price').textContent = `${price} · Status: ${sub.status}`;
      const start = sub.current_period_start ? new Date(sub.current_period_start).toLocaleDateString() : '—';
      const end = sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : '—';
      document.getElementById('billing-period').textContent = `${start} → ${end}`;
      document.getElementById('billing-status').textContent = `Next invoice: ${price}`;

      // Plans comparison
      const plansData = await hanmakApi('/plans/');
      const plans = plansData.results || plansData;
      const plansEl = document.getElementById('billing-plans-comparison');
      if (plansEl) {
        plansEl.innerHTML = plans.map(p => {
          const isCurrent = p.id === sub.plan || p.name === planName;
          const limits = p.limits || {};
          const desc = [
            limits.envelopes > 0 ? `${limits.envelopes} envelopes` : 'Unlimited envelopes',
            limits.users > 0 ? `${limits.users} users` : 'Unlimited users',
          ].join(', ');
          return `<div style="padding:0.75rem;border:2px solid ${isCurrent?'var(--primary)':'var(--border)'};border-radius:8px;margin-bottom:0.5rem;background:${isCurrent?'var(--primary-light,#dbeafe)':''}">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div>
                <div style="font-weight:600;font-size:0.875rem">${p.name} ${isCurrent?'<span class="badge badge-primary" style="font-size:0.7rem;margin-left:4px">Current</span>':''}</div>
                <div style="font-size:0.75rem;color:var(--text-muted)">${desc}</div>
              </div>
              <div style="font-weight:700;font-size:0.9rem">$${Number(p.monthly_price).toFixed(0)}/mo</div>
            </div>
          </div>`;
        }).join('');
      }

      // Usage bars from limits
      const limits = plan.limits || {};
      const usageData = await hanmakApi(`/usage-records/?organization=${orgId}`);
      const usageList = usageData.results || usageData;
      const usageMap = {};
      usageList.forEach(u => { usageMap[u.metric_key] = u.quantity; });

      const usageBars = document.getElementById('billing-usage-bars');
      if (usageBars) {
        const metrics = [
          ['Envelopes Sent', usageMap['envelopes.sent'] || 0, limits.envelopes || 500, 'primary'],
          ['Active Users', usageMap['users.active'] || 0, limits.users || 50, 'warning'],
          ['Storage (GB)', usageMap['storage.gb'] || 0, limits.storage_gb || 1024, 'success'],
          ['API Calls (MTD)', usageMap['api_calls.mtd'] || 0, limits.api_calls || 1000000, 'success'],
          ['Templates', usageMap['templates'] || 0, limits.templates || 25, 'success'],
          ['Webhook Endpoints', usageMap['webhook_endpoints'] || 0, limits.webhook_endpoints || 10, 'success'],
        ];
        usageBars.innerHTML = metrics.map(([label, used, limit, color]) => {
          const pct = limit > 0 ? Math.min(100, (used/limit*100)).toFixed(1) : 0;
          return `<div style="margin-bottom:1.125rem">
            <div style="display:flex;justify-content:space-between;font-size:0.875rem;margin-bottom:5px">
              <span>${label}</span>
              <span style="color:var(--text-muted)">${_fmtUsage(used)} / ${_fmtUsage(limit)}</span>
            </div>
            <div style="height:8px;background:var(--border);border-radius:4px">
              <div style="width:${pct}%;height:100%;background:var(--${color});border-radius:4px"></div>
            </div>
          </div>`;
        }).join('');
        // Update stat cards
        document.getElementById('billing-stat-envelopes').textContent = _fmtUsage(usageMap['envelopes.sent']);
        document.getElementById('billing-stat-users').textContent = _fmtUsage(usageMap['users.active']);
        document.getElementById('billing-stat-storage').textContent = `${usageMap['storage.gb'] || 0} GB`;
        document.getElementById('billing-stat-api').textContent = _fmtUsage(usageMap['api_calls.mtd']);
      }
    }
  } catch(e) {
    const banner = document.getElementById('billing-plan-name');
    if (banner) banner.textContent = 'Failed to load';
  }
}

async function loadBillingPaymentWebhooksLive() {
  const orgId = await firstOrganizationId();
  await loadBillingPaymentWebhooks(orgId);
}

async function loadBillingPaymentWebhooks(orgId) {
  const el = document.getElementById('billing-webhook-events');
  if (!el) return;
  try {
    const data = await hanmakApi(`/payment-webhook-events/?organization=${orgId}`);
    const events = data.results || data;
    if (!events.length) {
      el.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:1rem">No payment webhook events recorded yet.</div>';
      return;
    }
    el.innerHTML = events.slice(0, 6).map(event => `
      <div style="display:grid;grid-template-columns:1fr auto;gap:0.75rem;padding:0.75rem;border:1px solid var(--border);border-radius:8px;margin-bottom:0.5rem">
        <div>
          <div style="font-weight:700;font-size:0.875rem">${escapeHtml(event.event_type || 'payment.event')}</div>
          <div style="font-size:0.75rem;color:var(--text-muted)">${escapeHtml(event.provider || 'provider')} · ${escapeHtml(event.provider_event_id || `event-${event.id}`)}</div>
          ${event.processing_notes ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem">${escapeHtml(event.processing_notes)}</div>` : ''}
        </div>
        <div style="text-align:right">
          ${billingStatusBadge(event.status)}
          <div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.35rem">${apiDate(event.processed_at || event.created_at)}</div>
        </div>
      </div>
    `).join('');
  } catch (error) {
    el.innerHTML = `<div style="text-align:center;color:var(--danger);padding:1rem">Failed to load payment webhook events: ${escapeHtml(error.message)}</div>`;
  }
}

async function startCheckoutLive(planId) {
  try {
    const orgId = await firstOrganizationId();
    const session = await hanmakApi('/subscriptions/checkout-session/', {
      method: 'POST',
      body: JSON.stringify({organization: orgId, plan: planId}),
    });
    closeModal();
    showToast('Checkout session created', 'success');
    window.open(session.url, '_blank');
  } catch (error) {
    showToast(`Checkout failed: ${error.message}`, 'error', 8000);
  }
}

async function openBillingPortalLive() {
  try {
    const orgId = await firstOrganizationId();
    const session = await hanmakApi('/subscriptions/billing-portal/', {
      method: 'POST',
      body: JSON.stringify({organization: orgId}),
    });
    showToast('Billing portal session created', 'success');
    window.open(session.url, '_blank');
  } catch (error) {
    showToast(`Billing portal failed: ${error.message}`, 'error', 8000);
  }
}

function billingStatusBadge(status) {
  const color = ['paid', 'processed', 'completed', 'active'].includes(status) ? 'success'
    : ['open', 'received', 'ignored', 'created'].includes(status) ? 'warning'
    : ['void', 'cancelled', 'expired'].includes(status) ? 'secondary'
    : 'danger';
  return `<span class="badge badge-${color}">${escapeHtml(status || 'unknown')}</span>`;
}

async function loadBillingInvoices(orgId) {
  const body = document.getElementById('billing-invoices-body');
  if (!body) return;
  try {
    const data = await hanmakApi(`/invoices/?organization=${orgId}`);
    const invoices = data.results || data;
    if (!invoices.length) {
      body.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:1.5rem;color:var(--text-muted)">No invoices recorded yet.</td></tr>';
      return;
    }
    body.innerHTML = invoices.map(invoice => {
      const period = `${apiDate(invoice.period_start)} - ${apiDate(invoice.period_end)}`;
      const amount = `${escapeHtml(invoice.currency || 'USD')} ${Number(invoice.amount || 0).toFixed(2)}`;
      const download = invoice.pdf_url
        ? `<a class="btn btn-ghost btn-sm" href="${escapeHtml(invoice.pdf_url)}" target="_blank">${icon('download')} PDF</a>`
        : `<button class="btn btn-ghost btn-sm" onclick="openInvoiceDetailsLive(${invoice.id})">${icon('file-text')} Details</button>`;
      return `<tr>
        <td style="font-size:0.875rem"><div>${period}</div><div style="font-size:0.72rem;color:var(--text-muted)">${escapeHtml(invoice.invoice_number || `Invoice #${invoice.id}`)}</div></td>
        <td style="font-weight:600">${amount}</td>
        <td>${billingStatusBadge(invoice.status)}</td>
        <td>${download}</td>
      </tr>`;
    }).join('');
  } catch (error) {
    body.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:1rem;color:var(--danger)">Failed to load invoices: ${escapeHtml(error.message)}</td></tr>`;
  }
}

async function loadBillingPaymentMethod(orgId) {
  const el = document.getElementById('billing-payment-method');
  if (!el) return;
  try {
    const data = await hanmakApi(`/payment-methods/?organization=${orgId}`);
    const methods = data.results || data;
    const method = methods[0];
    if (!method) {
      el.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:1rem;border:1px solid var(--border);border-radius:8px">No payment method saved.</div>';
      return;
    }
    const brand = (method.brand || method.method_type || 'card').toUpperCase();
    const last4 = method.last4 ? `•••• •••• •••• ${escapeHtml(method.last4)}` : escapeHtml(method.method_type || 'Payment method');
    const expiry = method.exp_month && method.exp_year ? `Expires ${String(method.exp_month).padStart(2, '0')}/${String(method.exp_year).slice(-2)}` : (method.holder_name || 'Default billing method');
    el.innerHTML = `<div style="display:flex;align-items:center;gap:0.875rem;padding:0.875rem;border:1px solid var(--border);border-radius:8px;margin-bottom:0.75rem">
      <div style="width:42px;height:28px;background:#1a1f71;border-radius:4px;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:0.65rem">${escapeHtml(brand.slice(0, 6))}</div>
      <div>
        <div style="font-weight:500">${last4}</div>
        <div style="font-size:0.75rem;color:var(--text-muted)">${escapeHtml(expiry)}</div>
      </div>
      <span class="badge badge-${method.is_default ? 'success' : 'secondary'}" style="margin-left:auto">${method.is_default ? 'Default' : 'Saved'}</span>
    </div>`;
  } catch (error) {
    el.innerHTML = `<div style="text-align:center;color:var(--danger);padding:1rem">Failed to load payment method: ${escapeHtml(error.message)}</div>`;
  }
}

async function openPaymentMethodOverrideLive() {
  try {
    await ensureHanmakApi();
    const orgId = await firstOrganizationId();
    const [data, organizationOptions] = await Promise.all([
      hanmakApi(`/payment-methods/?organization=${orgId}`),
      billingOrganizationOptionsLive(orgId),
    ]);
    const method = (data.results || data)[0] || {};
    openModal(`
      <div class="modal-header"><h3 class="modal-title">${icon('credit-card')} Override Payment Method</h3><button class="modal-close" onclick="closeModal()">x</button></div>
      <div class="modal-body">
        <input id="billing-payment-id" type="hidden" value="${method.id || ''}">
        <div class="form-group"><label class="form-label">Organization</label><select id="billing-payment-org" class="form-input">${organizationOptions}</select></div>
        <div class="form-group"><label class="form-label">Method Type</label><select id="billing-payment-type" class="form-input">${['card','bank_transfer','invoice'].map(type => `<option value="${type}" ${method.method_type === type ? 'selected' : ''}>${titleCaseStatus(type)}</option>`).join('')}</select></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem">
          <div class="form-group"><label class="form-label">Brand / Provider</label><input id="billing-payment-brand" class="form-input" value="${escapeHtml(method.brand || '')}" placeholder="Visa, bank, invoice"></div>
          <div class="form-group"><label class="form-label">Last 4</label><input id="billing-payment-last4" class="form-input" maxlength="4" value="${escapeHtml(method.last4 || '')}" placeholder="4242"></div>
          <div class="form-group"><label class="form-label">Expiry Month</label><input id="billing-payment-month" class="form-input" type="number" min="1" max="12" value="${method.exp_month || ''}"></div>
          <div class="form-group"><label class="form-label">Expiry Year</label><input id="billing-payment-year" class="form-input" type="number" min="2026" max="2100" value="${method.exp_year || ''}"></div>
        </div>
        <div class="form-group"><label class="form-label">Holder / Billing Contact</label><input id="billing-payment-holder" class="form-input" value="${escapeHtml(method.holder_name || '')}"></div>
      </div>
      <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="savePaymentMethodOverrideLive()">${icon('save')} Save</button></div>
    `);
  } catch (error) {
    showToast(`Payment override unavailable: ${error.message}`, 'error', 8000);
  }
}

async function savePaymentMethodOverrideLive() {
  const id = document.getElementById('billing-payment-id')?.value;
  const payload = {
    organization: Number(document.getElementById('billing-payment-org')?.value),
    method_type: document.getElementById('billing-payment-type')?.value || 'card',
    brand: document.getElementById('billing-payment-brand')?.value?.trim() || '',
    last4: document.getElementById('billing-payment-last4')?.value?.trim() || '',
    exp_month: Number(document.getElementById('billing-payment-month')?.value) || null,
    exp_year: Number(document.getElementById('billing-payment-year')?.value) || null,
    holder_name: document.getElementById('billing-payment-holder')?.value?.trim() || '',
    is_default: true,
  };
  try {
    await hanmakApi(id ? `/payment-methods/${id}/` : '/payment-methods/', {
      method: id ? 'PATCH' : 'POST',
      body: JSON.stringify(payload),
    });
    localStorage.setItem('HANMAK_ORGANIZATION_ID', payload.organization);
    closeModal();
    showToast('Payment method override saved', 'success');
    billing_init();
  } catch (error) {
    showToast(`Payment override failed: ${error.message}`, 'error', 8000);
  }
}

async function openInvoiceDetailsLive(invoiceId) {
  try {
    const invoice = await hanmakApi(`/invoices/${invoiceId}/`);
    openModal(`
      <div class="modal-header"><h3 class="modal-title">Invoice ${escapeHtml(invoice.invoice_number || `#${invoice.id}`)}</h3><button class="modal-close" onclick="closeModal()">x</button></div>
      <div class="modal-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;font-size:0.875rem">
          <div><div style="font-size:0.75rem;color:var(--text-muted)">Amount</div><strong>${escapeHtml(invoice.currency || 'USD')} ${Number(invoice.amount || 0).toFixed(2)}</strong></div>
          <div><div style="font-size:0.75rem;color:var(--text-muted)">Status</div>${billingStatusBadge(invoice.status)}</div>
          <div><div style="font-size:0.75rem;color:var(--text-muted)">Period Start</div>${apiDate(invoice.period_start)}</div>
          <div><div style="font-size:0.75rem;color:var(--text-muted)">Period End</div>${apiDate(invoice.period_end)}</div>
          <div><div style="font-size:0.75rem;color:var(--text-muted)">Created</div>${apiDate(invoice.created_at)}</div>
          <div><div style="font-size:0.75rem;color:var(--text-muted)">PDF</div>${invoice.pdf_url ? `<a href="${escapeHtml(invoice.pdf_url)}" target="_blank">Open PDF</a>` : 'Not attached yet'}</div>
        </div>
      </div>
      <div class="modal-footer"><button class="btn btn-primary" onclick="closeModal()">Close</button></div>
    `);
  } catch (error) {
    showToast(`Invoice details failed: ${error.message}`, 'error', 7000);
  }
}

function openThirdPartyLicensesLive() {
  openModal(`
    <div class="modal-header"><h3 class="modal-title">Third-Party Licenses</h3><button class="modal-close" onclick="closeModal()">x</button></div>
    <div class="modal-body">
      <div class="flex flex-col gap-2" style="font-size:0.875rem">
        ${['Django - BSD License','Django REST Framework - BSD License','drf-spectacular - BSD License','Celery - BSD License','PostgreSQL - PostgreSQL License','Redis - BSD License','Pillow - HPND License','OpenPyXL - MIT License'].map(item => `<div style="padding:0.625rem;border:1px solid var(--border);border-radius:7px">${escapeHtml(item)}</div>`).join('')}
      </div>
    </div>
    <div class="modal-footer"><button class="btn btn-primary" onclick="closeModal()">Close</button></div>
  `);
}

// ── Live wiring: License ─────────────────────────────────────────────────────

async function license_init() {
  await ensureHanmakApi();
  const orgId = await firstOrganizationId();
  const detailsList = document.getElementById('license-details-list');
  const subtitleEl = document.getElementById('license-edition-subtitle');
  if (!detailsList) return;
  try {
    const data = await hanmakApi(`/license-keys/?organization=${orgId}`);
    const keys = data.results || data;
    const lk = keys[0];
    window._hanmakCurrentLicenseKey = lk || null;
    if (!lk) {
      detailsList.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:1rem">No license key found. Activate one below.</div>';
      renderLicenseFeaturesLive([]);
      return;
    }
    if (subtitleEl) subtitleEl.textContent = `${lk.status === 'active' ? 'Active' : lk.status} License`;
    const expiresAt = lk.expires_at ? new Date(lk.expires_at).toLocaleDateString() : 'Never';
    const activatedAt = lk.activated_at ? new Date(lk.activated_at).toLocaleDateString() : '—';
    const rows = [
      ['License Key', lk.key],
      ['Status', lk.status],
      ['Activated', activatedAt],
      ['Valid Until', expiresAt],
    ];
    detailsList.innerHTML = rows.map(([k,v]) => `
      <div style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid var(--border)">
        <span style="color:var(--text-muted)">${k}</span>
        <span style="font-weight:500;font-family:${k==='License Key'?'var(--font-mono)':''}">${v}</span>
      </div>`).join('');
    renderLicenseFeaturesLive(lk.features || []);
  } catch(e) {
    detailsList.innerHTML = '<div style="text-align:center;color:var(--danger);padding:1rem">Failed to load license.</div>';
    renderLicenseFeaturesLive([]);
  }
}

function defaultLicenseFeaturesLive() {
  return [
    {name: 'Form Builder', note: 'All field types', enabled: true},
    {name: 'Workflow Builder', note: 'Approval and routing stages', enabled: true},
    {name: 'API Access', note: 'API keys, OAuth apps, webhooks', enabled: true},
    {name: 'Audit Evidence', note: 'Evidence bundles and signed PDFs', enabled: true},
    {name: 'Custom Branding', note: 'Logo, colors, and domains', enabled: true},
    {name: 'Admin Console', note: 'Users, orgs, roles, billing, licenses', enabled: true},
  ];
}

function generatedLicenseKeyLive() {
  const segment = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  return `HM-${segment()}-${segment()}-${segment()}`;
}

async function openGenerateLicenseLive() {
  try {
    await ensureHanmakApi();
    const orgId = await firstOrganizationId();
    const organizationOptions = await billingOrganizationOptionsLive(orgId);
    openModal(`
      <div class="modal-header"><h3 class="modal-title">${icon('key')} Generate License</h3><button class="modal-close" onclick="closeModal()">x</button></div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label">Organization</label><select id="license-generate-org" class="form-input">${organizationOptions}</select></div>
        <div class="form-group"><label class="form-label">License Key</label><input id="license-generate-key" class="form-input" style="font-family:var(--font-mono)" value="${generatedLicenseKeyLive()}"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem">
          <div class="form-group"><label class="form-label">Edition</label><input id="license-generate-edition" class="form-input" value="Business"></div>
          <div class="form-group"><label class="form-label">Status</label><select id="license-generate-status" class="form-input"><option value="active">Active</option><option value="pending">Pending</option><option value="suspended">Suspended</option><option value="expired">Expired</option></select></div>
        </div>
        <div class="form-group"><label class="form-label">Expires At</label><input id="license-generate-expires" class="form-input" type="datetime-local"></div>
        <div class="form-group"><label class="form-label">Features JSON</label><textarea id="license-generate-features" class="form-input" rows="7">${escapeHtml(JSON.stringify(defaultLicenseFeaturesLive(), null, 2))}</textarea></div>
      </div>
      <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveGeneratedLicenseLive()">${icon('save')} Generate</button></div>
    `);
  } catch (error) {
    showToast(`License generator unavailable: ${error.message}`, 'error', 8000);
  }
}

async function saveGeneratedLicenseLive() {
  let features = defaultLicenseFeaturesLive();
  try {
    features = JSON.parse(document.getElementById('license-generate-features')?.value || '[]');
  } catch (error) {
    showToast('Features must be valid JSON', 'error');
    return;
  }
  const payload = {
    organization: Number(document.getElementById('license-generate-org')?.value),
    key: document.getElementById('license-generate-key')?.value?.trim() || generatedLicenseKeyLive(),
    edition: document.getElementById('license-generate-edition')?.value?.trim() || 'Business',
    status: document.getElementById('license-generate-status')?.value || 'active',
    expires_at: document.getElementById('license-generate-expires')?.value || null,
    features,
  };
  try {
    await hanmakApi('/license-keys/', {method: 'POST', body: JSON.stringify(payload)});
    localStorage.setItem('HANMAK_ORGANIZATION_ID', payload.organization);
    closeModal();
    showToast('License generated', 'success');
    license_init();
  } catch (error) {
    showToast(`License generation failed: ${error.message}`, 'error', 8000);
  }
}

async function openLicenseOverrideLive() {
  try {
    await ensureHanmakApi();
    const lk = window._hanmakCurrentLicenseKey;
    if (!lk?.id) {
      openGenerateLicenseLive();
      return;
    }
    const organizationOptions = await billingOrganizationOptionsLive(lk.organization);
    openModal(`
      <div class="modal-header"><h3 class="modal-title">${icon('shield')} Override License</h3><button class="modal-close" onclick="closeModal()">x</button></div>
      <div class="modal-body">
        <input id="license-override-id" type="hidden" value="${lk.id}">
        <div class="form-group"><label class="form-label">Organization</label><select id="license-override-org" class="form-input">${organizationOptions}</select></div>
        <div class="form-group"><label class="form-label">License Key</label><input id="license-override-key" class="form-input" style="font-family:var(--font-mono)" value="${escapeHtml(lk.key || '')}"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem">
          <div class="form-group"><label class="form-label">Edition</label><input id="license-override-edition" class="form-input" value="${escapeHtml(lk.edition || 'Business')}"></div>
          <div class="form-group"><label class="form-label">Status</label><select id="license-override-status" class="form-input">${['active','pending','suspended','expired'].map(status => `<option value="${status}" ${lk.status === status ? 'selected' : ''}>${titleCaseStatus(status)}</option>`).join('')}</select></div>
        </div>
        <div class="form-group"><label class="form-label">Expires At</label><input id="license-override-expires" class="form-input" type="datetime-local" value="${lk.expires_at ? String(lk.expires_at).slice(0,16) : ''}"></div>
        <div class="form-group"><label class="form-label">Features JSON</label><textarea id="license-override-features" class="form-input" rows="7">${escapeHtml(JSON.stringify(lk.features || defaultLicenseFeaturesLive(), null, 2))}</textarea></div>
      </div>
      <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveLicenseOverrideLive()">${icon('save')} Save</button></div>
    `);
  } catch (error) {
    showToast(`License override unavailable: ${error.message}`, 'error', 8000);
  }
}

async function saveLicenseOverrideLive() {
  let features = defaultLicenseFeaturesLive();
  try {
    features = JSON.parse(document.getElementById('license-override-features')?.value || '[]');
  } catch (error) {
    showToast('Features must be valid JSON', 'error');
    return;
  }
  const id = document.getElementById('license-override-id')?.value;
  const payload = {
    organization: Number(document.getElementById('license-override-org')?.value),
    key: document.getElementById('license-override-key')?.value?.trim(),
    edition: document.getElementById('license-override-edition')?.value?.trim() || 'Business',
    status: document.getElementById('license-override-status')?.value || 'active',
    expires_at: document.getElementById('license-override-expires')?.value || null,
    features,
  };
  try {
    await hanmakApi(`/license-keys/${id}/`, {method: 'PATCH', body: JSON.stringify(payload)});
    localStorage.setItem('HANMAK_ORGANIZATION_ID', payload.organization);
    closeModal();
    showToast('License override saved', 'success');
    license_init();
  } catch (error) {
    showToast(`License override failed: ${error.message}`, 'error', 8000);
  }
}

function renderLicenseFeaturesLive(features) {
  const list = document.getElementById('license-features-list');
  if (!list) return;
  const normalized = Array.isArray(features) ? features.filter(Boolean) : [];
  if (!normalized.length) {
    list.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:1rem">No licensed feature list has been attached to this license yet.</div>';
    return;
  }
  list.innerHTML = normalized.map(feature => {
    const label = typeof feature === 'string' ? feature : (feature.name || feature.key || 'Licensed feature');
    const note = typeof feature === 'object' ? (feature.note || feature.limit || feature.status || 'Included') : 'Included';
    const enabled = typeof feature === 'object' ? feature.enabled !== false : true;
    return `<div style="display:flex;align-items:center;gap:0.5rem;padding:0.375rem 0;border-bottom:1px solid var(--border)">
      <span style="color:var(--${enabled ? 'success' : 'danger'})">${enabled ? '✓' : '✗'}</span>
      <span style="flex:1">${escapeHtml(label)}</span>
      <span style="font-size:0.75rem;color:var(--text-muted)">${escapeHtml(String(note))}</span>
    </div>`;
  }).join('');
}

async function _activateLicenseLive() {
  const key = document.getElementById('license-key-input')?.value?.trim();
  if (!key) { showToast('Enter a license key', 'error'); return; }
  try {
    const orgId = await firstOrganizationId();
    const data = await hanmakApi('/license-keys/', {method:'POST', body: JSON.stringify({organization: orgId, key})});
    if (data.id) {
      await hanmakApi(`/license-keys/${data.id}/activate/`, {method:'POST'});
    }
    showToast('License activated!', 'success');
    license_init();
  } catch(e) { showToast('Failed to activate license', 'error'); }
}

// ==================== ROADMAP ====================
registerPage('roadmap', () => `
<div class="page-header">
  <div><h1 class="page-title">Product Roadmap</h1><p class="page-subtitle">Upcoming features, current work in progress, and recently shipped</p></div>
  <div class="flex gap-2">
    <button class="btn btn-ghost" onclick="openRoadmapRequestModal()">${icon('plus')} Submit Feature Request</button>
    <button class="btn btn-ghost" onclick="openRoadmapSubscribeModal()">${icon('bell')} Subscribe to Updates</button>
  </div>
</div>

<div id="roadmap-live-summary" class="card" style="padding:1rem;margin-bottom:1rem;color:var(--text-muted);font-size:0.875rem">Loading roadmap engagement...</div>

<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1.25rem">
  <!-- Shipped -->
  <div>
    <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:1rem">
      <span style="width:10px;height:10px;background:var(--success);border-radius:50%"></span>
      <span style="font-weight:700">Shipped</span>
      <span class="badge badge-success" style="margin-left:auto">v2.4</span>
    </div>
    <div class="flex flex-col gap-3">
      ${roadmapCard('Canvas Signature Drawing','Draw your signature directly with mouse or touch, with pen size and color controls.','success','Shipped v2.4')}
      ${roadmapCard('Dropdown/Select Field Type','Add select dropdowns to forms with editable option lists and default values.','success','Shipped v2.4')}
      ${roadmapCard('Evidence Bundle Generator','Create court-admissible bundles with certificates, geo records, and TSA tokens.','success','Shipped v2.3')}
      ${roadmapCard('Visual Workflow Builder','Drag-and-drop workflow designer with conditional logic and SLA timers.','success','Shipped v2.2')}
      ${roadmapCard('SCIM 2.0 Provisioning','Auto-sync users and groups from Okta, Azure AD, and other IdPs.','success','Shipped v2.1')}
      ${roadmapCard('Legal Hold Management','Preserve documents from retention policies during litigation.','success','Shipped v2.0')}
    </div>
  </div>

  <!-- In Progress -->
  <div>
    <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:1rem">
      <span style="width:10px;height:10px;background:var(--warning);border-radius:50%;animation:pulse 1.5s infinite"></span>
      <span style="font-weight:700">In Progress</span>
      <span class="badge badge-warning" style="margin-left:auto">Q2 2026</span>
    </div>
    <div class="flex flex-col gap-3">
      ${roadmapCard('AI Document Analysis','Auto-detect signature fields, fill in known fields, and flag risky clauses using GPT-4.','warning','~70% complete')}
      ${roadmapCard('Mobile Native Apps','iOS and Android apps for on-the-go signing with biometric authentication.','warning','~55% complete')}
      ${roadmapCard('Bulk Send','Send one template to 1,000+ recipients simultaneously with personalized fields.','warning','~40% complete')}
      ${roadmapCard('Advanced Analytics Dashboard','Custom reports, conversion funnels, and team performance metrics.','warning','~30% complete')}
      ${roadmapCard('DocuSign Migration Tool','Import envelopes, templates, and audit trails from DocuSign.','warning','~25% complete')}
    </div>
  </div>

  <!-- Planned -->
  <div>
    <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:1rem">
      <span style="width:10px;height:10px;background:var(--border);border-radius:50%"></span>
      <span style="font-weight:700">Planned</span>
      <span class="badge badge-secondary" style="margin-left:auto">H2 2026</span>
    </div>
    <div class="flex flex-col gap-3">
      ${roadmapCard('Notarization (RON)','Remote Online Notarization with video verification and notary seal.','secondary','Q3 2026')}
      ${roadmapCard('Salesforce Integration','Native Salesforce app to send and track envelopes from within CRM.','secondary','Q3 2026')}
      ${roadmapCard('In-Person Signing Kiosk','Tablet-based kiosk mode for signing documents face-to-face.','secondary','Q3 2026')}
      ${roadmapCard('eID Verification','Government-grade ID verification (passport, drivers licence) using AI.','secondary','Q4 2026')}
      ${roadmapCard('On-Premises Deployment','Self-hosted Kubernetes deployment option for air-gapped environments.','secondary','Q4 2026')}
      ${roadmapCard('Zapier & Make Integration','No-code automation with 2,000+ apps via Zapier and Make.com.','secondary','Q4 2026')}
      ${roadmapCard('Custom AI Workflow Agents','LLM-powered agents that auto-route, remind, and escalate based on context.','secondary','2027')}
    </div>
  </div>
</div>
`);

function roadmapCard(title, desc, status, label) {
  const titleArg = typeof jsArg === 'function' ? jsArg(title) : `'${String(title).replace(/'/g, "\\'")}'`;
  return `<div class="card" style="padding:1.125rem;cursor:pointer" onmouseenter="this.style.boxShadow='var(--shadow-lg)'" onmouseleave="this.style.boxShadow=''">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.5rem">
      <div style="font-weight:600;font-size:0.9rem;flex:1;margin-right:0.5rem">${title}</div>
      <span class="badge badge-${status}" style="font-size:0.7rem;flex-shrink:0">${label}</span>
    </div>
    <p style="font-size:0.8rem;color:var(--text-secondary);line-height:1.45;margin-bottom:0.625rem">${desc}</p>
    <div class="flex gap-2">
      <button class="btn btn-ghost btn-sm" style="font-size:0.75rem" onclick="upvoteRoadmapItemLive(${titleArg})" >${icon('trending-up')} Upvote</button>
      <button class="btn btn-ghost btn-sm" style="font-size:0.75rem" onclick="openRoadmapNotifyModal(${titleArg})">${icon('bell')} Notify Me</button>
    </div>
  </div>`;
}

async function roadmap_init() {
  if (!await ensureHanmakApi()) return;
  await renderRoadmapSummaryLive();
}

async function roadmapCreateSettingLive(key, value) {
  const orgId = await firstOrganizationId();
  return hanmakApi('/app-settings/', {
    method: 'POST',
    body: JSON.stringify({organization: orgId, namespace: 'roadmap', key, value, is_secret: false}),
  });
}

async function roadmapSettingsLive() {
  const orgId = await firstOrganizationId();
  const data = await hanmakApi(`/app-settings/?organization=${orgId}&namespace=roadmap&page_size=250`);
  return (data.results || data).filter(row => row.namespace === 'roadmap');
}

async function renderRoadmapSummaryLive() {
  const el = document.getElementById('roadmap-live-summary');
  if (!el) return;
  try {
    const rows = await roadmapSettingsLive();
    const requests = rows.filter(row => row.key.startsWith('request_')).length;
    const votes = rows.filter(row => row.key.startsWith('vote_')).length;
    const watchers = rows.filter(row => row.key.startsWith('subscriber_') || row.key.startsWith('notify_')).length;
    el.innerHTML = `<div style="display:flex;gap:1rem;flex-wrap:wrap">
      <span><strong style="color:var(--text-primary)">${requests}</strong> feature requests</span>
      <span><strong style="color:var(--text-primary)">${votes}</strong> upvotes</span>
      <span><strong style="color:var(--text-primary)">${watchers}</strong> roadmap watchers</span>
      <span style="margin-left:auto">Stored through backend app settings</span>
    </div>`;
  } catch (error) {
    el.innerHTML = `<span style="color:var(--danger)">Could not load roadmap engagement: ${escapeHtml(error.message)}</span>`;
  }
}

function openRoadmapRequestModal() {
  openModal(`
    <div class="modal-header"><h3 class="modal-title">Submit Feature Request</h3><button class="modal-close" onclick="closeModal()">x</button></div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Feature title</label><input id="roadmap-request-title" class="form-input" placeholder="Example: bulk template import"></div>
      <div class="form-group"><label class="form-label">Why it matters</label><textarea id="roadmap-request-desc" class="form-input" rows="4" placeholder="Describe the workflow this should unlock"></textarea></div>
      <div class="form-group"><label class="form-label">Contact email</label><input id="roadmap-request-email" class="form-input" type="email" placeholder="you@example.com"></div>
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitRoadmapRequestLive()">${icon('send')} Submit</button></div>
  `);
}

async function submitRoadmapRequestLive() {
  const title = document.getElementById('roadmap-request-title')?.value?.trim();
  const description = document.getElementById('roadmap-request-desc')?.value?.trim();
  const email = document.getElementById('roadmap-request-email')?.value?.trim();
  if (!title) return showToast('Feature title is required', 'error');
  try {
    await roadmapCreateSettingLive(`request_${Date.now()}`, {title, description, email, created_at: new Date().toISOString()});
    closeModal();
    showToast('Feature request saved', 'success');
    renderRoadmapSummaryLive();
  } catch (error) {
    showToast(`Feature request failed: ${error.message}`, 'error', 7000);
  }
}

function openRoadmapSubscribeModal() {
  openModal(`
    <div class="modal-header"><h3 class="modal-title">Subscribe to Roadmap Updates</h3><button class="modal-close" onclick="closeModal()">x</button></div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Email</label><input id="roadmap-subscribe-email" class="form-input" type="email" placeholder="you@example.com"></div>
      <div class="form-group"><label class="form-label">Digest cadence</label><select id="roadmap-subscribe-cadence" class="form-input"><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="major_release">Major releases only</option></select></div>
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitRoadmapSubscribeLive()">${icon('bell')} Subscribe</button></div>
  `);
}

async function submitRoadmapSubscribeLive() {
  const email = document.getElementById('roadmap-subscribe-email')?.value?.trim();
  const cadence = document.getElementById('roadmap-subscribe-cadence')?.value || 'monthly';
  if (!email) return showToast('Email is required', 'error');
  try {
    await roadmapCreateSettingLive(`subscriber_${Date.now()}`, {email, cadence, created_at: new Date().toISOString()});
    closeModal();
    showToast('Roadmap subscription saved', 'success');
    renderRoadmapSummaryLive();
  } catch (error) {
    showToast(`Subscription failed: ${error.message}`, 'error', 7000);
  }
}

async function upvoteRoadmapItemLive(title) {
  try {
    await roadmapCreateSettingLive(`vote_${Date.now()}`, {title, created_at: new Date().toISOString()});
    showToast('Upvote saved', 'success');
    renderRoadmapSummaryLive();
  } catch (error) {
    showToast(`Upvote failed: ${error.message}`, 'error', 7000);
  }
}

function openRoadmapNotifyModal(title) {
  openModal(`
    <div class="modal-header"><h3 class="modal-title">Notify Me</h3><button class="modal-close" onclick="closeModal()">x</button></div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Feature</label><div class="form-input" style="height:auto;background:var(--bg-secondary)">${escapeHtml(title)}</div></div>
      <div class="form-group"><label class="form-label">Email</label><input id="roadmap-notify-email" class="form-input" type="email" placeholder="you@example.com"></div>
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitRoadmapNotifyLive(${typeof jsArg === 'function' ? jsArg(title) : `'${String(title).replace(/'/g, "\\'")}'`})">${icon('bell')} Notify Me</button></div>
  `);
}

async function submitRoadmapNotifyLive(title) {
  const email = document.getElementById('roadmap-notify-email')?.value?.trim();
  if (!email) return showToast('Email is required', 'error');
  try {
    await roadmapCreateSettingLive(`notify_${Date.now()}`, {title, email, created_at: new Date().toISOString()});
    closeModal();
    showToast('Feature notification saved', 'success');
    renderRoadmapSummaryLive();
  } catch (error) {
    showToast(`Notification failed: ${error.message}`, 'error', 7000);
  }
}
