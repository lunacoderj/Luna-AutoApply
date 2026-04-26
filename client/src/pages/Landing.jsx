// src/pages/Landing.jsx
import { Link } from 'react-router-dom';
import { Zap, Search, Bot, Mail, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const FEATURES = [
  { icon: Search,      title: 'Intelligent Scraping',    desc: 'Apify-powered Google search finds tailored internships every 12 hours.' },
  { icon: Bot,         title: 'AI Auto-Apply',           desc: 'Playwright + Gemini navigates job boards and submits forms autonomously.' },
  { icon: Mail,        title: 'Smart Reports',           desc: 'Styled HTML emails summarize scraped listings and application outcomes.' },
  { icon: CheckCircle2,title: 'Match Scoring',           desc: 'Resume keyword analysis ranks each listing so the best floats to top.' },
];

export default function Landing() {
  const { user } = useAuth();

  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column' }}>
      {/* Nav */}
      <header style={{
        display:'flex', justifyContent:'space-between', alignItems:'center',
        padding:'20px 40px', position:'sticky', top:0, zIndex:10,
        borderBottom:'1px solid var(--border)', backdropFilter:'blur(20px)',
        background:'rgba(5,8,20,0.8)',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <img src="/logo.png" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover' }} alt="Luna Logo" />
          <span style={{ fontWeight:800, fontSize:18, letterSpacing:'-0.5px' }}>Luna</span>
        </div>
        <div style={{ display:'flex', gap:12 }}>
          {user
            ? <Link to="/dashboard" className="btn btn-primary">Open Dashboard <ArrowRight size={15} /></Link>
            : <>
                <Link to="/auth" className="btn btn-ghost">Sign In</Link>
                <Link to="/auth?mode=signup" className="btn btn-primary">Get Started Free <ArrowRight size={15} /></Link>
              </>
          }
        </div>
      </header>

      {/* Hero */}
      <section style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', padding:'80px 24px 60px' }}>
        <div style={{
          display:'inline-flex', alignItems:'center', gap:8,
          padding:'6px 16px', borderRadius:'var(--radius-full)',
          background:'rgba(167,139,250,0.1)', border:'1px solid rgba(167,139,250,0.25)',
          fontSize:12, fontWeight:600, color:'#a78bfa',
          marginBottom:28, textTransform:'uppercase', letterSpacing:'0.08em',
        }}>
          <Zap size={12} fill="currentColor" /> Fully Autonomous · Luna AI
        </div>

        <h1 style={{
          fontSize:'clamp(36px, 6vw, 72px)',
          fontWeight:800, letterSpacing:'-2px',
          lineHeight:1.05, maxWidth:800, marginBottom:24,
        }}>
          Let AI hunt and{' '}
          <span style={{ background:'linear-gradient(135deg,#6366f1,#a78bfa,#ec4899)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>
            apply for internships
          </span>{' '}
          while you sleep.
        </h1>

        <p style={{ fontSize:18, color:'var(--text-secondary)', maxWidth:560, lineHeight:1.7, marginBottom:40 }}>
          Luna combines intelligent job scraping with autonomous form-filling to submit applications to hundreds of positions every day — hands-free.
        </p>

        <div style={{ display:'flex', gap:14, flexWrap:'wrap', justifyContent:'center' }}>
          <Link to={user ? '/dashboard' : '/auth?mode=signup'} className="btn btn-primary btn-lg">
            {user ? 'Open Dashboard' : 'Start for Free'} <ArrowRight size={17} />
          </Link>
          <a href="#features" className="btn btn-secondary btn-lg">See How It Works</a>
        </div>

        {/* Mini metrics */}
        <div style={{ display:'flex', gap:40, marginTop:60, flexWrap:'wrap', justifyContent:'center' }}>
          {[['12hr','Auto-scan cycle'], ['Luna AI','Application bot'], ['100%','Autonomous']].map(([v, l]) => (
            <div key={l} style={{ textAlign:'center' }}>
              <div style={{ fontSize:22, fontWeight:800, color:'var(--color-primary-light)' }}>{v}</div>
              <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:4 }}>{l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" style={{ padding:'80px 40px', maxWidth:1000, margin:'0 auto', width:'100%' }}>
        <h2 style={{ textAlign:'center', fontSize:32, fontWeight:800, letterSpacing:'-0.5px', marginBottom:48 }}>
          Everything automated. Nothing manual.
        </h2>
        <div className="grid-2" style={{ gap:24 }}>
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="glass-card" style={{ padding:28 }}>
              <div style={{ width:44, height:44, borderRadius:12, background:'rgba(167,139,250,0.1)', border:'1px solid rgba(167,139,250,0.2)', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:16 }}>
                <Icon size={20} color="#a78bfa" />
              </div>
              <h3 style={{ fontWeight:700, fontSize:16, marginBottom:8 }}>{title}</h3>
              <p style={{ fontSize:14, color:'var(--text-secondary)', lineHeight:1.6 }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding:'60px 24px', textAlign:'center' }}>
        <div style={{ maxWidth:520, margin:'0 auto' }}>
          <h2 style={{ fontSize:28, fontWeight:800, marginBottom:16, letterSpacing:'-0.5px' }}>Ready to start applying on autopilot?</h2>
          <Link to={user ? '/dashboard' : '/auth?mode=signup'} className="btn btn-primary btn-lg">
            {user ? 'Open Dashboard' : 'Create Free Account'} <ArrowRight size={17} />
          </Link>
        </div>
      </section>

      <footer style={{ textAlign:'center', padding:'20px', color:'var(--text-muted)', fontSize:12, borderTop:'1px solid var(--border)' }}>
        © 2026 Luna AI — Built for the ambitious.
      </footer>
    </div>
  );
}
