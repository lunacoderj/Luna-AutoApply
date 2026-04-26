// src/components/StatCard.jsx
import { TrendingUp } from 'lucide-react';

export default function StatCard({ icon: Icon, label, value, sub, trend, color = '#6366f1' }) {
  return (
    <div className="glass-card" style={{ padding: '20px 24px', position: 'relative', overflow: 'hidden' }}>
      {/* Glow blob */}
      <div style={{
        position:'absolute', top:-20, right:-20,
        width:80, height:80,
        background: color,
        borderRadius:'50%',
        opacity:0.08,
        filter:'blur(20px)',
        pointerEvents:'none',
      }} />

      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
        <div>
          <p style={{ fontSize:12, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', fontWeight:600 }}>{label}</p>
          <p style={{ fontSize:28, fontWeight:800, marginTop:6, letterSpacing:'-0.5px', color:'var(--text-primary)' }}>{value ?? '—'}</p>
          {sub && <p style={{ fontSize:12, color:'var(--text-secondary)', marginTop:4 }}>{sub}</p>}
        </div>
        <div style={{
          width:44, height:44, borderRadius:12,
          background: `linear-gradient(135deg, ${color}22, ${color}11)`,
          border: `1px solid ${color}33`,
          display:'flex', alignItems:'center', justifyContent:'center',
        }}>
          {Icon && <Icon size={20} color={color} />}
        </div>
      </div>

      {trend !== undefined && (
        <div style={{ marginTop:12, display:'flex', alignItems:'center', gap:5, fontSize:12 }}>
          <TrendingUp size={13} color={trend >= 0 ? 'var(--color-success)' : 'var(--color-error)'} />
          <span style={{ color: trend >= 0 ? 'var(--color-success)' : 'var(--color-error)', fontWeight:600 }}>
            {trend >= 0 ? '+' : ''}{trend}%
          </span>
          <span style={{ color:'var(--text-muted)' }}>vs last week</span>
        </div>
      )}
    </div>
  );
}
