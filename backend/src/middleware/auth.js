// src/middleware/auth.js
import admin from '../lib/firebase-admin.js';
import { supabase } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('auth');

/**
 * Verifies Firebase ID token → maps to Supabase user_id.
 * Attaches req.userId (Supabase UUID) and req.firebaseUser to request.
 */
export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.firebaseUser = decoded;

    // Look up or create Supabase profile in the new luna_profiles table
    const { data: profile, error } = await supabase
      .from('luna_profiles')
      .select('id')
      .eq('firebase_uid', decoded.uid)
      .single();

    if (error && error.code === 'PGRST116') {
      // Not found — create profile in Luna table
      const { data: newProfile, error: createErr } = await supabase
        .from('luna_profiles')
        .insert({
          email: decoded.email?.toLowerCase(),
          full_name: decoded.name || '',
          firebase_uid: decoded.uid,
          onboarding_status: 'pending',
        })
        .select('id')
        .single();

      if (createErr) {
        logger.error('Failed to create Luna profile:', createErr.message);
        return res.status(500).json({ error: 'Failed to initialize Luna user profile.' });
      }
      req.userId = newProfile.id;
    } else if (error) {
      logger.error('Luna Profile lookup error:', error.message);
      return res.status(500).json({ error: 'Database error — ensure you ran the Luna migration.' });
    } else {
      req.userId = profile.id;
    }

    next();
  } catch (err) {
    logger.warn('Token verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
