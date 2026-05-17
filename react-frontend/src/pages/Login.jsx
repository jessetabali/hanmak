import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { apiClient, setAuthTokens } from '../api/client';
import { EP } from '../api/endpoints';
import { useAuthStore } from '../store/authStore';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const fetchMe = useAuthStore(s => s.fetchMe);
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const from = location.state?.from?.pathname || '/';

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.username || !form.password) {
      setError('Username and password are required.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { data } = await apiClient.post(EP.TOKEN_OBTAIN, {
        username: form.username,
        password: form.password,
      });
      setAuthTokens(data.access, data.refresh);
      if (data.organization_id) {
        localStorage.setItem('HANMAK_ORGANIZATION_ID', String(data.organization_id));
      }
      await fetchMe();
      navigate(from, { replace: true });
    } catch (err) {
      const detail =
        err.response?.data?.detail ||
        err.response?.data?.non_field_errors?.[0] ||
        'Login failed. Check your credentials and try again.';
      setError(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontWeight: 800, fontSize: '1.75rem', color: 'var(--primary)', marginBottom: '0.25rem', letterSpacing: '-0.03em' }}>
            HanMak
          </div>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Enterprise Document Signing Platform
          </div>
        </div>

        <h2 className="auth-title" style={{ fontSize: '1.125rem', marginBottom: '1.25rem' }}>
          Sign in to your account
        </h2>

        <form onSubmit={submit}>
          <div className="form-group">
            <label className="form-label" htmlFor="login-username">Username or Email</label>
            <input
              id="login-username"
              className="form-input"
              type="text"
              name="username"
              value={form.username}
              onChange={handleChange}
              required
              autoFocus
              autoComplete="username"
              placeholder="admin"
            />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="login-password">Password</label>
            <input
              id="login-password"
              className="form-input"
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              required
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="alert alert-danger">
              {error}
            </div>
          )}

          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading}
            style={{ width: '100%', justifyContent: 'center', padding: '10px 16px', marginTop: '0.25rem' }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', fontSize: '0.8125rem', color: 'var(--text-muted)', textAlign: 'center' }}>
          Have a setup or invitation link?{' '}
          <a href="/setup" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>
            Complete your account setup
          </a>
        </div>
      </div>
    </div>
  );
}
