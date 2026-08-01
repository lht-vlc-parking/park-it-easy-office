-- Allow multiple bookings per user per day, as long as times don't overlap.
-- Previously a UNIQUE (user_id, date) constraint prevented this entirely.

-- 1. Drop the one-booking-per-day constraint
ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_user_date_unique;

-- 2. Extend check_booking_capacity to also reject same-user time overlaps
CREATE OR REPLACE FUNCTION public.check_booking_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  conflict_count integer;
  total_capacity integer;
BEGIN
  -- Reject if this user already has an overlapping booking on this day
  SELECT COUNT(*) INTO conflict_count
  FROM public.bookings
  WHERE user_id = NEW.user_id
    AND date    = NEW.date
    AND public.times_overlap(start_time, end_time, NEW.start_time, NEW.end_time)
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF conflict_count > 0 THEN
    RAISE EXCEPTION 'You already have a booking that overlaps this time slot';
  END IF;

  -- Cars cannot share the spot with another car in an overlapping time window
  IF NEW.vehicle_type = 'car' THEN
    SELECT COUNT(*) INTO conflict_count
    FROM public.bookings
    WHERE spot_number  = NEW.spot_number
      AND date         = NEW.date
      AND vehicle_type = 'car'
      AND public.times_overlap(start_time, end_time, NEW.start_time, NEW.end_time)
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

    IF conflict_count > 0 THEN
      RAISE EXCEPTION 'This spot already has a car booking at that time';
    END IF;
  END IF;

  -- Total capacity for the overlapping time window must not exceed 4 units
  SELECT COALESCE(SUM(capacity), 0) INTO total_capacity
  FROM public.bookings
  WHERE spot_number = NEW.spot_number
    AND date        = NEW.date
    AND public.times_overlap(start_time, end_time, NEW.start_time, NEW.end_time)
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF total_capacity + NEW.capacity > 4 THEN
    RAISE EXCEPTION 'Not enough capacity. Available: % units, Required: % units',
      (4 - total_capacity), NEW.capacity;
  END IF;

  RETURN NEW;
END;
$$;
