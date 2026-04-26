// src/pages/Auth.jsx
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import { auth, googleProvider, githubProvider } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { Zap, Eye, EyeOff } from 'lucide-react';

export default function Auth() {
  const [params]   = useSearchParams();
  const navigate   = useNavigate();
  const { user }   = useAuth();

  const [mode, setMode]         = useState(params.get('mode') === 'signup' ? 'signup' : 'login');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [name, setName]         = useState('');
  const [show, setShow]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => { if (user) navigate('/dashboard', { replace: true }); }, [user, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      if (mode === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        if (name) await updateProfile(cred.user, { displayName: name });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (e) {
      setError(friendlyError(e.code));
    } finally { setLoading(false); }
  }

  async function handleOAuth(provider) {
    setLoading(true); setError('');
    try {
      await signInWithPopup(auth, provider === 'google' ? googleProvider : githubProvider);
    } catch (e) { setError(friendlyError(e.code)); }
    finally { setLoading(false); }
  }

  function friendlyError(code) {
    if (!code) return 'Something went wrong.';
    if (code.includes('invalid-credential') || code.includes('wrong-password')) return 'Invalid email or password.';
    if (code.includes('email-already-in-use')) return 'This email is already registered.';
    if (code.includes('weak-password')) return 'Password must be at least 6 characters.';
    if (code.includes('user-not-found')) return 'No account found with this email.';
    return 'Authentication failed. Please try again.';
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ width:'100%', maxWidth:420 }}>
        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <Link to="/" style={{ display:'inline-flex', alignItems:'center', gap:10, textDecoration:'none' }}>
            <img src="/logo.png" style={{ width: 40, height: 40, borderRadius: 12, objectFit: 'cover' }} alt="Luna Logo" />
            <span style={{ fontWeight:800, fontSize:22, letterSpacing:'-0.5px', color:'var(--text-primary)' }}>Luna</span>
          </Link>
          <h1 style={{ fontSize:22, fontWeight:800, marginTop:20, letterSpacing:'-0.3px' }}>
            {mode === 'signup' ? 'Create your account' : 'Welcome back'}
          </h1>
          <p style={{ color:'var(--text-secondary)', fontSize:14, marginTop:6 }}>
            {mode === 'signup' ? 'Start applying autonomously in minutes.' : 'Sign in to your dashboard.'}
          </p>
        </div>

        {/* Card */}
        <div className="glass-card" style={{ padding:28 }}>
          {error && <div className="alert alert-error">{error}</div>}

          {/* OAuth */}
          <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:20 }}>
            <button className="btn btn-secondary" style={{ justifyContent:'center' }} onClick={() => handleOAuth('google')} disabled={loading}>
              <img src="https://www.google.com/favicon.ico" width={16} alt="" /> Continue with Google
            </button>
            <button className="btn btn-secondary" style={{ justifyContent:'center' }} onClick={() => handleOAuth('github')} disabled={loading}>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.49.5.09.68-.22.68-.48v-1.69c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.6 9.6 0 0 1 12 6.8c.85 0 1.71.11 2.51.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10.01 10.01 0 0 0 22 12c0-5.52-4.48-10-10-10Z"/></svg>
              Continue with GitHub
            </button>
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
            <div style={{ flex:1, height:1, background:'var(--border)' }} />
            <span style={{ color:'var(--text-muted)', fontSize:12 }}>or</span>
            <div style={{ flex:1, height:1, background:'var(--border)' }} />
          </div>

          <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {mode === 'signup' && (
              <div className="field-group" style={{ marginBottom:0 }}>
                <label className="field-label">Full Name</label>
                <input className="field-input" placeholder="Jane Doe" value={name} onChange={e => setName(e.target.value)} />
              </div>
            )}
            <div className="field-group" style={{ marginBottom:0 }}>
              <label className="field-label">Email</label>
              <input className="field-input" type="email" required placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div className="field-group" style={{ marginBottom:0 }}>
              <label className="field-label">Password</label>
              <div style={{ position:'relative' }}>
                <input
                  className="field-input" type={show ? 'text' : 'password'} required
                  placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)}
                  style={{ paddingRight:40 }}
                />
                <button type="button" onClick={() => setShow(!show)} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer' }}>
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button type="submit" className="btn btn-primary" style={{ justifyContent:'center', marginTop:4 }} disabled={loading}>
              {loading ? <span className="spinner" /> : mode === 'signup' ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <p style={{ textAlign:'center', marginTop:20, fontSize:13, color:'var(--text-muted)' }}>
            {mode === 'signup'
              ? <>Already have an account? <button style={{ background:'none', border:'none', color:'var(--color-primary-light)', cursor:'pointer', fontWeight:600 }} onClick={() => setMode('login')}>Sign in</button></>
              : <>New here? <button style={{ background:'none', border:'none', color:'var(--color-primary-light)', cursor:'pointer', fontWeight:600 }} onClick={() => setMode('signup')}>Create account</button></>
            }
          </p>
        </div>
      </div>
    </div>
  );
}
