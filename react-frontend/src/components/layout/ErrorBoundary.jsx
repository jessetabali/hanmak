import { Component } from 'react';
import { useErrorLogStore } from '../../store/errorLogStore';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'The page failed to render.' };
  }

  componentDidCatch(error, info) {
    try {
      useErrorLogStore.getState().logRenderError(error, info);
    } catch {
      // Error logging must never make a render failure worse.
    }
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, message: '' });
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{ padding: '2rem' }}>
        <div
          style={{
            maxWidth: 720,
            margin: '0 auto',
            background: 'var(--bg-card)',
            border: '1px solid var(--danger)',
            borderRadius: 8,
            padding: '1.25rem',
          }}
        >
          <h1 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>This page could not render</h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
            The error was captured in System → Error Log for diagnosis.
          </p>
          <pre
            style={{
              margin: 0,
              padding: '0.75rem',
              background: 'var(--bg-secondary)',
              borderRadius: 6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontSize: 12,
            }}
          >
            {this.state.message}
          </pre>
        </div>
      </div>
    );
  }
}
