// src/routes/user.js
import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';

const router = Router();
const logger = createLogger('user');
const async$ = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// GET /api/user/profile
router.get('/profile', async$( async (req, res) => {
  const { data, error } = await supabase
    .from('luna_profiles')
    .select('id, email, full_name, notification_email, onboarding_status, resume_url, is_enabled, created_at')
    .eq('id', req.userId)
    .single();

  if (error) throw error;
  res.json(data);
}));

// PUT /api/user/profile
router.put('/profile', async$( async (req, res) => {
  const { full_name, notification_email } = req.body;
  const updates = {};
  if (full_name !== undefined)          updates.full_name = full_name;
  if (notification_email !== undefined) updates.notification_email = notification_email;

  const { data, error } = await supabase
    .from('luna_profiles')
    .update(updates)
    .eq('id', req.userId)
    .select('id, email, full_name, notification_email, onboarding_status')
    .single();

  if (error) throw error;
  logger.info(`Profile updated for user ${req.userId}`);
  res.json(data);
}));

// PUT /api/user/toggle  — enable/disable automation
router.put('/toggle', async$( async (req, res) => {
  const { is_enabled } = req.body;

  const { data, error } = await supabase
    .from('luna_profiles')
    .update({ is_enabled: Boolean(is_enabled) })
    .eq('id', req.userId)
    .select('id, is_enabled')
    .single();

  if (error) throw error;
  res.json({ ok: true, is_enabled: data.is_enabled });
}));

export default router;
