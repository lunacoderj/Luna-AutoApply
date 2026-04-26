// src/routes/education.js
import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';

const router = Router();
const logger = createLogger('education');
const async$ = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// GET /api/education
router.get('/', async$( async (req, res) => {
  const { data, error } = await supabase
    .from('luna_education_details')
    .select('*')
    .eq('user_id', req.userId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  res.json(data || null);
}));

// PUT /api/education — manual save / update
router.put('/', async$( async (req, res) => {
  const {
    school, intermediate, degree, branch, cgpa, expected_graduation,
    skills, languages_known, projects, experience,
    hobbies, communication_skills, summary, experience_summary
  } = req.body;

  const payload = {
    user_id: req.userId,
    school, intermediate, degree, branch, cgpa, expected_graduation,
    skills: Array.isArray(skills) ? skills : (skills ? [skills] : []),
    languages_known: Array.isArray(languages_known) ? languages_known : (languages_known ? [languages_known] : []),
    projects: Array.isArray(projects) ? projects : [],
    experience: Array.isArray(experience) ? experience : [],
    hobbies: Array.isArray(hobbies) ? hobbies : (hobbies ? [hobbies] : []),
    communication_skills, summary, experience_summary,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('luna_education_details')
    .upsert(payload, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) throw error;

  // Update onboarding
  await supabase.from('luna_profiles').update({ onboarding_status: 'education_parsed' }).eq('id', req.userId);

  logger.info(`Education details updated for user ${req.userId}`);
  res.json(data);
}));

export default router;
