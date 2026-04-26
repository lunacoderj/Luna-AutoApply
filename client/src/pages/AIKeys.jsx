// src/pages/AIKeys.jsx
import { useState, useEffect } from 'react';
import { Shield, Info } from 'lucide-react';
import api from '../services/api';
import KeyCard from '../components/KeyCard';

const KEY_NAMES = ['apify', 'gemini', 'openrouter'];

export default function AIKeys() {
  const [keys, setKeys]     = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/keys').then(r => {
      const map = {};
      (r.data || []).forEach(k => { map[k.key_name] = k; });
      setKeys(map);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  function onSaved(key) {
    setKeys(prev => ({ ...prev, [key.key_name]: key }));
  }

  function onDeleted(keyName) {
    setKeys(prev => {
      const next = { ...prev };
      delete next[keyName];
      return next;
    });
  }

  if (loading) return <div className="flex-center" style={{ minHeight:'60vh' }}><div className="spinner spinner-lg"/></div>;

  const allSet = KEY_NAMES.every(k => keys[k]);

  return (
    <div className="fade-in" style={{ maxWidth:640 }}>
      <div className="page-header">
        <h1 className="page-title">API Keys</h1>
        <p className="page-subtitle">Keys are encrypted with AES-256-CBC before storage — never stored in plain text</p>
      </div>

      {/* Encryption badge */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 16px', marginBottom:28, borderRadius:'var(--radius-sm)', background:'rgba(99,102,241,0.06)', border:'1px solid rgba(99,102,241,0.15)' }}>
        <Shield size={15} color="var(--color-primary-light)" />
        <span style={{ fontSize:13, color:'var(--text-secondary)' }}>All keys are encrypted at rest. Your raw key is never logged or stored in plaintext.</span>
      </div>

      {/* Setup guide */}
      {!allSet && (
        <div style={{ padding:'14px 16px', marginBottom:24, borderRadius:'var(--radius-sm)', background:'rgba(245,158,11,0.06)', border:'1px solid rgba(245,158,11,0.2)' }}>
          <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
            <Info size={15} color="var(--color-warning)" style={{ marginTop:1, flexShrink:0 }} />
            <div>
              <p style={{ fontSize:13, color:'#fde68a', fontWeight:600, marginBottom:4 }}>Setup required</p>
              <p style={{ fontSize:12, color:'var(--text-secondary)', lineHeight:1.6 }}>
                Add at least an <strong>Apify</strong> key to enable scraping. Add <strong>OpenRouter</strong> or <strong>Gemini</strong> for AI cover-letter generation and auto-apply.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Priority explanation */}
      <div className="glass-card" style={{ padding:'14px 16px', marginBottom:24 }}>
        <p style={{ fontSize:12, color:'var(--text-secondary)', lineHeight:1.7 }}>
          <strong style={{ color:'var(--text-primary)' }}>AI Priority:</strong> OpenRouter → Gemini → Server fallback.{' '}
          OpenRouter is preferred as it routes to 200+ models and typically has better rate limits.
        </p>
      </div>

      {/* Key cards */}
      <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
        {KEY_NAMES.map(name => (
          <KeyCard
            key={name}
            keyName={name}
            savedKey={keys[name] || null}
            onSaved={onSaved}
            onDeleted={onDeleted}
          />
        ))}
      </div>
    </div>
  );
}
