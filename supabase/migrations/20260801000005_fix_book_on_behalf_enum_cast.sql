-- Fix book_on_behalf_of: cast p_duration to booking_duration enum
CREATE OR REPLACE FUNCTION public.book_on_behalf_of(
  p_behalf_email  TEXT,
  p_date          DATE,
  p_duration      TEXT,
  p_start_time    TIME,
  p_end_time      TIME,
  p_vehicle_type  TEXT,
  p_spot_number   INTEGER
)
RETURNS SETOF public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target_id   UUID;
  v_target_name TEXT;
  v_capacity    INTEGER;
  v_result      public.bookings;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT up.id, up.display_name
    INTO v_target_id, v_target_name
    FROM public.user_profiles up
    JOIN auth.users au ON au.id = up.id
   WHERE au.email = lower(trim(p_behalf_email))
   LIMIT 1;

  IF v_target_id IS NULL THEN
    RAISE EXCEPTION 'No user found with email: %', p_behalf_email;
  END IF;

  v_capacity := CASE p_vehicle_type WHEN 'car' THEN 4 ELSE 1 END;

  INSERT INTO public.bookings (
    user_id, user_name, date, duration,
    start_time, end_time, vehicle_type, spot_number, capacity
  )
  VALUES (
    v_target_id, v_target_name, p_date, p_duration::booking_duration,
    p_start_time, p_end_time, p_vehicle_type::vehicle_type, p_spot_number, v_capacity
  )
  RETURNING * INTO v_result;

  RETURN NEXT v_result;
END;
$$;
