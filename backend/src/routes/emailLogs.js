// src/routes/emailLogs.js
import { Router } from 'express';
import { supabase } from '../lib/supabase.js';

const router = Router();
const async$ = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// GET /api/email-logs
router.get('/', async$( async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);

  const { data, error } = await supabase
    .from('luna_email_logs')
    .select('*')
    .eq('user_id', req.userId)
    .order('sent_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  res.json(data || []);
}));

export default router;
