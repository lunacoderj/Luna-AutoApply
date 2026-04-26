// src/routes/applications.js
import { Router } from 'express';
import { supabase } from '../lib/supabase.js';

const router = Router();
const async$ = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// GET /api/applications
router.get('/', async$( async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const page  = Math.max(parseInt(req.query.page)  || 1, 1);
  const status = req.query.status; // optional filter
  const from = (page - 1) * limit;

  let query = supabase
    .from('luna_applications')
    .select(`
      id, status, job_url, platform, cover_letter, error_message,
      applied_at, created_at, updated_at,
      luna_internships ( title, company, url, match_score, domain )
    `, { count: 'exact' })
    .eq('user_id', req.userId)
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1);

  if (status) query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) throw error;

  res.json({ data: data || [], total: count || 0, page, limit });
}));

// GET /api/applications/stats
router.get('/stats', async$( async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('luna_applications')
    .select('status, created_at')
    .eq('user_id', req.userId)
    .gte('created_at', since);

  if (error) throw error;

  const counts = { pending: 0, processing: 0, success: 0, failed: 0, skipped: 0 };
  (data || []).forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });

  // Daily breakdown
  const byDate = {};
  (data || []).forEach(row => {
    const date = row.created_at.split('T')[0];
    if (!byDate[date]) byDate[date] = { success: 0, failed: 0, pending: 0 };
    if (counts[row.status] !== undefined) byDate[date][row.status] = (byDate[date][row.status] || 0) + 1;
  });

  const chart = Object.entries(byDate).map(([date, c]) => ({ date, ...c }));
  res.json({ counts, chart });
}));

// GET /api/applications/:id
router.get('/:id', async$( async (req, res) => {
  const { data, error } = await supabase
    .from('luna_applications')
    .select(`*, luna_internships ( * )`)
    .eq('id', req.params.id)
    .eq('user_id', req.userId)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Application not found' });
  res.json(data);
}));

export default router;
