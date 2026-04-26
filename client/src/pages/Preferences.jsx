// src/pages/Preferences.jsx
import { useState, useEffect } from 'react';
import { Plus, Trash2, Save, ChevronDown, ChevronUp } from 'lucide-react';
import api from '../services/api';

const WORK_TYPES   = ['Full-time', 'Part-time', 'Remote', 'Hybrid', 'On-site'];
const LOOKBACK_OPT = [
  { label:'Last 1 hour',   value:'1hr'   },
  { label: 'Last 3 hours', value: '3hr' },
  { label:'Last 6 hours',  value:'6hr'   },
  { label:'Last 12 hours', value:'12hr'  },
  { label: 'Last 24 hours', value: '24hr' },
  { label: 'Last 48 hours', value: '48hr' },
  { label:'Last 3 days',   value:'72hr'  },
  { label:'Last week',     value:'1week' },
  { label:'Last 30 days',  value:'30days'},
];
const INTERVAL_OPT = [6, 12, 24, 48];

const newSet = (i) => ({
  id: `set_${Date.now()}_${i}`,
  name: `Set ${i + 1}`,
  roles: [],
  locations: [],
  workTypes: ['Remote'],
  lookback: '24hr',
  interval: 12,
  enabled: true,
  lastScrapedAt: null,
  totalScrapes: 0,
});

function TagInput({ value, onChange, placeholder }) {
  const [input, setInput] = useState('');
  const arr = Array.isArray(value) ? value : [];
  function add() {
    const v = input.trim();
    if (v && !arr.includes(v)) { onChange([...arr, v]); setInput(''); }
  }
  return (
    <div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
        {arr.map(t => (
          <span key={t} className="chip chip-active">
            {t}
            <button onClick={() => onChange(arr.filter(x => x !== t))}
              style={{ background:'none', border:'none', color:'inherit', cursor:'pointer', padding:'0 0 0 4px', lineHeight:1 }}>×</button>
          </span>
        ))}
      </div>
      <div style={{ display:'flex', gap:8 }}>
        <input className="field-input" style={{ flex:1 }} placeholder={placeholder}
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())} />
        <button className="btn btn-secondary btn-sm" onClick={add}>Add</button>
      </div>
    </div>
  );
}

function SetEditor({ set, index, onChange, onDelete }) {
  const [open, setOpen] = useState(index === 0);
  const upd = (k, v) => onChange({ ...set, [k]: v });

  return (
    <div className="glass-card" style={{ overflow:'hidden', marginBottom:16 }}>
      {/* Header */}
      <div
        onClick={() => setOpen(!open)}
        style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 18px', cursor:'pointer', background: open ? 'rgba(99,102,241,0.06)' : 'transparent', borderBottom: open ? '1px solid var(--border)' : 'none' }}
      >
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{
            width:10, height:10, borderRadius:'50%',
            background: set.enabled ? 'var(--color-success)' : 'var(--text-muted)',
            boxShadow: set.enabled ? '0 0 6px var(--color-success)' : 'none',
          }} />
          <input
            value={set.name}
            onChange={e => { e.stopPropagation(); upd('name', e.target.value); }}
            onClick={e => e.stopPropagation()}
            style={{ background:'none', border:'none', color:'var(--text-primary)', fontWeight:700, fontSize:14, cursor:'text', outline:'none', width:160 }}
          />
          {set.totalScrapes > 0 && <span style={{ fontSize:11, color:'var(--text-muted)' }}>{set.totalScrapes} scrapes</span>}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }} onClick={e => e.stopPropagation()}>
          {/* Enable toggle */}
          <button
            onClick={() => upd('enabled', !set.enabled)}
            style={{
              width:40, height:22, borderRadius:11, border:'none', cursor:'pointer', position:'relative', transition:'background 0.2s',
              background: set.enabled ? 'var(--color-primary)' : 'var(--text-muted)',
            }}
            title={set.enabled ? 'Disable set' : 'Enable set'}
          >
            <span style={{
              position:'absolute', top:3, left: set.enabled ? 20 : 3,
              width:16, height:16, borderRadius:'50%', background:'#fff', transition:'left 0.2s',
            }} />
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => onDelete(set.id)} title="Delete set"><Trash2 size={13} color="var(--color-error)" /></button>
          {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </div>
      </div>

      {/* Body */}
      {open && (
        <div style={{ padding:18 }}>
          {/* Roles */}
          <div className="field-group">
            <label className="field-label">Target Roles</label>
            <TagInput value={set.roles} onChange={v => upd('roles', v)} placeholder="e.g. Frontend Engineer Intern, SWE Intern…" />
          </div>

          {/* Locations */}
          <div className="field-group">
            <label className="field-label">Locations</label>
            <TagInput value={set.locations} onChange={v => upd('locations', v)} placeholder="e.g. Remote, Bangalore, USA…" />
          </div>

          {/* Work types */}
          <div className="field-group">
            <label className="field-label">Work Types</label>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              {WORK_TYPES.map(wt => (
                <button key={wt}
                  className={`chip ${set.workTypes?.includes(wt) ? 'chip-active' : ''}`}
                  style={{ cursor:'pointer' }}
                  onClick={() => upd('workTypes',
                    set.workTypes?.includes(wt)
                      ? set.workTypes.filter(x => x !== wt)
                      : [...(set.workTypes || []), wt]
                  )}
                >{wt}</button>
              ))}
            </div>
          </div>

          <div className="grid-2">
            {/* Lookback */}
            <div className="field-group">
              <label className="field-label">Look-back Period</label>
              <select className="field-input" value={set.lookback} onChange={e => upd('lookback', e.target.value)}>
                {LOOKBACK_OPT.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {/* Interval */}
            <div className="field-group">
              <label className="field-label">Scan Interval</label>
              <select className="field-input" value={set.interval} onChange={e => upd('interval', parseInt(e.target.value))}>
                {INTERVAL_OPT.map(h => <option key={h} value={h}>Every {h} hours</option>)}
              </select>
            </div>
          </div>

          {set.lastScrapedAt && (
            <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:-8 }}>
              Last scraped: {new Date(set.lastScrapedAt).toLocaleString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function Preferences() {
  const [sets, setSets]     = useState([newSet(0)]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [msg, setMsg]         = useState({ type:'', text:'' });

  useEffect(() => {
    api.get('/api/preferences').then(r => {
      if (r.data?.preference_sets?.length > 0) setSets(r.data.preference_sets);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  function updateSet(idx, updated) {
    setSets(prev => prev.map((s, i) => i === idx ? updated : s));
  }

  function deleteSet(id) {
    setSets(prev => prev.filter(s => s.id !== id));
  }

  async function handleSave() {
    setSaving(true); setMsg({ type:'', text:'' });
    try {
      await api.post('/api/preferences', { preference_sets: sets });
      setMsg({ type:'success', text:'Preferences saved. The scheduler will pick them up on the next cycle.' });
    } catch (e) { setMsg({ type:'error', text: e.message }); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="flex-center" style={{ minHeight:'60vh' }}><div className="spinner spinner-lg"/></div>;

  return (
    <div className="fade-in" style={{ maxWidth:700 }}>
      <div className="flex-between page-header">
        <div>
          <h1 className="page-title">Preferences</h1>
          <p className="page-subtitle">Each set runs independently on its own schedule</p>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <button className="btn btn-secondary" onClick={() => setSets(prev => [...prev, newSet(prev.length)])}>
            <Plus size={14}/> Add Set
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <span className="spinner"/> : <><Save size={14}/> Save All</>}
          </button>
        </div>
      </div>

      {msg.text && <div className={`alert alert-${msg.type}`} style={{ marginBottom:20 }}>{msg.text}</div>}

      {sets.length === 0 ? (
        <div className="glass-card empty-state">
          <h3>No preference sets</h3>
          <p>Click "Add Set" to create your first search configuration.</p>
          <button className="btn btn-primary" style={{ margin:'16px auto 0' }} onClick={() => setSets([newSet(0)])}>
            <Plus size={14}/> Create First Set
          </button>
        </div>
      ) : (
        sets.map((set, i) => (
          <SetEditor key={set.id} set={set} index={i} onChange={v => updateSet(i, v)} onDelete={deleteSet} />
        ))
      )}

      {sets.length > 0 && (
        <div style={{ display:'flex', justifyContent:'flex-end', marginTop:8 }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <span className="spinner"/> : <><Save size={14}/> Save All</>}
          </button>
        </div>
      )}
    </div>
  );
}
