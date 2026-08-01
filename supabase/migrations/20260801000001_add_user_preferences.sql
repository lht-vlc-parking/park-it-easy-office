-- Add booking time preferences to user_profiles
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS default_start_time TEXT DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS default_end_time TEXT DEFAULT '22:00';
