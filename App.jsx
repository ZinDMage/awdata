import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Dashboard from './awsales_v6.jsx';
import Login from './Login.jsx';

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0B0B0C',
        color: '#fff',
        fontFamily: 'sans-serif'
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

  if (!session) {
    return <Login />;
  }

  return <Dashboard session={session} />;
}
