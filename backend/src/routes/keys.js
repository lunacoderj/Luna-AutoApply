// src/routes/keys.js
import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { encryptKey, decryptKey, maskKey } from '../lib/crypto.js';
import { createLogger } from '../lib/logger.js';

const router = Router();
const logger = createLogger('keys');
const async$ = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const VALID_KEY_NAMES = ['apify', 'gemini', 'openrouter'];

// GET /api/keys — list keys with hints only
router.get('/', async$( async (req, res) => {
  const { data, error } = await supabase
    .from('luna_api_keys')
    .select('id, key_name, key_hint, is_active, created_at, updated_at')
    .eq('user_id', req.userId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  res.json(data || []);
}));

// POST /api/keys — save / update a key
router.post('/', async$( async (req, res) => {
  const { key_name, key_value } = req.body;

  if (!VALID_KEY_NAMES.includes(key_name)) {
    return res.status(400).json({ error: `key_name must be one of: ${VALID_KEY_NAMES.join(', ')}` });
  }
  if (!key_value || typeof key_value !== 'string' || key_value.length < 8) {
    return res.status(400).json({ error: 'key_value must be at least 8 characters' });
  }

  const encrypted_value = encryptKey(key_value);
  const key_hint = maskKey(key_value);

  const { data, error } = await supabase
    .from('luna_api_keys')
    .upsert({
      user_id: req.userId,
      key_name,
      encrypted_value,
      key_hint,
      is_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,key_name' })
    .select('id, key_name, key_hint, is_active, created_at, updated_at')
    .single();

  if (error) throw error;
  logger.info(`Key "${key_name}" saved for user ${req.userId}`);

  // Update onboarding status
  await supabase.from('luna_profiles').update({ onboarding_status: 'keys_set' }).eq('id', req.userId);

  res.status(201).json(data);
}));

// DELETE /api/keys/:id
router.delete('/:id', async$( async (req, res) => {
  const { data, error } = await supabase
    .from('luna_api_keys')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.userId)
    .select('id, key_name')
    .single();

  if (error || !data) return res.status(404).json({ error: 'Key not found' });

  logger.info(`Key "${data.key_name}" deleted for user ${req.userId}`);
  res.json({ ok: true, deleted: data });
}));

// POST /api/keys/:name/validate — validate key with provider
router.post('/:name/validate', async$( async (req, res) => {
  const { name } = req.params;
  const { key_value } = req.body;

  if (!key_value) return res.status(400).json({ error: 'key_value required' });

  if (name === 'apify') {
    const { default: axios } = await import('axios');
    try {
      const r = await axios.get('https://api.apify.com/v2/users/me', { params: { token: key_value } });
      return res.json({ valid: r.status === 200 });
    } catch {
      return res.json({ valid: false });
    }
  }

  // For Gemini/OpenRouter we just store — actual validation happens on first use
  res.json({ valid: true, note: 'Key will be validated on first use' });
}));

export default router;
