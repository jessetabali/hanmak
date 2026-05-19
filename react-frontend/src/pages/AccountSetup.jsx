import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';

export default function AccountSetup() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [step, setStep] = useState('loading'); // loading | form | success | error
  const [userInfo, setUserInfo] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setErrorMsg('No setup token found in this link. Please request a new one.');
      setStep('error');
      return;
    }
    apiClient
      .post('/account-recovery/inspect_token/', { token })
      .then((res) => {
        setUserInfo(res.data.user);
        setStep('form');
      })
      .catch((err) => {
        setErrorMsg(err.response?.data?.detail || err.message || 'This setup link is invalid or expired.');
        setStep('error');
      });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 8) { setErrorMsg('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setErrorMsg('Passwords do not match.'); return; }
    setErrorMsg('');
    setSubmitting(true);
    try {
      await apiClient.post('/account-recovery/complete/', { token, password });
      setStep('success');
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || err.response?.data?.password || err.message);
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

        {step === 'loading' && (
          <div style={{ textAlign: 'center', padding: '32px 0', color: '#64748b' }}>
            Validating your setup link…
          </div>
        )}

        {step === 'error' && (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, marginTop: 16 }}>Link Invalid</div>
            <div style={{ color: '#dc2626', fontSize: 14, marginBottom: 24 }}>{errorMsg}</div>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => navigate('/login')}>
              Back to Login
            </button>
          </>
        )}

        {step === 'form' && (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, marginTop: 16 }}>Set Your Password</div>
            {userInfo && (
              <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
                Setting up account for <strong>{userInfo.email || userInfo.username}</strong>
              </div>
            )}
            {errorMsg && (
              <div style={{ background: '#fee2e2', color: '#b91c1c', borderRadius: 7, padding: '10px 12px', fontSize: 13, marginBottom: 16 }}>
                {errorMsg}
              </div>
            )}
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">New Password</label>
                <input
                  className="form-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoFocus
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
                {submitting ? 'Setting password…' : 'Set Password & Continue'}
              </button>
            </form>
          </>
        )}

        {step === 'success' && (
          <>
            <div style={{ textAlign: 'center', padding: '24px 0 16px' }}>
              <div style={{ fontSize: '3rem', marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Password Set!</div>
              <div style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>
                Your account is ready. Sign in with your new password.
              </div>
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => navigate('/login')}>
                Go to Login
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
