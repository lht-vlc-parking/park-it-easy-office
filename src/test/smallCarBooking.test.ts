import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateBookingData } from '@/services/bookingService';

const bookingData: CreateBookingData = {
  date: '2099-01-15',
  duration: 'full',
  start_time: '08:00',
  end_time: '18:00',
  vehicle_type: 'car',
  is_small_car: true,
  spot_number: 84,
};

const existingBooking = (vehicle_type: 'car' | 'motorcycle', capacity: number) => ({
  ...bookingData,
  id: crypto.randomUUID(),
  user_name: 'Another user',
  vehicle_type,
  capacity,
});

describe('Small-car booking capacity', () => {
  const insert = vi.fn();
  const update = vi.fn();
  const rpc = vi.fn();
  let existingBookings: ReturnType<typeof existingBooking>[];

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    existingBookings = [];
    const savedBooking = { ...existingBooking('car', 2), user_name: 'Driver' };
    const result = () => ({
      select: () => ({ single: async () => ({ data: savedBooking, error: null }) }),
    });
    insert.mockImplementation(result);
    update.mockImplementation(() => ({ eq: result }));
    rpc.mockResolvedValue({ data: [savedBooking], error: null });
    vi.doMock('@/integrations/supabase/client', () => ({
      supabase: {
        from: () => ({
          select: () => ({
            eq: () => ({ eq: async () => ({ data: existingBookings, error: null }) }),
          }),
          insert,
          update,
        }),
        rpc,
      },
    }));
  });

  afterEach(() => {
    vi.doUnmock('@/integrations/supabase/client');
    vi.resetModules();
  });

  it.each([
    ['car', true, 2],
    ['car', false, 3],
    ['motorcycle', true, 1],
  ] as const)(
    'persists %s with small-car=%s as %i units',
    async (vehicle_type, is_small_car, capacity) => {
      const { BookingService } = await import('@/services/bookingService');
      const result = await BookingService.createBooking(
        { ...bookingData, vehicle_type, is_small_car },
        'driver',
        'Driver'
      );
      expect(result.success).toBe(true);
      expect(insert).toHaveBeenCalledWith(expect.objectContaining({ vehicle_type, capacity }));
    }
  );

  it.each([
    [true, 2, true],
    [true, 3, false],
    [false, 2, false],
  ] as const)('checks small-car=%s against %i motorcycles', async (isSmallCar, count, success) => {
    existingBookings = Array.from({ length: count }, () => existingBooking('motorcycle', 1));
    const { BookingService } = await import('@/services/bookingService');
    const result = await BookingService.createBooking(
      { ...bookingData, is_small_car: isSmallCar },
      'driver',
      'Driver'
    );
    expect(result.success).toBe(success);
    if (!success) expect(result.error).toContain('Not enough capacity');
  });

  it.each([
    [1, true],
    [2, false],
  ] as const)(
    'allows a motorcycle alongside a small car and %i existing motorcycle(s): %s',
    async (count, success) => {
      existingBookings = [
        existingBooking('car', 2),
        ...Array.from({ length: count }, () => existingBooking('motorcycle', 1)),
      ];
      const { BookingService } = await import('@/services/bookingService');
      const result = await BookingService.createBooking(
        { ...bookingData, vehicle_type: 'motorcycle', is_small_car: false },
        'rider',
        'Rider'
      );
      expect(result.success).toBe(success);
      if (!success) expect(result.error).toContain('Not enough capacity');
    }
  );

  it('still rejects two overlapping small cars', async () => {
    existingBookings = [existingBooking('car', 2)];
    const { BookingService } = await import('@/services/bookingService');
    const result = await BookingService.createBooking(bookingData, 'driver', 'Driver');
    expect(result.error).toContain('already has a car booking');
    expect(insert).not.toHaveBeenCalled();
  });

  it.each([
    ['car', true, 2],
    ['car', false, 3],
    ['motorcycle', true, 1],
  ] as const)(
    'updates %s with small-car=%s to %i units',
    async (vehicle_type, is_small_car, capacity) => {
      const { BookingService } = await import('@/services/bookingService');
      const result = await BookingService.updateBooking('booking-id', {
        ...bookingData,
        vehicle_type,
        is_small_car,
      });
      expect(result.success).toBe(true);
      expect(update).toHaveBeenCalledWith(expect.objectContaining({ capacity }));
    }
  );

  it('passes the small-car option when booking for someone else', async () => {
    const { BookingService } = await import('@/services/bookingService');
    const result = await BookingService.createBooking(
      { ...bookingData, behalfEmail: 'colleague@example.com' },
      'driver',
      'Driver'
    );
    expect(result.success).toBe(true);
    expect(rpc).toHaveBeenCalledWith(
      'book_on_behalf_of',
      expect.objectContaining({
        p_is_small_car: true,
        p_behalf_email: 'colleague@example.com',
      })
    );
    expect(insert).not.toHaveBeenCalled();
  });

  it('moves a booking without overwriting its time, vehicle or small-car capacity', async () => {
    const { BookingService } = await import('@/services/bookingService');
    const result = await BookingService.updateBooking('booking-id', {
      date: '2099-01-16',
      spot_number: 85,
    });

    expect(result.success).toBe(true);
    expect(update).toHaveBeenCalledExactlyOnceWith({ date: '2099-01-16', spot_number: 85 });
  });

  it.each([
    'This spot already has a car booking at that time',
    'Not enough capacity. Available: 1 units, Required: 2 units',
    'You already have a booking that overlaps this time slot',
    'new row violates row-level security policy for table "bookings"',
  ])('reports a rejected move: %s', async message => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    update.mockReturnValueOnce({
      eq: () => ({
        select: () => ({ single: async () => ({ data: null, error: { message } }) }),
      }),
    });
    const { BookingService } = await import('@/services/bookingService');

    expect(
      await BookingService.updateBooking('booking-id', { date: '2099-01-16', spot_number: 85 })
    ).toEqual({ success: false, error: message });
    vi.restoreAllMocks();
  });
});
