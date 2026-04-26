// src/components/Navbar.jsx
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, GraduationCap, Key, Settings,
  User, LogOut, Zap, BookOpen,
} from 'lucide-react';

const NAV = [
  { to: '/dashboard',   icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/education',   icon: GraduationCap,   label: 'Education' },
  { to: '/ai-keys',     icon: Key,             label: 'AI Keys' },
  { to: '/preferences', icon: Settings,        label: 'Preferences' },
  { to: '/profile',     icon: User,            label: 'Profile' },
];

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  const avatar = user?.photoURL;
  const initials = (user?.displayName || user?.email || 'U').charAt(0).toUpperCase();

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, bottom: 0,
      width: 'var(--navbar-width)', zIndex: 100,
      background: 'rgba(11,15,30,0.95)',
      borderRight: '1px solid var(--border)',
      backdropFilter: 'blur(20px)',
      display: 'flex', flexDirection: 'column',
      padding: '20px 0',
    }}>
      {/* Logo */}
      <div style={{ padding: '0 20px 28px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <img src="/logo.png" style={{ width: 36, height: 36, borderRadius: 10, objectFit: 'cover' }} alt="Luna Logo" />
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.3px', color: '#fff' }}>Luna</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Autonomous Bot</div>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <div style={{ flex: 1, padding: '16px 12px', display:'flex', flexDirection:'column', gap:4 }}>
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to} to={to}
            style={({ isActive }) => ({
              display:'flex', alignItems:'center', gap:12,
              padding:'10px 14px', borderRadius: 10,
              color: isActive ? '#fff' : 'var(--text-secondary)',
              background: isActive ? 'linear-gradient(135deg,rgba(99,102,241,0.2),rgba(139,92,246,0.1))' : 'transparent',
              border: isActive ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
              fontWeight: isActive ? 600 : 400,
              fontSize: 14,
              transition: 'all 0.2s',
              textDecoration:'none',
            })}
          >
            <Icon size={17} />
            {label}
          </NavLink>
        ))}
      </div>

      {/* User info + logout */}
      <div style={{ padding:'16px 12px', borderTop:'1px solid var(--border)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px', borderRadius:10, background:'var(--bg-card)' }}>
          <div style={{
            width:32, height:32, borderRadius:'50%',
            background:'linear-gradient(135deg,#6366f1,#a78bfa)',
            display:'flex', alignItems:'center', justifyContent:'center',
            overflow:'hidden', flexShrink:0,
          }}>
            {avatar
              ? <img src={avatar} alt="avatar" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
              : <span style={{ color:'#fff', fontWeight:700, fontSize:13 }}>{initials}</span>
            }
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {user?.displayName || 'User'}
            </div>
            <div style={{ fontSize:11, color:'var(--text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {user?.email}
            </div>
          </div>
          <button onClick={handleLogout} style={{ background:'transparent', border:'none', color:'var(--text-muted)', cursor:'pointer', padding:4 }} title="Logout">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </nav>
  );
}
