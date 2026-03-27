import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/services/supabaseClient';
import { MetricsProvider } from '@/contexts/MetricsContext';
import Dashboard from '@/components/Dashboard';
import Login from '@/components/Login';
import ErrorBoundary from '@/components/ErrorBoundary';

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState(null);

  const checkSession = useCallback(() => {
    setLoading(true);
    setSessionError(null);

    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Timeout')), 10000);
    });

    Promise.race([supabase.auth.getSession(), timeoutPromise])
      .then((result) => {
        const session = result?.data?.session ?? null;
        setSession(session);
      })
      .catch((err) => {
        console.error('[App] getSession failed:', err);
        setSessionError(err);
      })
      .finally(() => {
        clearTimeout(timer);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    checkSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
      }
    );

    return () => subscription.unsubscribe();
  }, [checkSession]);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-background-primary, #0B0B0C)',
        color: 'var(--color-text-primary, #fff)',
        fontFamily: 'var(--font-sans, sans-serif)'
      }}>
        <div style={{ width: 40, height: 40, border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#007AFF', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>
          {`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}
        </style>
      </div>
    );
  }

  if (sessionError) {
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
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary, #fff)', marginBottom: 8 }}>Não foi possível verificar sua sessão</div>
          <div style={{ fontSize: 13, marginBottom: 20 }}>Verifique sua conexão e tente novamente.</div>
          <button onClick={checkSession} style={{ padding: '8px 20px', borderRadius: 10, border: 'none', background: '#007AFF', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Tentar novamente</button>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Login />;
  }

  return (
    <ErrorBoundary>
      <MetricsProvider>
        <Dashboard session={session} />
      </MetricsProvider>
    </ErrorBoundary>
  );
}
