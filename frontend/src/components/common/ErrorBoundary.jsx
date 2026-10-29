import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Caught render error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '32px', textAlign: 'center', background: '#fff', borderRadius: '8px', margin: '24px', border: '1px solid #e2e8f0' }}>
          <h2 style={{ color: '#0F766E', marginBottom: '8px', fontSize: '1.25rem' }}>Interface Recovered</h2>
          <p style={{ color: '#64748b', marginBottom: '16px', fontSize: '0.9rem' }}>
            A temporary rendering error was safely caught. Your session remains active.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            style={{ padding: '8px 16px', background: '#0F766E', color: '#fff', borderRadius: '6px', border: 'none', cursor: 'pointer' }}
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
          >
            Reload Interface
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
