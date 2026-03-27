import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Erro capturado:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--color-background-primary, #0B0B0C)',
          color: 'var(--color-text-tertiary, #999)',
          fontFamily: 'var(--font-sans, sans-serif)'
        }}>
          <div style={{ textAlign: 'center', maxWidth: 420, padding: '0 24px' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary, #fff)', marginBottom: 8 }}>
              Algo deu errado
            </div>
            <div style={{ fontSize: 13, marginBottom: 20 }}>
              Ocorreu um erro inesperado. Tente novamente ou recarregue a página.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button
                onClick={this.handleReset}
                style={{
                  padding: '8px 20px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#007AFF',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Tentar novamente
              </button>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: '8px 20px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'transparent',
                  color: 'var(--color-text-tertiary, #999)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Recarregar página
              </button>
            </div>
            <details style={{ textAlign: 'left', marginTop: 12 }}>
              <summary style={{ fontSize: 11, color: 'var(--color-text-tertiary, #666)', cursor: 'pointer' }}>
                Detalhes técnicos
              </summary>
              <pre style={{
                marginTop: 8,
                padding: 12,
                borderRadius: 8,
                background: 'rgba(255,255,255,0.05)',
                fontSize: 11,
                color: 'var(--color-text-tertiary, #999)',
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}>
                {this.state.error?.message || 'Erro desconhecido'}
              </pre>
            </details>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
