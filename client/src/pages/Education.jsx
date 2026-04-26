// src/pages/Education.jsx
import { useState, useEffect, useRef } from 'react';
import { Save, Upload, GraduationCap, Briefcase, Code2, Sparkles, Plus, X } from 'lucide-react';
import api from '../services/api';

const SECTION = ({ title, icon:Icon, children }) => (
  <div className="glass-card" style={{ padding:24, marginBottom:24 }}>
    <h2 style={{ fontSize:15, fontWeight:700, marginBottom:20, display:'flex', alignItems:'center', gap:8 }}>
      <Icon size={15} color="var(--color-primary-light)" /> {title}
    </h2>
    {children}
  </div>
);

const SkillTags = ({ value, onChange, placeholder }) => {
  const [input, setInput] = useState('');
  const arr = Array.isArray(value) ? value : [];

  function add() {
    const v = input.trim();
    if (v && !arr.includes(v)) { onChange([...arr, v]); setInput(''); }
  }

  return (
    <div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:10 }}>
        {arr.map(tag => (
          <span key={tag} className="chip chip-active" style={{ cursor:'default' }}>
            {tag}
            <button onClick={() => onChange(arr.filter(t => t !== tag))} style={{ background:'none', border:'none', color:'inherit', cursor:'pointer', padding:0, marginLeft:2 }}>
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      <div style={{ display:'flex', gap:8 }}>
        <input
          className="field-input" style={{ flex:1 }}
          placeholder={placeholder || 'Type and press Enter or Add'}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())}
        />
        <button className="btn btn-secondary btn-sm" onClick={add}><Plus size={13}/></button>
      </div>
    </div>
  );
};

export default function Education() {
  const [form, setForm]     = useState({
    school:'', intermediate:'', degree:'', branch:'', cgpa:'', expected_graduation:'',
    skills:[], languages_known:[], hobbies:[],
    projects:[], experience:[],
    communication_skills:'', summary:'',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [msg, setMsg]         = useState({ type:'', text:'' });
  const [uploading, setUploading] = useState(false);
  const [parseStatus, setParseStatus] = useState('');
  const fileRef = useRef();

  useEffect(() => {
    api.get('/api/education').then(r => {
      if (r.data) setForm(f => ({ ...f, ...r.data }));
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const set = (k) => (v) => setForm(f => ({ ...f, [k]: typeof v === 'function' ? v(f[k]) : v }));
  const inp = (k) => (e) => set(k)(e.target.value);

  async function handleSave() {
    setSaving(true); setMsg({ type:'', text:'' });
    try {
      await api.put('/api/education', form);
      setMsg({ type:'success', text:'Education details saved.' });
    } catch (e) { setMsg({ type:'error', text: e.message }); }
    finally { setSaving(false); }
  }

  async function handleResumeUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setParseStatus('Uploading…');
    try {
      const fd = new FormData();
      fd.append('resume', file);
      await api.post('/api/resume/upload', fd, { headers:{ 'Content-Type':'multipart/form-data' } });
      setParseStatus('AI parsing started — fields will auto-fill in ~30 seconds.');
      // Poll status
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        const { data } = await api.get('/api/resume/status');
        if (data.onboarding_status === 'education_parsed') {
          clearInterval(poll);
          const ed = await api.get('/api/education');
          if (ed.data) setForm(f => ({ ...f, ...ed.data }));
          setParseStatus('✅ AI-parsed! Fields updated below.');
        }
        if (attempts > 20) { clearInterval(poll); setParseStatus('Parsing may still be in progress — refresh in a minute.'); }
      }, 5000);
    } catch (e) { setParseStatus(`Upload failed: ${e.message}`); }
    finally { setUploading(false); }
  }

  if (loading) return <div className="flex-center" style={{ minHeight:'60vh' }}><div className="spinner spinner-lg"/></div>;

  return (
    <div className="fade-in" style={{ maxWidth:760 }}>
      <div className="flex-between page-header">
        <div>
          <h1 className="page-title">Education & Profile</h1>
          <p className="page-subtitle">This data powers your AI cover letters and match scoring</p>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <button className="btn btn-secondary" onClick={() => fileRef.current.click()} disabled={uploading}>
            {uploading ? <span className="spinner" /> : <><Upload size={14}/> Upload Resume</>}
          </button>
          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" style={{ display:'none' }} onChange={handleResumeUpload} />
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <span className="spinner"/> : <><Save size={14}/> Save</>}
          </button>
        </div>
      </div>

      {parseStatus && <div className="alert alert-info" style={{ marginBottom:20 }}>{parseStatus}</div>}
      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {/* Academic */}
      <SECTION title="Academic Background" icon={GraduationCap}>
        <div className="grid-2">
          <div className="field-group"><label className="field-label">School / High School</label>
            <input className="field-input" value={form.school || ''} onChange={inp('school')} placeholder="e.g. Delhi Public School" /></div>
          <div className="field-group"><label className="field-label">Intermediate / 12th</label>
            <input className="field-input" value={form.intermediate || ''} onChange={inp('intermediate')} placeholder="e.g. CBSE Board" /></div>
          <div className="field-group"><label className="field-label">Degree</label>
            <input className="field-input" value={form.degree || ''} onChange={inp('degree')} placeholder="e.g. B.Tech" /></div>
          <div className="field-group"><label className="field-label">Branch / Field</label>
            <input className="field-input" value={form.branch || ''} onChange={inp('branch')} placeholder="e.g. Computer Science" /></div>
          <div className="field-group"><label className="field-label">CGPA / Percentage</label>
            <input className="field-input" value={form.cgpa || ''} onChange={inp('cgpa')} placeholder="e.g. 8.5" /></div>
          <div className="field-group"><label className="field-label">Expected Graduation</label>
            <input className="field-input" value={form.expected_graduation || ''} onChange={inp('expected_graduation')} placeholder="e.g. 2026" /></div>
        </div>
      </SECTION>

      {/* Skills */}
      <SECTION title="Skills & Languages" icon={Code2}>
        <div className="field-group"><label className="field-label">Technical Skills</label>
          <SkillTags value={form.skills} onChange={set('skills')} placeholder="e.g. React, Node.js, Python…" /></div>
        <div className="field-group"><label className="field-label">Programming Languages</label>
          <SkillTags value={form.languages_known} onChange={set('languages_known')} placeholder="e.g. JavaScript, TypeScript…" /></div>
        <div className="field-group"><label className="field-label">Hobbies / Interests</label>
          <SkillTags value={form.hobbies} onChange={set('hobbies')} placeholder="e.g. Open Source, Gaming…" /></div>
      </SECTION>

      {/* Projects */}
      <SECTION title="Projects" icon={Sparkles}>
        {(form.projects || []).map((p, i) => (
          <div key={i} style={{ marginBottom:16, padding:16, background:'var(--bg-input)', borderRadius:'var(--radius-sm)', border:'1px solid var(--border)' }}>
            <div className="flex-between" style={{ marginBottom:12 }}>
              <span style={{ fontSize:13, fontWeight:600 }}>Project {i+1}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => set('projects')(form.projects.filter((_,j)=>j!==i))}><X size={13}/></button>
            </div>
            <div className="grid-2">
              <div className="field-group" style={{ marginBottom:8 }}><label className="field-label">Name</label>
                <input className="field-input" value={p.name || ''} onChange={e => set('projects')(form.projects.map((x,j)=>j===i?{...x,name:e.target.value}:x))} /></div>
              <div className="field-group" style={{ marginBottom:8 }}><label className="field-label">Tech Stack</label>
                <input className="field-input" value={p.tech || ''} onChange={e => set('projects')(form.projects.map((x,j)=>j===i?{...x,tech:e.target.value}:x))} placeholder="React, Node, Postgres" /></div>
            </div>
            <div className="field-group" style={{ marginBottom:8 }}><label className="field-label">Description</label>
              <textarea className="field-input" rows={2} value={p.description || ''} onChange={e => set('projects')(form.projects.map((x,j)=>j===i?{...x,description:e.target.value}:x))} /></div>
            <div className="field-group" style={{ marginBottom:0 }}><label className="field-label">URL (optional)</label>
              <input className="field-input" value={p.url || ''} onChange={e => set('projects')(form.projects.map((x,j)=>j===i?{...x,url:e.target.value}:x))} placeholder="https://github.com/..." /></div>
          </div>
        ))}
        <button className="btn btn-secondary btn-sm" onClick={() => set('projects')([...(form.projects||[]),{name:'',description:'',tech:'',url:''}])}>
          <Plus size={13}/> Add Project
        </button>
      </SECTION>

      {/* Experience */}
      <SECTION title="Experience" icon={Briefcase}>
        {(form.experience || []).map((e, i) => (
          <div key={i} style={{ marginBottom:16, padding:16, background:'var(--bg-input)', borderRadius:'var(--radius-sm)', border:'1px solid var(--border)' }}>
            <div className="flex-between" style={{ marginBottom:12 }}>
              <span style={{ fontSize:13, fontWeight:600 }}>Experience {i+1}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => set('experience')(form.experience.filter((_,j)=>j!==i))}><X size={13}/></button>
            </div>
            <div className="grid-2">
              <div className="field-group" style={{ marginBottom:8 }}><label className="field-label">Company</label>
                <input className="field-input" value={e.company||''} onChange={ev => set('experience')(form.experience.map((x,j)=>j===i?{...x,company:ev.target.value}:x))} /></div>
              <div className="field-group" style={{ marginBottom:8 }}><label className="field-label">Role</label>
                <input className="field-input" value={e.role||''} onChange={ev => set('experience')(form.experience.map((x,j)=>j===i?{...x,role:ev.target.value}:x))} /></div>
              <div className="field-group" style={{ marginBottom:8 }}><label className="field-label">Duration</label>
                <input className="field-input" value={e.duration||''} placeholder="e.g. Jun 2024 – Aug 2024" onChange={ev => set('experience')(form.experience.map((x,j)=>j===i?{...x,duration:ev.target.value}:x))} /></div>
            </div>
            <div className="field-group" style={{ marginBottom:0 }}><label className="field-label">Description</label>
              <textarea className="field-input" rows={2} value={e.description||''} onChange={ev => set('experience')(form.experience.map((x,j)=>j===i?{...x,description:ev.target.value}:x))} /></div>
          </div>
        ))}
        <button className="btn btn-secondary btn-sm" onClick={() => set('experience')([...(form.experience||[]),{company:'',role:'',duration:'',description:''}])}>
          <Plus size={13}/> Add Experience
        </button>
      </SECTION>

      {/* Summary */}
      <SECTION title="Professional Summary" icon={Sparkles}>
        <div className="field-group"><label className="field-label">AI will use this for cover letters</label>
          <textarea className="field-input" rows={4} value={form.summary || ''} onChange={inp('summary')} placeholder="Write 2–3 sentences about yourself, your goals and strengths…" /></div>
        <div className="field-group"><label className="field-label">Communication / Soft Skills</label>
          <textarea className="field-input" rows={3} value={form.communication_skills || ''} onChange={inp('communication_skills')} placeholder="e.g. Strong communicator, led a team of 5…" /></div>
      </SECTION>

      <div style={{ display:'flex', justifyContent:'flex-end', marginTop:8 }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <span className="spinner"/> : <><Save size={14}/> Save All</>}
        </button>
      </div>
    </div>
  );
}
