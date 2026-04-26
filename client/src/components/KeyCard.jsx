// src/components/KeyCard.jsx
import { useState } from 'react';
import { Check, Trash2, Plus, RefreshCw } from 'lucide-react';
import api from '../services/api';

const KEY_META = {
  apify:       { label:'Apify',       color:'#f59e0b', desc:'Required for internship scraping', link:'https://console.apify.com/account/integrations' },
  gemini:      { label:'Gemini',      color:'#4285f4', desc:'AI model for resume parsing & cover letters', link:'https://aistudio.google.com/app/apikey' },
  openrouter:  { label:'OpenRouter',  color:'#6366f1', desc:'Preferred: routes to 200+ AI models', link:'https://openrouter.ai/keys' },
};

export default function KeyCard({ keyName, savedKey, onSaved, onDeleted }) {
  const [value, setValue]     = useState('');
  const [adding, setAdding]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const meta = KEY_META[keyName] || { label: keyName, color:'#6366f1', desc:'', link:'' };

  async function handleSave() {
    if (!value.trim()) return;
    setLoading(true); setError('');
    try {
      const { data } = await api.post('/api/keys', { key_name: keyName, key_value: value.trim() });
      onSaved(data);
      setValue(''); setAdding(false);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function handleDelete() {
    if (!savedKey?.id) return;
    if (!confirm(`Delete ${meta.label} key?`)) return;
    try {
      await api.delete(`/api/keys/${savedKey.id}`);
      onDeleted(keyName);
    } catch (e) { setError(e.message); }
  }

  return (
    <div className="glass-card" style={{ padding:20 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
        <div style={{
          width:36, height:36, borderRadius:10,
          background:`${meta.color}22`, border:`1px solid ${meta.color}44`,
          display:'flex', alignItems:'center', justifyContent:'center',
          fontWeight:800, fontSize:14, color:meta.color,
        }}>
          {meta.label.charAt(0)}
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, fontSize:14 }}>{meta.label}</div>
          <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>{meta.desc}</div>
        </div>
        {savedKey ? (
          <span className="pill pill-success">
            <Check size={10} /> Active
          </span>
        ) : (
          <span className="pill pill-neutral">Not set</span>
        )}
      </div>

      {savedKey && (
        <div style={{
          padding:'8px 12px', borderRadius:8,
          background:'var(--bg-input)', border:'1px solid var(--border)',
          fontFamily:'var(--font-mono)', fontSize:13, color:'var(--text-secondary)',
          marginBottom:12, display:'flex', justifyContent:'space-between', alignItems:'center',
        }}>
          <span>{savedKey.key_hint || '••••••••'}</span>
          <div style={{ display:'flex', gap:6 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setAdding(true)}
              title="Update key"
            >
              <RefreshCw size={13} />
            </button>
            <button className="btn btn-danger btn-sm" onClick={handleDelete} title="Delete key">
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      )}

      {(!savedKey || adding) && (
        <div style={{ display:'flex', gap:8, flexDirection:'column' }}>
          <input
            className="field-input"
            type="password"
            placeholder={`Paste your ${meta.label} key…`}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
          />
          {error && <p style={{ fontSize:12, color:'var(--color-error)' }}>{error}</p>}
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={loading || !value.trim()}>
              {loading ? <span className="spinner" /> : <><Check size={13}/> Save</>}
            </button>
            {adding && <button className="btn btn-ghost btn-sm" onClick={() => { setAdding(false); setValue(''); }}>Cancel</button>}
          </div>
        </div>
      )}

      {!adding && (
        <a href={meta.link} target="_blank" rel="noopener noreferrer" style={{ fontSize:11, color:'var(--color-primary-light)', marginTop:8, display:'inline-block' }}>
          How to get this key →
        </a>
      )}
    </div>
  );
}
