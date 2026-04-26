// src/pages/Dashboard.jsx
import { useState, useEffect, useCallback } from 'react';
import { Search, Briefcase, CheckCircle, XCircle, RefreshCw, Zap } from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import api from '../services/api';
import StatCard from '../components/StatCard';
import InternshipCard from '../components/InternshipCard';
import ApplicationRow from '../components/ApplicationRow';

const TOOLTIP_STYLE = {
  contentStyle: { background:'#0b0f1e', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, color:'#f1f5f9', fontSize:12 },
  cursor: { fill:'rgba(99,102,241,0.08)' },
};

export default function Dashboard() {
  const [internships, setInternships] = useState([]);
  const [applications, setApplications] = useState([]);
  const [scrapeChart, setScrapeChart]   = useState([]);
  const [applyStats, setApplyStats]     = useState({ counts:{}, chart:[] });
  const [loading, setLoading]           = useState(true);
  const [scraping, setScraping]         = useState(false);
  const [msg, setMsg]                   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [iRes, aRes, scRes, asRes] = await Promise.all([
        api.get('/api/internships?limit=12'),
        api.get('/api/applications?limit=8'),
        api.get('/api/internships/stats?days=14'),
        api.get('/api/applications/stats?days=14'),
      ]);
      setInternships(iRes.data.data || []);
      setApplications(aRes.data.data || []);
      setScrapeChart(scRes.data || []);
      setApplyStats(asRes.data || { counts:{}, chart:[] });
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleScrapeNow() {
    setScraping(true); setMsg('');
    try {
      await api.post('/api/internships/scrape-now');
      setMsg('Scrape queued! Results will appear in a few minutes.');
      setTimeout(() => load(), 5000);
    } catch (e) { setMsg(e.message); }
    finally { setScraping(false); }
  }

  const counts = applyStats.counts || {};
  const totalApps = Object.values(counts).reduce((s, v) => s + v, 0);
  const successRate = totalApps > 0 ? Math.round(((counts.success || 0) / totalApps) * 100) : 0;

  if (loading) {
    return (
      <div className="flex-center" style={{ minHeight:'60vh' }}>
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  return (
    <div className="fade-in">
      <div className="flex-between page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Your autonomous internship pipeline at a glance</p>
        </div>
        <button className="btn btn-primary" onClick={handleScrapeNow} disabled={scraping}>
          {scraping ? <span className="spinner" /> : <><RefreshCw size={15} /> Scrape Now</>}
        </button>
      </div>

      {msg && <div className={`alert ${msg.includes('queued') ? 'alert-success' : 'alert-error'}`}>{msg}</div>}

      {/* Stats row */}
      <div className="grid-3" style={{ marginBottom:32 }}>
        <StatCard icon={Search}       label="Internships Found"  value={internships.length}  color="#6366f1" sub="Last 30 days" />
        <StatCard icon={CheckCircle}  label="Successfully Applied" value={counts.success || 0} color="#22c55e" sub="Auto-submitted" />
        <StatCard icon={XCircle}      label="Failed / Skipped"   value={(counts.failed || 0) + (counts.skipped || 0)} color="#ef4444" />
      </div>

      {/* Charts row */}
      <div className="grid-2" style={{ marginBottom:32, gap:24 }}>
        {/* Scrape line chart */}
        <div className="glass-card" style={{ padding:24 }}>
          <h2 style={{ fontSize:15, fontWeight:700, marginBottom:20, color:'var(--text-primary)' }}>
            <Zap size={15} style={{ marginRight:8, verticalAlign:'middle', color:'var(--color-primary-light)' }} />
            Internships Scraped / Day
          </h2>
          {scrapeChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={scrapeChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fill:'#64748b', fontSize:11 }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fill:'#64748b', fontSize:11 }} allowDecimals={false} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} dot={{ fill:'#6366f1', r:3 }} name="Listings" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state" style={{ padding:'40px 0' }}>
              <p>No data yet. Run a scrape to get started.</p>
            </div>
          )}
        </div>

        {/* Applications bar chart */}
        <div className="glass-card" style={{ padding:24 }}>
          <h2 style={{ fontSize:15, fontWeight:700, marginBottom:20 }}>
            <Briefcase size={15} style={{ marginRight:8, verticalAlign:'middle', color:'var(--color-primary-light)' }} />
            Applications / Day
          </h2>
          {applyStats.chart.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={applyStats.chart}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fill:'#64748b', fontSize:11 }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fill:'#64748b', fontSize:11 }} allowDecimals={false} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize:11 }} />
                <Bar dataKey="success" fill="#22c55e" name="Success" radius={[4,4,0,0]} />
                <Bar dataKey="failed"  fill="#ef4444" name="Failed"  radius={[4,4,0,0]} />
                <Bar dataKey="pending" fill="#f59e0b" name="Pending" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state" style={{ padding:'40px 0' }}>
              <p>No applications tracked yet.</p>
            </div>
          )}
        </div>
      </div>

      {/* Internship cards */}
      <div style={{ marginBottom:32 }}>
        <h2 style={{ fontSize:16, fontWeight:700, marginBottom:16, display:'flex', alignItems:'center', gap:8 }}>
          <Search size={16} color="var(--color-primary-light)" /> Recent Listings
        </h2>
        {internships.length > 0 ? (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:16 }}>
            {internships.slice(0, 9).map(i => (
              <InternshipCard key={i.id} internship={i} />
            ))}
          </div>
        ) : (
          <div className="glass-card empty-state">
            <Search size={32} />
            <h3>No internships yet</h3>
            <p>Click "Scrape Now" or configure your preferences and wait for the 12-hour auto-scan.</p>
          </div>
        )}
      </div>

      {/* Applications table */}
      <div>
        <h2 style={{ fontSize:16, fontWeight:700, marginBottom:16, display:'flex', alignItems:'center', gap:8 }}>
          <Briefcase size={16} color="var(--color-primary-light)" /> Recent Applications
        </h2>
        {applications.length > 0 ? (
          <div className="glass-card" style={{ overflow:'hidden' }}>
            <div style={{ padding:'12px 16px', background:'var(--bg-input)', borderBottom:'1px solid var(--border)', display:'grid', gridTemplateColumns:'1fr auto auto', gap:16 }}>
              <span style={{ fontSize:11, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase' }}>Position</span>
              <span style={{ fontSize:11, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase' }}>Date</span>
              <span style={{ fontSize:11, fontWeight:600, color:'var(--text-muted)', textTransform:'uppercase' }}>Status</span>
            </div>
            {applications.map(a => <ApplicationRow key={a.id} app={a} />)}
          </div>
        ) : (
          <div className="glass-card empty-state">
            <Briefcase size={32} />
            <h3>No applications tracked</h3>
            <p>The bot will auto-apply after the next scrape cycle.</p>
          </div>
        )}
      </div>
    </div>
  );
}
