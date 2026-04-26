// src/components/ApplicationRow.jsx

const STATUS_MAP = {
  success:    { label:'Applied',    cls:'pill-success' },
  failed:     { label:'Failed',     cls:'pill-error'   },
  pending:    { label:'Pending',    cls:'pill-warning'  },
  processing: { label:'Processing', cls:'pill-info'    },
  skipped:    { label:'Skipped',    cls:'pill-neutral'  },
};

export default function ApplicationRow({ app }) {
  const { label, cls } = STATUS_MAP[app.status] || STATUS_MAP.pending;
  const date = app.created_at
    ? new Date(app.created_at).toLocaleDateString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })
    : '';

  return (
    <div style={{
      display:'grid',
      gridTemplateColumns:'1fr auto auto',
      alignItems:'center',
      gap:16,
      padding:'14px 16px',
      borderBottom:'1px solid var(--border)',
    }}>
      <div style={{ minWidth:0 }}>
        <p style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {app.internships?.title || 'Internship'}
        </p>
        <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>
          {app.internships?.company || ''}{app.platform ? ` · ${app.platform}` : ''}
        </p>
        {app.error_message && (
          <p style={{ fontSize:11, color:'var(--color-error)', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {app.error_message}
          </p>
        )}
      </div>
      <span style={{ fontSize:11, color:'var(--text-muted)', whiteSpace:'nowrap' }}>{date}</span>
      <span className={`pill ${cls}`}>{label}</span>
    </div>
  );
}
