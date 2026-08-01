-- Add is_admin flag and grant david admin privileges.
-- Update booking DELETE and UPDATE policies so admins can act on any booking.

-- 1. Add is_admin column
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- 2. Grant admin to the designated user
UPDATE public.user_profiles
   SET is_admin = true
  FROM auth.users
 WHERE user_profiles.id = auth.users.id
   AND auth.users.email = 'david.martinez-urrea@lht.dlh.de';

-- 3. Stable helper so RLS expressions don't repeat the subquery
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.user_profiles WHERE id = auth.uid()),
    false
  );
$$;

-- 4. Replace delete/update policies to also allow admins
DROP POLICY IF EXISTS "Users can delete their own bookings" ON public.bookings;
CREATE POLICY "Users can delete their own bookings"
  ON public.bookings
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Users can update their own bookings" ON public.bookings;
CREATE POLICY "Users can update their own bookings"
  ON public.bookings
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());
