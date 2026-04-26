// src/components/InternshipCard.jsx
import { ExternalLink, Sparkles, Building2 } from 'lucide-react';

const DOMAIN_COLORS = {
  'linkedin.com': '#0a66c2',
  'indeed.com':   '#2164f3',
  'greenhouse.io':'#3d9970',
  'lever.co':     '#7f5af0',
  'wellfound.com':'#ff6154',
};

export default function InternshipCard({ internship, onApply }) {
  const { title, company, domain, url, description, match_score, scraped_at } = internship;
  const domainColor = DOMAIN_COLORS[domain] || '#6366f1';
  const relativeTime = scraped_at
    ? (() => {
        const diff = Date.now() - new Date(scraped_at).getTime();
        const h = Math.floor(diff / 3.6e6);
        if (h < 1) return 'Just now';
        if (h < 24) return `${h}h ago`;
        return `${Math.floor(h / 24)}d ago`;
      })()
    : '';

  return (
    <div className="glass-card" style={{ padding: 20, display:'flex', flexDirection:'column', gap:12 }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <h3 style={{ fontSize:14, fontWeight:700, color:'var(--text-primary)', lineHeight:1.3, marginBottom:4, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>
            {title}
          </h3>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <Building2 size={12} color={domainColor} />
            <span style={{ fontSize:12, fontWeight:600, color: domainColor }}>{company || 'Company'}</span>
          </div>
        </div>

        {match_score > 0 && (
          <div style={{
            display:'flex', alignItems:'center', gap:4,
            background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.2)',
            borderRadius:'var(--radius-full)', padding:'3px 10px',
            flexShrink:0,
          }}>
            <Sparkles size={10} color='var(--color-success)' />
            <span style={{ fontSize:11, fontWeight:700, color:'var(--color-success)' }}>{match_score}%</span>
          </div>
        )}
      </div>

      {/* Description */}
      {description && (
        <p style={{ fontSize:12, color:'var(--text-secondary)', lineHeight:1.5, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>
          {description}
        </p>
      )}

      {/* Footer */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:'auto' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:11, color:'var(--text-muted)' }}>{domain}</span>
          {relativeTime && <span style={{ fontSize:11, color:'var(--text-muted)' }}>· {relativeTime}</span>}
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" title="Open job listing">
            <ExternalLink size={13} />
          </a>
          {onApply && (
            <button className="btn btn-primary btn-sm" onClick={() => onApply(internship)}>
              <Sparkles size={13} /> Apply
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
