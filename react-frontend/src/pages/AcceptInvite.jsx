import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';

export default function AcceptInvite() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <div style={{ minHeight: '100vh', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ background: 'white', borderRadius: 12, padding: '36px 32px', maxWidth: 420, width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.10)', border: '1px solid #e2e8f0' }}>
          <div style={{ fontWeight: 800, fontSize: 22, color: '#2563eb', marginBottom: 16 }}>HanMak</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Invalid Invitation Link</div>
          <div style={{ color: '#dc2626', fontSize: 14, marginBottom: 20 }}>No invitation token found. Please use the link from your invitation email.</div>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => navigate('/login')}>Back to Login</button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 8) { setErrorMsg('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setErrorMsg('Passwords do not match.'); return; }
    setErrorMsg('');
    setSubmitting(true);
    try {
      await apiClient.post('/invitations/accept/', { token, password, username: username.trim() || undefined });
      setDone(true);
    } catch (err) {
      const d = err.response?.data;
      if (d && typeof d === 'object' && !d.detail) {
        setErrorMsg(Object.entries(d).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' | '));
      } else {
        setErrorMsg(d?.detail || err.message || 'Could not accept invitation.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f1f5f9',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        background: 'white',
        borderRadius: 12,
        padding: '36px 32px',
        width: '100%',
        maxWidth: 420,
        boxShadow: '0 8px 32px rgba(0,0,0,0.10)',
        border: '1px solid #e2e8f0',
      }}>
        <div style={{ fontWeight: 800, fontSize: 22, color: '#2563eb', marginBottom: 4 }}>HanMak</div>

        {done ? (
          <div style={{ textAlign: 'center', padding: '24px 0 16px' }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>🎉</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>You're In!</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>
              Your account has been created and your invitation accepted. Sign in to get started.
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => navigate('/login')}>
              Sign In
            </button>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, marginTop: 16 }}>Accept Invitation</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
              Create your account to join your organization on HanMak.
            </div>

            {errorMsg && (
              <div style={{ background: '#fee2e2', color: '#b91c1c', borderRadius: 7, padding: '10px 12px', fontSize: 13, marginBottom: 16 }}>
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Username <span style={{ color: '#64748b', fontWeight: 400 }}>(optional)</span></label>
                <input
                  className="form-input"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Leave blank to use your email prefix"
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input
                  className="form-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Confirm Password</label>
                <input
                  className="form-input"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repeat password"
                  required
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', marginTop: 8 }}
                disabled={submitting}
              >
                {submitting ? 'Creating account…' : 'Accept & Create Account'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
