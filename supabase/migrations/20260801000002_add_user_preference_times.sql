-- Replace default_duration with explicit time columns
ALTER TABLE public.user_profiles
  DROP COLUMN IF EXISTS default_duration,
  ADD COLUMN IF NOT EXISTS default_start_time TEXT DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS default_end_time TEXT DEFAULT '22:00';
