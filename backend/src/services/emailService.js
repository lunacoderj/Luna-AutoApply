// src/services/emailService.js
import { Resend } from 'resend';

let client;
function getResend() {
  if (!client) {
    if (!process.env.RESEND_API_KEY) {
      console.warn('[Email] RESEND_API_KEY missing — emails will be skipped');
      return null;
    }
    client = new Resend(process.env.RESEND_API_KEY);
  }
  return client;
}

const FROM = () => process.env.EMAIL_FROM || 'ApplyPilot <notify@applypilot.app>';

// ── Scrape Report ──────────────────────────────────────────────────
export async function sendScrapeReport(email, results, prefs) {
  const resend = getResend();
  if (!resend) return { error: 'Resend not configured' };

  const rows = results.slice(0, 30).map(job => `
    <div style="margin-bottom:18px;padding:16px;border:1px solid #e2e8f0;border-radius:12px;background:#fff;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <h3 style="margin:0;color:#0f172a;font-size:15px;">${job.title}</h3>
          <p style="margin:4px 0 0;color:#6366f1;font-weight:600;font-size:13px;">${job.company || 'Company'}</p>
        </div>
        ${job.matchScore > 0 ? `<span style="background:#f0fdf4;color:#15803d;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;">${job.matchScore}% match</span>` : ''}
      </div>
      <p style="margin:10px 0;color:#64748b;font-size:13px;line-height:1.5;">${(job.description || '').substring(0, 150)}...</p>
      <a href="${job.url}" style="background:#6366f1;color:#fff;padding:9px 18px;text-decoration:none;border-radius:8px;font-weight:600;font-size:13px;display:inline-block;">View & Apply →</a>
    </div>`).join('');

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;color:#1e293b;background:#f8fafc;padding:40px 20px;">
  <div style="text-align:center;margin-bottom:32px;">
    <h1 style="color:#6366f1;margin:0;font-size:28px;letter-spacing:-1px;">ApplyPilot</h1>
    <p style="color:#64748b;font-size:15px;margin-top:6px;">Your Internship Radar Report</p>
  </div>
  <div style="background:linear-gradient(135deg,#ede9fe,#ddd6fe);border-radius:16px;padding:20px;text-align:center;margin-bottom:28px;">
    <p style="margin:0;font-size:13px;color:#7c3aed;font-weight:600;text-transform:uppercase;">New Matches Found</p>
    <h2 style="margin:8px 0 0;color:#4c1d95;font-size:32px;">${results.length}</h2>
    <div style="margin-top:10px;font-size:12px;color:#8b5cf6;">
      Roles: ${(prefs?.preference_sets || []).flatMap(s => s.roles || []).join(', ') || 'General'} 
    </div>
  </div>
  ${rows}
  <div style="text-align:center;margin-top:36px;padding-top:20px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px;">
    <p>Next scan in 12 hours. Stay sharp.</p>
    <p>© 2026 ApplyPilot. Built for the ambitious.</p>
  </div>
</div>`;

  try {
    return await resend.emails.send({
      from: FROM(),
      to: email,
      subject: `🎯 ${results.length} New Internship${results.length !== 1 ? 's' : ''} Found — ApplyPilot`,
      html,
    });
  } catch (err) {
    console.error('[Email] Failed to send scrape report:', err.message);
    return { error: err.message };
  }
}

// ── Apply Report ───────────────────────────────────────────────────
export async function sendApplyReport(email, applications) {
  const resend = getResend();
  if (!resend) return { error: 'Resend not configured' };

  const success = applications.filter(a => a.status === 'success').length;
  const failed  = applications.filter(a => a.status === 'failed').length;

  const rows = applications.slice(0, 20).map(app => {
    const statusColor = app.status === 'success' ? '#15803d' : app.status === 'failed' ? '#dc2626' : '#d97706';
    const statusBg    = app.status === 'success' ? '#f0fdf4' : app.status === 'failed' ? '#fef2f2' : '#fffbeb';
    return `
    <div style="margin-bottom:14px;padding:14px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <p style="margin:0;font-size:14px;font-weight:600;color:#0f172a;">${app.internships?.title || 'Internship'}</p>
        <p style="margin:3px 0 0;font-size:12px;color:#64748b;">${app.internships?.company || ''}</p>
      </div>
      <span style="background:${statusBg};color:${statusColor};padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;">${app.status}</span>
    </div>`;
  }).join('');

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;color:#1e293b;background:#f8fafc;padding:40px 20px;">
  <div style="text-align:center;margin-bottom:32px;">
    <h1 style="color:#6366f1;margin:0;font-size:28px;">ApplyPilot</h1>
    <p style="color:#64748b;font-size:15px;margin-top:6px;">Application Batch Report</p>
  </div>
  <div style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border-radius:16px;padding:20px;text-align:center;margin-bottom:28px;">
    <div style="display:flex;justify-content:center;gap:40px;">
      <div><p style="margin:0;color:#15803d;font-size:28px;font-weight:700;">${success}</p><p style="margin:4px 0 0;color:#166534;font-size:12px;">Applied</p></div>
      <div><p style="margin:0;color:#dc2626;font-size:28px;font-weight:700;">${failed}</p><p style="margin:4px 0 0;color:#991b1b;font-size:12px;">Failed</p></div>
    </div>
  </div>
  ${rows}
  <div style="text-align:center;margin-top:36px;padding-top:20px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px;">
    <p>© 2026 ApplyPilot. Built for the ambitious.</p>
  </div>
</div>`;

  try {
    return await resend.emails.send({
      from: FROM(),
      to: email,
      subject: `📊 Apply Report — ${success} applied, ${failed} failed`,
      html,
    });
  } catch (err) {
    console.error('[Email] Failed to send apply report:', err.message);
    return { error: err.message };
  }
}

// ── Test Email ─────────────────────────────────────────────────────
export async function sendTestEmail(email) {
  const resend = getResend();
  if (!resend) return { error: 'Resend not configured' };

  try {
    return await resend.emails.send({
      from: FROM(),
      to: email,
      subject: '✅ ApplyPilot Connected!',
      html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:40px;text-align:center;">
        <h1 style="color:#6366f1;">ApplyPilot</h1>
        <p>Your email is connected. You'll receive internship reports and application updates here.</p>
        <p style="color:#94a3b8;font-size:12px;">© 2026 ApplyPilot</p>
      </div>`,
    });
  } catch (err) {
    return { error: err.message };
  }
}
