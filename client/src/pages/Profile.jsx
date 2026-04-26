// src/pages/Profile.jsx
import { useState, useEffect } from 'react';
import { updatePassword, updateProfile, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { Save, Lock, Mail, Bell, Power } from 'lucide-react';
import api from '../services/api';

export default function Profile() {
  const { user }    = useAuth();
  const [profile, setProfile]   = useState({ full_name:'', notification_email:'' });
  const [pw, setPw]             = useState({ current:'', next:'', confirm:'' });
  const [isEnabled, setIsEnabled] = useState(true);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [msg, setMsg]           = useState({});

  useEffect(() => {
    Promise.all([
      api.get('/api/user/profile'),
    ]).then(([pr]) => {
      setProfile({ full_name: pr.data.full_name || '', notification_email: pr.data.notification_email || '' });
      setIsEnabled(pr.data.is_enabled ?? true);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  async function handleSaveProfile() {
    setSaving(true); setMsg({});
    try {
      await api.put('/api/user/profile', { full_name: profile.full_name, notification_email: profile.notification_email });
      if (profile.full_name !== user.displayName) {
        await updateProfile(auth.currentUser, { displayName: profile.full_name });
      }
      setMsg({ profile:'Profile saved.' });
    } catch (e) { setMsg({ profileErr: e.message }); }
    finally { setSaving(false); }
  }

  async function handleToggle() {
    const next = !isEnabled;
    setIsEnabled(next);
    try { await api.put('/api/user/toggle', { is_enabled: next }); }
    catch (e) { setIsEnabled(!next); }
  }

  async function handleChangePassword() {
    if (pw.next !== pw.confirm) { setMsg({ pwErr:'Passwords do not match.' }); return; }
    if (pw.next.length < 6)     { setMsg({ pwErr:'Password must be 6+ characters.' }); return; }
    setSavingPw(true); setMsg({});
    try {
      const cred = EmailAuthProvider.credential(user.email, pw.current);
      await reauthenticateWithCredential(auth.currentUser, cred);
      await updatePassword(auth.currentUser, pw.next);
      setPw({ current:'', next:'', confirm:'' });
      setMsg({ pw:'Password changed successfully.' });
    } catch (e) {
      const text = e.code?.includes('wrong-password') ? 'Current password is incorrect.' : e.message;
      setMsg({ pwErr: text });
    } finally { setSavingPw(false); }
  }

  const isEmailProvider = user?.providerData?.some(p => p.providerId === 'password');

  if (loading) return <div className="flex-center" style={{ minHeight:'60vh' }}><div className="spinner spinner-lg"/></div>;

  return (
    <div className="fade-in" style={{ maxWidth:580 }}>
      <div className="page-header">
        <h1 className="page-title">Profile</h1>
        <p className="page-subtitle">Manage your account settings</p>
      </div>

      {/* Avatar + name */}
      <div className="glass-card" style={{ padding:24, marginBottom:20 }}>
        <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:24 }}>
          <div style={{
            width:60, height:60, borderRadius:'50%',
            background:'linear-gradient(135deg,#6366f1,#a78bfa)',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:24, fontWeight:800, color:'#fff',
            overflow:'hidden', flexShrink:0,
          }}>
            {user?.photoURL
              ? <img src={user.photoURL} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
              : (profile.full_name || user?.email || 'U').charAt(0).toUpperCase()
            }
          </div>
          <div>
            <h2 style={{ fontWeight:700, fontSize:18 }}>{profile.full_name || 'Unnamed User'}</h2>
            <p style={{ color:'var(--text-muted)', fontSize:13 }}>{user?.email}</p>
            <p style={{ color:'var(--text-muted)', fontSize:11, marginTop:2 }}>
              {user?.providerData?.map(p => p.providerId.replace('.com', '')).join(', ') || 'email'}
            </p>
          </div>
        </div>

        <h3 style={{ fontSize:14, fontWeight:700, marginBottom:16, display:'flex', alignItems:'center', gap:8 }}>
          <Mail size={14} color="var(--color-primary-light)"/> Account Info
        </h3>

        <div className="field-group">
          <label className="field-label">Display Name</label>
          <input className="field-input" value={profile.full_name} onChange={e => setProfile(p => ({...p, full_name:e.target.value}))} />
        </div>
        <div className="field-group">
          <label className="field-label">Email (read-only)</label>
          <input className="field-input" value={user?.email || ''} readOnly style={{ opacity:0.5 }} />
        </div>

        {msg.profile    && <div className="alert alert-success" style={{ marginBottom:12 }}>{msg.profile}</div>}
        {msg.profileErr && <div className="alert alert-error"   style={{ marginBottom:12 }}>{msg.profileErr}</div>}

        <button className="btn btn-primary btn-sm" onClick={handleSaveProfile} disabled={saving}>
          {saving ? <span className="spinner"/> : <><Save size={13}/> Save</>}
        </button>
      </div>

      {/* Notification email */}
      <div className="glass-card" style={{ padding:24, marginBottom:20 }}>
        <h3 style={{ fontSize:14, fontWeight:700, marginBottom:16, display:'flex', alignItems:'center', gap:8 }}>
          <Bell size={14} color="var(--color-primary-light)"/> Report Email
        </h3>
        <p style={{ fontSize:13, color:'var(--text-secondary)', marginBottom:14, lineHeight:1.6 }}>
          Scrape and application reports will be sent here. Leave blank to use your account email.
        </p>
        <div className="field-group">
          <label className="field-label">Notification Email (optional override)</label>
          <input className="field-input" type="email" placeholder={user?.email || ''} value={profile.notification_email} onChange={e => setProfile(p => ({...p, notification_email:e.target.value}))} />
        </div>
        <button className="btn btn-primary btn-sm" onClick={handleSaveProfile} disabled={saving}>
          {saving ? <span className="spinner"/> : <><Save size={13}/> Save</>}
        </button>
      </div>

      {/* Automation toggle */}
      <div className="glass-card" style={{ padding:24, marginBottom:20 }}>
        <h3 style={{ fontSize:14, fontWeight:700, marginBottom:4, display:'flex', alignItems:'center', gap:8 }}>
          <Power size={14} color={isEnabled ? 'var(--color-success)' : 'var(--color-error)'}/> Automation
        </h3>
        <p style={{ fontSize:13, color:'var(--text-secondary)', marginBottom:16 }}>
          {isEnabled ? 'Scraping and auto-apply are active.' : 'Automation is paused — scheduler will skip this account.'}
        </p>
        <button
          onClick={handleToggle}
          className={`btn btn-sm ${isEnabled ? 'btn-danger' : 'btn-primary'}`}
        >
          <Power size={13}/> {isEnabled ? 'Pause Automation' : 'Enable Automation'}
        </button>
      </div>

      {/* Password change — only for email provider */}
      {isEmailProvider && (
        <div className="glass-card" style={{ padding:24 }}>
          <h3 style={{ fontSize:14, fontWeight:700, marginBottom:16, display:'flex', alignItems:'center', gap:8 }}>
            <Lock size={14} color="var(--color-primary-light)"/> Change Password
          </h3>
          <div className="field-group">
            <label className="field-label">Current Password</label>
            <input className="field-input" type="password" value={pw.current} onChange={e => setPw(p => ({...p, current:e.target.value}))} />
          </div>
          <div className="grid-2">
            <div className="field-group">
              <label className="field-label">New Password</label>
              <input className="field-input" type="password" value={pw.next} onChange={e => setPw(p => ({...p, next:e.target.value}))} />
            </div>
            <div className="field-group">
              <label className="field-label">Confirm New Password</label>
              <input className="field-input" type="password" value={pw.confirm} onChange={e => setPw(p => ({...p, confirm:e.target.value}))} />
            </div>
          </div>
          {msg.pw    && <div className="alert alert-success" style={{ marginBottom:12 }}>{msg.pw}</div>}
          {msg.pwErr && <div className="alert alert-error"   style={{ marginBottom:12 }}>{msg.pwErr}</div>}
          <button className="btn btn-primary btn-sm" onClick={handleChangePassword} disabled={savingPw}>
            {savingPw ? <span className="spinner"/> : <><Lock size={13}/> Change Password</>}
          </button>
        </div>
      )}
    </div>
  );
}
