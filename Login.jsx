import React, { useState } from 'react';
import { supabase } from './supabaseClient';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  };

  return (
    <>
      <style>
        {`
          .login-container { min-height: 100vh; display: flex; flex-wrap: wrap-reverse; font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif; background-color: #030816; color: #fff; }
          .left-panel { flex: 1 1 50%; min-width: 320px; display: flex; flex-direction: column; justify-content: center; padding: 60px 8%; background: radial-gradient(circle at top left, #0D2659 0%, #030816 70%); position: relative; box-sizing: border-box; }
          .right-panel { flex: 1 1 50%; min-width: 320px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 5%; background-color: #030816; box-sizing: border-box; }
          .mobile-logo { display: none; margin-bottom: 24px; justify-content: center; align-items: center; }
          .form-header { text-align: left; margin-bottom: 40px; }
          
          @media (max-width: 768px) {
            .left-panel { display: none; }
            .right-panel { padding: 40px 24px; justify-content: flex-start; padding-top: 15vh; min-height: 100vh; }
            .mobile-logo { display: flex; }
            .form-header { text-align: center; }
          }
        `}
      </style>

      <div className="login-container">
        {/* Left Panel - Branding Area */}
        <div className="left-panel">
          <div style={{ maxWidth: 460 }}>
            {/* AwSales by Aswork Logo */}
            <div style={{ marginBottom: 40, display: 'inline-flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', lineHeight: 1 }}>
                <span style={{ fontSize: 48, fontWeight: 800, color: '#0EA5E9', letterSpacing: '-0.04em' }}>Aw</span>
                <span style={{ fontSize: 48, fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.04em' }}>sales</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.7)', alignSelf: 'flex-end', marginTop: 4, marginRight: 2 }}>
                by Aswork
              </div>
            </div>
            <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.6)', margin: '0 0 48px', lineHeight: 1.5, fontWeight: 400 }}>
              Painel interno de acompanhamento de resultados.
            </p>

            {/* Carousel UI Indicators */}
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ width: 32, height: 3, background: '#0D6EFD', borderRadius: 2 }} />
              <div style={{ width: 16, height: 3, background: 'rgba(255,255,255,0.15)', borderRadius: 2 }} />
              <div style={{ width: 16, height: 3, background: 'rgba(255,255,255,0.15)', borderRadius: 2 }} />
            </div>
          </div>
        </div>

        {/* Right Panel - Login Form Area */}
        <div className="right-panel">
          <div style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', height: '100%' }}>
            
            <div style={{ margin: 'auto 0' }}>
              
              {/* Mobile-only AwSales Logo */}
              <div className="mobile-logo">
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', lineHeight: 1 }}>
                    <span style={{ fontSize: 44, fontWeight: 800, color: '#0EA5E9', letterSpacing: '-0.04em' }}>Aw</span>
                    <span style={{ fontSize: 44, fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.04em' }}>sales</span>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.7)', alignSelf: 'flex-end', marginTop: 4, marginRight: 2 }}>
                    by Aswork
                  </div>
                </div>
              </div>

              <div className="form-header">
                <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.02em', color: '#fff' }}>
                  Bem-vindo de volta
                </h2>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', margin: 0 }}>
                  Entre com suas credenciais para acessar
                </p>
              </div>

              <form onSubmit={handleLogin} style={{ width: '100%' }}>
                {error && (
                  <div style={{ 
                    padding: '12px 16px', 
                    background: 'rgba(255, 69, 58, 0.1)', 
                    border: '1px solid rgba(255, 69, 58, 0.2)', 
                    borderRadius: 12, 
                    color: '#FF453A', 
                    fontSize: 13, 
                    marginBottom: 20,
                    fontWeight: 500
                  }}>
                    {error}
                  </div>
                )}

                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.85)', marginBottom: 8 }}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="exemplo@awsales.io"
                    required
                    style={{
                      width: '100%',
                      backgroundColor: '#F1F5F9', // Very light color identical to screenshot
                      border: 'none',
                      borderRadius: 12,
                      padding: '14px 16px',
                      fontSize: 15,
                      color: '#0F172A',
                      outline: '2px solid transparent',
                      transition: 'outline 0.2s cubic-bezier(0.4,0,0.2,1)',
                      boxSizing: 'border-box',
                      fontWeight: 500
                    }}
                    onFocus={(e) => { e.target.style.outline = '2px solid #0D6EFD'; }}
                    onBlur={(e) => { e.target.style.outline = '2px solid transparent'; }}
                  />
                </div>

                <div style={{ marginBottom: 32 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.85)', marginBottom: 8 }}>
                    Senha
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    style={{
                      width: '100%',
                      backgroundColor: '#F1F5F9',
                      border: 'none',
                      borderRadius: 12,
                      padding: '14px 16px',
                      fontSize: 15,
                      color: '#0F172A',
                      outline: '2px solid transparent',
                      transition: 'outline 0.2s cubic-bezier(0.4,0,0.2,1)',
                      boxSizing: 'border-box',
                      fontWeight: 500
                    }}
                    onFocus={(e) => { e.target.style.outline = '2px solid #0D6EFD'; }}
                    onBlur={(e) => { e.target.style.outline = '2px solid transparent'; }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '14px',
                    borderRadius: 12,
                    border: 'none',
                    background: loading ? 'rgba(13, 110, 253, 0.5)' : '#0066FF', // Bright solid blue
                    color: '#fff',
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    transition: 'background-color 0.2s, transform 0.1s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    boxShadow: '0 4px 14px rgba(13, 110, 253, 0.25)'
                  }}
                  onMouseDown={(e) => { if (!loading) e.target.style.transform = 'scale(0.98)'; }}
                  onMouseUp={(e) => { if (!loading) e.target.style.transform = 'scale(1)'; }}
                  onMouseLeave={(e) => { if (!loading) e.target.style.transform = 'scale(1)'; }}
                >
                  {loading ? 'Autenticando...' : (
                    <>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'translateX(-2px)' }}>
                        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>
                      </svg>
                      Entrar
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Footer Signature Aligned Bottom (AwData Typographic Logo) */}
            <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'center', paddingBottom: 24, paddingTop: 60 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: 0.7, transition: 'opacity 0.2s', cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.7}>
                <span style={{ fontSize: 12, fontWeight: 500, color: '#fff' }}>Powered by</span>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: '#0EA5E9', letterSpacing: '-0.04em' }}>Aw</span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.04em' }}>Data</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
