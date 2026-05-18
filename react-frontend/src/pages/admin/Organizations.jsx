import { useState, useEffect, useCallback, useRef } from 'react';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import { formatDate, formatDateTime } from '../../utils/formatting';
import Modal from '../../components/ui/Modal';
import Drawer from '../../components/ui/Drawer';
import Badge, { statusColor } from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import Pagination from '../../components/ui/Pagination';
import Avatar from '../../components/ui/Avatar';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

export default function Organizations() {
  const toast = useToast();
  const logoInputRef = useRef(null);

  // Org selection — read from localStorage first
  const [selectedOrgId, setSelectedOrgId] = useState(
    () => {
      const saved = localStorage.getItem('HANMAK_ORGANIZATION_ID');
      return saved ? Number(saved) : null;
    }
  );

  // Profile form (controlled)
  const [form, setForm] = useState({
    name: '', legal_name: '', slug: '', website: '', primary_contact_email: '',
  });
  const [formInitialized, setFormInitialized] = useState(false);

  // Modal state
  const [createModal, setCreateModal] = useState(false);
  const [addDomainModal, setAddDomainModal] = useState(false);
  const [subsidiaryModal, setSubsidiaryModal] = useState(false);
  const [transferModal, setTransferModal] = useState(false);
  const [deletionModal, setDeletionModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Form field state for modals
  const [newOrg, setNewOrg] = useState({ name: '', slug: '', primary_contact_email: '' });
  const [newDomain, setNewDomain] = useState('');
  const [newSubsidiary, setNewSubsidiary] = useState({ name: '', slug: '' });
  const [transferUserId, setTransferUserId] = useState('');
  const [deletionReason, setDeletionReason] = useState('');

  // Data queries
  const { data: orgsData, isLoading: loadingOrgs, refetch: refetchOrgs } = useApiQuery(['organizations'], EP.ORGANIZATIONS);
  const { data: domainsData, isLoading: loadingDomains, refetch: refetchDomains } = useApiQuery(['org-domains'], '/organization-domains/');
  const { data: usersData } = useApiQuery(['users'], EP.USERS);

  const orgs = orgsData?.results ?? [];
  const allDomains = domainsData?.results ?? [];
  const users = usersData?.results ?? [];

  // Resolve active org
  const org = orgs.find(o => o.id === selectedOrgId) || orgs[0] || null;
  const orgId = org?.id ?? null;
  const domains = allDomains.filter(d => d.organization === orgId);
  const subsidiaries = orgs.filter(o => o.parent === orgId);

  // Initialize profile form when org loads or changes
  useEffect(() => {
    if (org) {
      setForm({
        name: org.name || '',
        legal_name: org.legal_name || '',
        slug: org.slug || '',
        website: org.website || '',
        primary_contact_email: org.primary_contact_email || '',
      });
      setFormInitialized(true);
    }
  }, [org?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist org selection to localStorage
  const switchOrg = useCallback((id) => {
    setSelectedOrgId(id);
    localStorage.setItem('HANMAK_ORGANIZATION_ID', String(id));
    setFormInitialized(false);
  }, []);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const saveOrgMutation = useApiMutation(
    (payload) => apiClient.patch(EP.ORGANIZATION(orgId), payload),
    {
      invalidateKeys: ['organizations'],
      onSuccess: () => { toast.success('Organization saved'); refetchOrgs(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const createOrgMutation = useApiMutation(
    (payload) => apiClient.post(EP.ORGANIZATIONS, payload),
    {
      invalidateKeys: ['organizations'],
      onSuccess: (d) => {
        toast.success(`Organization ${d.data?.name || ''} created`);
        setCreateModal(false);
        setNewOrg({ name: '', slug: '', primary_contact_email: '' });
        refetchOrgs();
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const addDomainMutation = useApiMutation(
    (payload) => apiClient.post('/organization-domains/', payload),
    {
      invalidateKeys: ['org-domains'],
      onSuccess: (d) => {
        toast.success(`Add TXT record: ${d.data?.dns_record || 'DNS record created'}`);
        setAddDomainModal(false);
        setNewDomain('');
        refetchDomains();
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const verifyDomainMutation = useApiMutation(
    (id) => apiClient.post(`/organization-domains/${id}/verify/`, {}),
    {
      invalidateKeys: ['org-domains'],
      onSuccess: () => { toast.success('Domain verified'); refetchDomains(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const deleteDomainMutation = useApiMutation(
    (id) => apiClient.delete(`/organization-domains/${id}/`),
    {
      invalidateKeys: ['org-domains'],
      onSuccess: () => { toast.success('Domain removed'); refetchDomains(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const uploadLogoMutation = useApiMutation(
    (formData) => apiClient.post(EP.ORGANIZATION_LOGO(orgId), formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
    {
      invalidateKeys: ['organizations'],
      onSuccess: () => { toast.success('Organization logo uploaded'); refetchOrgs(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const createSubsidiaryMutation = useApiMutation(
    (payload) => apiClient.post(EP.ORGANIZATIONS, payload),
    {
      invalidateKeys: ['organizations'],
      onSuccess: () => {
        toast.success('Subsidiary created');
        setSubsidiaryModal(false);
        setNewSubsidiary({ name: '', slug: '' });
        refetchOrgs();
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const transferMutation = useApiMutation(
    ({ oid, user }) => apiClient.post(`/organizations/${oid}/transfer_ownership/`, { user }),
    {
      onSuccess: () => {
        toast.success('Ownership/admin access transferred');
        setTransferModal(false);
        setTransferUserId('');
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const deletionRequestMutation = useApiMutation(
    ({ id, reason }) => apiClient.post(`/organizations/${id}/request_deletion/`, { reason }),
    {
      onSuccess: (d) => {
        toast.success(`Deletion request recorded. Confirmation email queued${d.data?.deletion_request?.queued_email ? ` #${d.data.deletion_request.queued_email}` : ''}.`);
        setDeletionModal(false);
        setDeletionReason('');
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const deleteOrgMutation = useApiMutation(
    (id) => apiClient.delete(EP.ORGANIZATION(id)),
    {
      invalidateKeys: ['organizations'],
      onSuccess: () => {
        toast.success('Organization deleted');
        setConfirmDelete(false);
        localStorage.removeItem('HANMAK_ORGANIZATION_ID');
        setSelectedOrgId(null);
        setFormInitialized(false);
        refetchOrgs();
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  // ── Helpers ────────────────────────────────────────────────────────────────

  async function exportOrg() {
    if (!orgId) return;
    try {
      const { data } = await apiClient.get(`/organizations/${orgId}/export_data/`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hanmak-organization-${orgId}-export.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Organization export downloaded');
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    }
  }

  function handleLogoFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return toast.error('Choose a logo image first');
    const fd = new FormData();
    fd.append('logo', file);
    uploadLogoMutation.mutate(fd);
  }

  function handleCreateOrg() {
    if (!newOrg.name.trim()) return toast.error('Organization name is required');
    const slug = newOrg.slug.trim() || newOrg.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    createOrgMutation.mutate({ ...newOrg, slug });
  }

  function handleCreateSubsidiary() {
    if (!newSubsidiary.name.trim()) return toast.error('Name is required');
    const slug = newSubsidiary.slug.trim() || newSubsidiary.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    createSubsidiaryMutation.mutate({ parent: orgId, name: newSubsidiary.name.trim(), slug });
  }

  const isLoading = loadingOrgs || loadingDomains;

  if (isLoading) return <Spinner center />;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Organization</h1>
          <p className="page-subtitle">Live organization profile, domains, subsidiaries, export and ownership controls</p>
        </div>
        <div className="flex gap-2">
          {orgs.length > 1 && (
            <select
              className="form-input"
              style={{ width: 220 }}
              value={orgId || ''}
              onChange={e => switchOrg(Number(e.target.value))}
            >
              {orgs.filter(o => !o.parent).map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          )}
          <button className="btn btn-ghost" onClick={() => setCreateModal(true)}>+ New Organization</button>
          <button
            className="btn btn-primary"
            disabled={saveOrgMutation.isPending || !formInitialized}
            onClick={() => formInitialized && saveOrgMutation.mutate(form)}
          >
            Save Changes
          </button>
        </div>
      </div>

      {!org ? (
        <EmptyState title="No organization found" message="Create an organization to get started" />
      ) : (
        <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          {/* ── Left column ──────────────────────────────────────────── */}
          <div className="flex flex-col gap-4">
            {/* Profile Card */}
            <div className="card" style={{ padding: '1.5rem' }}>
              <h3 className="section-title" style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem' }}>
                Organization Profile
              </h3>
              <div className="form-group">
                <label className="form-label">Organization Name</label>
                <input
                  className="form-input"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Legal Name</label>
                <input
                  className="form-input"
                  value={form.legal_name}
                  onChange={e => setForm(f => ({ ...f, legal_name: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Slug</label>
                <input
                  className="form-input"
                  value={form.slug}
                  onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Website</label>
                <input
                  className="form-input"
                  value={form.website}
                  onChange={e => setForm(f => ({ ...f, website: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Primary Contact Email</label>
                <input
                  className="form-input"
                  type="email"
                  value={form.primary_contact_email}
                  onChange={e => setForm(f => ({ ...f, primary_contact_email: e.target.value }))}
                />
              </div>
            </div>

            {/* Verified Domains Card */}
            <div className="card" style={{ padding: '1.5rem' }}>
              <h3 className="section-title" style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem' }}>
                Verified Domains
              </h3>
              <div className="flex flex-col gap-2">
                {domains.length === 0 ? (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No domains added.</div>
                ) : domains.map(d => (
                  <div key={d.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem', border: '1px solid var(--border)', borderRadius: 7 }}>
                      <span className="mono" style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>
                        {d.domain}
                      </span>
                      <Badge color={statusColor(d.status)}>{d.status}</Badge>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => verifyDomainMutation.mutate(d.id)}
                        disabled={verifyDomainMutation.isPending}
                      >
                        Verify
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => deleteDomainMutation.mutate(d.id)}
                        disabled={deleteDomainMutation.isPending}
                      >
                        Delete
                      </button>
                    </div>
                    {d.dns_record && (
                      <div className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', margin: '-0.25rem 0 0.35rem 0.35rem' }}>
                        {d.dns_record}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <button
                className="btn btn-ghost btn-sm"
                style={{ marginTop: '0.75rem' }}
                onClick={() => { setNewDomain(''); setAddDomainModal(true); }}
              >
                + Add Domain
              </button>
            </div>
          </div>

          {/* ── Right column ─────────────────────────────────────────── */}
          <div className="flex flex-col gap-4">
            {/* Logo Card */}
            <div className="card" style={{ padding: '1.5rem' }}>
              <h3 className="section-title" style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem' }}>
                Organization Logo
              </h3>
              <div className="upload-zone" style={{ textAlign: 'center', padding: '1.5rem', border: '2px dashed var(--border)', borderRadius: 8 }}>
                {org.logo_url ? (
                  <img
                    src={org.logo_url}
                    alt="Organization logo"
                    style={{ width: 80, height: 80, borderRadius: 12, objectFit: 'contain', margin: '0 auto 0.75rem', display: 'block' }}
                  />
                ) : (
                  <div style={{ width: 80, height: 80, background: 'var(--primary)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: '1.5rem', margin: '0 auto 0.75rem' }}>
                    {org.name?.[0] || 'H'}
                  </div>
                )}
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleLogoFileChange}
                />
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ marginTop: '0.75rem' }}
                  disabled={uploadLogoMutation.isPending}
                  onClick={() => logoInputRef.current?.click()}
                >
                  {uploadLogoMutation.isPending ? 'Uploading...' : 'Upload Logo'}
                </button>
              </div>
            </div>

            {/* Subsidiaries Card */}
            <div className="card" style={{ padding: '1.5rem' }}>
              <h3 className="section-title" style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem' }}>
                Multi-Org / Subsidiaries
              </h3>
              {subsidiaries.length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No subsidiaries yet.</div>
              ) : subsidiaries.map(sub => (
                <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem', border: '1px solid var(--border)', borderRadius: 7, marginBottom: '0.5rem' }}>
                  <Avatar name={sub.name} size={36} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{sub.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{sub.slug}</div>
                  </div>
                  <Badge color="secondary">Subsidiary</Badge>
                </div>
              ))}
              <button
                className="btn btn-ghost btn-sm"
                style={{ marginTop: '0.5rem' }}
                onClick={() => { setNewSubsidiary({ name: '', slug: '' }); setSubsidiaryModal(true); }}
              >
                + Add Subsidiary
              </button>
            </div>

            {/* Danger Zone Card */}
            <div className="card" style={{ padding: '1.5rem' }}>
              <h3 className="section-title" style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem' }}>
                Danger Zone
              </h3>
              <div className="flex flex-col gap-2">
                <button
                  className="btn btn-ghost"
                  style={{ color: 'var(--warning)', justifyContent: 'flex-start' }}
                  onClick={exportOrg}
                >
                  Export All Organization Data
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ color: 'var(--danger)', justifyContent: 'flex-start' }}
                  onClick={() => { setTransferUserId(''); setTransferModal(true); }}
                >
                  Transfer Ownership
                </button>
                <button
                  className="btn btn-danger"
                  style={{ justifyContent: 'flex-start' }}
                  onClick={() => { setDeletionReason(''); setDeletionModal(true); }}
                >
                  Request Deletion
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ color: 'var(--danger)', justifyContent: 'flex-start' }}
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete Now (Super Admin)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Domain Modal ──────────────────────────────────────────── */}
      <Modal
        open={addDomainModal}
        onClose={() => setAddDomainModal(false)}
        title="Add Domain"
        size="sm"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setAddDomainModal(false)}>Cancel</button>
            <button
              className="btn btn-primary"
              disabled={addDomainMutation.isPending}
              onClick={() => {
                if (!newDomain.trim()) return toast.error('Domain is required');
                addDomainMutation.mutate({ organization: orgId, domain: newDomain.trim() });
              }}
            >
              Create DNS Record
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">Domain Name</label>
          <input
            className="form-input"
            placeholder="yourcompany.com"
            value={newDomain}
            onChange={e => setNewDomain(e.target.value)}
          />
        </div>
      </Modal>

      {/* ── New Organization Modal ────────────────────────────────────── */}
      <Modal
        open={createModal}
        onClose={() => setCreateModal(false)}
        title="Create Organization"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setCreateModal(false)}>Cancel</button>
            <button
              className="btn btn-primary"
              disabled={createOrgMutation.isPending}
              onClick={handleCreateOrg}
            >
              Create
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">Name</label>
          <input
            className="form-input"
            placeholder="Example Holdings"
            value={newOrg.name}
            onChange={e => setNewOrg(f => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Slug</label>
          <input
            className="form-input"
            placeholder="example-holdings"
            value={newOrg.slug}
            onChange={e => setNewOrg(f => ({ ...f, slug: e.target.value }))}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Primary Contact Email</label>
          <input
            className="form-input"
            type="email"
            placeholder="admin@example.com"
            value={newOrg.primary_contact_email}
            onChange={e => setNewOrg(f => ({ ...f, primary_contact_email: e.target.value }))}
          />
        </div>
      </Modal>

      {/* ── Add Subsidiary Modal ──────────────────────────────────────── */}
      <Modal
        open={subsidiaryModal}
        onClose={() => setSubsidiaryModal(false)}
        title="Add Subsidiary"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setSubsidiaryModal(false)}>Cancel</button>
            <button
              className="btn btn-primary"
              disabled={createSubsidiaryMutation.isPending}
              onClick={handleCreateSubsidiary}
            >
              Create
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">Name</label>
          <input
            className="form-input"
            placeholder="Acme EU"
            value={newSubsidiary.name}
            onChange={e => setNewSubsidiary(f => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Slug</label>
          <input
            className="form-input"
            placeholder="acme-eu"
            value={newSubsidiary.slug}
            onChange={e => setNewSubsidiary(f => ({ ...f, slug: e.target.value }))}
          />
        </div>
      </Modal>

      {/* ── Transfer Ownership Modal ──────────────────────────────────── */}
      <Modal
        open={transferModal}
        onClose={() => setTransferModal(false)}
        title="Transfer Ownership"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setTransferModal(false)}>Cancel</button>
            <button
              className="btn btn-primary"
              disabled={transferMutation.isPending}
              onClick={() => {
                if (!transferUserId) return toast.error('Select a user');
                transferMutation.mutate({ oid: orgId, user: transferUserId });
              }}
            >
              Transfer
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">New Owner</label>
          <select
            className="form-input"
            value={transferUserId}
            onChange={e => setTransferUserId(e.target.value)}
          >
            <option value="">Select user...</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>
                {u.display_name || [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username} — {u.email || u.username}
              </option>
            ))}
          </select>
        </div>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
          This promotes the selected member to organization admin. Full production ownership transfer can add email confirmation later.
        </p>
      </Modal>

      {/* ── Request Deletion Modal ────────────────────────────────────── */}
      <Modal
        open={deletionModal}
        onClose={() => setDeletionModal(false)}
        title="Request Organization Deletion"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setDeletionModal(false)}>Cancel</button>
            <button
              className="btn btn-danger"
              disabled={deletionRequestMutation.isPending}
              onClick={() => deletionRequestMutation.mutate({ id: orgId, reason: deletionReason })}
            >
              Request Deletion
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">Reason</label>
          <textarea
            className="form-input"
            rows={3}
            placeholder="Why should this organization be deleted?"
            value={deletionReason}
            onChange={e => setDeletionReason(e.target.value)}
          />
        </div>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
          This records a deletion request for confirmation and audit instead of immediately deleting tenant data.
        </p>
      </Modal>

      {/* ── Delete Now ConfirmDialog ──────────────────────────────────── */}
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => deleteOrgMutation.mutate(orgId)}
        title="Delete Organization"
        message={`Permanently delete organization "${org?.name}"? Use this only for super-admin cleanup after export/review. This cannot be undone.`}
        confirmLabel="Delete Now"
        danger
      />
    </div>
  );
}
