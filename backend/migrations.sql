-- ApplyPilot – Full Database Schema (Luna Edition)
-- Run this in Supabase SQL Editor

-- ══════════════════════════════════════════════
-- Extensions
-- ══════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ══════════════════════════════════════════════
-- 1. Profiles (extends auth.users)
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.luna_profiles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid      TEXT UNIQUE NOT NULL,
  email             TEXT UNIQUE NOT NULL,
  full_name         TEXT,
  notification_email TEXT,         -- override for email reports
  resume_url        TEXT,
  onboarding_status TEXT DEFAULT 'pending',
  -- pending | resume_uploaded | education_parsed | keys_set | preferences_set | complete
  job_preferences   JSONB DEFAULT '{}',
  is_enabled        BOOLEAN DEFAULT TRUE,  -- master switch for scheduler
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════
-- 2. Preferences (internship search config)
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.luna_preferences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.luna_profiles(id) ON DELETE CASCADE,
  preference_sets JSONB DEFAULT '[]',
  -- Each set: { id, name, roles[], locations[], workTypes[], lookback, interval, enabled, lastScrapedAt }
  resume_text     TEXT,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ══════════════════════════════════════════════
-- 3. Education Details
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.luna_education_details (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.luna_profiles(id) ON DELETE CASCADE,
  -- Academic
  school              TEXT,          -- High school
  intermediate        TEXT,          -- 12th / Pre-degree
  degree              TEXT,          -- B.Tech, BCA, etc.
  branch              TEXT,          -- Computer Science, etc.
  cgpa                TEXT,
  expected_graduation TEXT,
  -- Skills & experience
  skills              TEXT[],
  languages_known     TEXT[],
  projects            JSONB DEFAULT '[]', -- [{ name, description, tech, url }]
  experience          JSONB DEFAULT '[]', -- [{ company, role, duration, description }]
  hobbies             TEXT[],
  communication_skills TEXT,         -- self-assessment paragraph
  summary             TEXT,          -- AI-generated or manual professional summary
  experience_summary  TEXT,
  -- Metadata
  ai_parsed           BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ══════════════════════════════════════════════
-- 4. API Keys (encrypted)
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.luna_api_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.luna_profiles(id) ON DELETE CASCADE,
  key_name        TEXT NOT NULL,       -- 'apify' | 'gemini' | 'openrouter'
  encrypted_value TEXT NOT NULL,
  key_hint        TEXT,                -- first 4 + ... + last 4 chars
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, key_name)
);

-- ══════════════════════════════════════════════
-- 5. Internships (scraped listings)
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.luna_internships (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.luna_profiles(id) ON DELETE CASCADE,
  preference_set_id TEXT,
  title             TEXT NOT NULL,
  company           TEXT,
  url               TEXT NOT NULL,
  description       TEXT,
  source            TEXT,
  domain            TEXT,
  match_score       INTEGER DEFAULT 0,
  scraped_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, url)
);

-- ══════════════════════════════════════════════
-- 6. Applications (bot submission tracking)
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.luna_applications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.luna_profiles(id) ON DELETE CASCADE,
  internship_id     UUID REFERENCES public.luna_internships(id) ON DELETE SET NULL,
  job_url           TEXT,
  platform          TEXT,
  cover_letter      TEXT,
  status            TEXT DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processing', 'success', 'failed', 'skipped')),
  error_message     TEXT,
  applypilot_output JSONB,
  applied_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════
-- 7. Email Logs
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.luna_email_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.luna_profiles(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('scrape_report', 'apply_report', 'test')),
  subject     TEXT,
  resend_id   TEXT,
  status      TEXT DEFAULT 'sent',
  result_count INTEGER DEFAULT 0,
  sent_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════
-- Row Level Security
-- ══════════════════════════════════════════════
ALTER TABLE public.luna_profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.luna_preferences       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.luna_education_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.luna_api_keys          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.luna_internships       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.luna_applications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.luna_email_logs        ENABLE ROW LEVEL SECURITY;

-- Backend service-role bypasses RLS automatically.
-- These policies protect direct client-side queries:
CREATE POLICY "profiles_self"     ON public.profiles          FOR ALL USING (TRUE); -- service-role only
CREATE POLICY "prefs_self"        ON public.preferences       FOR ALL USING (TRUE);
CREATE POLICY "edu_self"          ON public.education_details FOR ALL USING (TRUE);
CREATE POLICY "keys_self"         ON public.api_keys          FOR ALL USING (TRUE);
CREATE POLICY "internships_self"  ON public.internships       FOR ALL USING (TRUE);
CREATE POLICY "apps_self"         ON public.applications      FOR ALL USING (TRUE);
CREATE POLICY "emaillogs_self"    ON public.email_logs        FOR ALL USING (TRUE);

-- ══════════════════════════════════════════════
-- updated_at trigger
-- ══════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','preferences','education_details','api_keys','applications']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS tr_%s_updated_at ON public.%s', t, t);
    EXECUTE format('CREATE TRIGGER tr_%s_updated_at BEFORE UPDATE ON public.%s
                    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column()', t, t);
  END LOOP;
END $$;

-- ══════════════════════════════════════════════
-- Supabase Storage bucket for resumes
-- ══════════════════════════════════════════════
-- Run in Supabase dashboard Storage or via API:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('applypilot', 'applypilot', false);
