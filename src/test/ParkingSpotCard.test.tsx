import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ParkingSpotCard } from '../components/ParkingSpotCard';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SmallCarIndicator } from '@/components/SmallCarIndicator';
import { DURATION_PRESETS } from '../services/bookingService';
import type { Booking } from '../types/booking';

const makeBooking = (overrides: Partial<Booking> & { id: string; date: string }): Booking => {
  const duration = overrides.duration ?? 'full';
  const preset = DURATION_PRESETS[duration];
  return {
    duration,
    start_time: preset.start_time,
    end_time: preset.end_time,
    vehicle_type: 'car',
    capacity: null,
    user_name: 'Test User',
    spot_number: 84,
    user_id: 'user-1',
    created_at: new Date().toISOString(),
    ...overrides,
  };
};

describe('ParkingSpotCard', () => {
  it.each([0, 1, 2])('shows remaining room in a tooltip with %i motorcycles', async count => {
    const today = new Date().toISOString().split('T')[0];
    render(
      <TooltipProvider>
        <ParkingSpotCard
          spotNumber={84}
          onBook={vi.fn()}
          currentBookings={[
            makeBooking({ id: 'car', date: today, capacity: 2 }),
            ...Array.from({ length: count }, (_, i) =>
              makeBooking({ id: `bike-${i}`, date: today, vehicle_type: 'motorcycle', capacity: 1 })
            ),
          ]}
        />
      </TooltipProvider>
    );
    const indicator = screen.getByRole('button', { name: 'Small car (2/4 capacity)' });
    const name = screen.getAllByText('Test User')[0];
    expect(name.previousElementSibling).toHaveClass('lucide-car');
    expect(name.nextElementSibling).toBe(indicator);
    expect(indicator).toHaveTextContent('Small car');
    expect(screen.queryByText(/Small car \(2\/4 capacity\)/)).not.toBeInTheDocument();
    fireEvent.focus(indicator);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      `Small car (2/4 capacity). Room for ${2 - count} more ${count === 1 ? 'motorcycle' : 'motorcycles'} during this booking.`
    );
    fireEvent.keyDown(indicator, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(screen.getByText(count === 2 ? '✕ Full' : '◐ Partial')).toBeInTheDocument();
  });

  it('does not show a small-car label for regular cars or motorcycles', () => {
    const today = new Date().toISOString().split('T')[0];
    render(
      <ParkingSpotCard
        spotNumber={84}
        onBook={vi.fn()}
        currentBookings={[
          makeBooking({ id: 'car', date: today, capacity: 3 }),
          makeBooking({ id: 'bike', date: today, vehicle_type: 'motorcycle', capacity: 1 }),
        ]}
      />
    );
    expect(screen.queryByRole('button', { name: /Small car/ })).not.toBeInTheDocument();
  });

  it('explains small-car capacity when remaining availability is not provided', async () => {
    render(
      <TooltipProvider>
        <SmallCarIndicator />
      </TooltipProvider>
    );
    fireEvent.focus(screen.getByRole('button', { name: 'Small car (2/4 capacity)' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Small car (2/4 capacity). Room for up to 2 motorcycles.'
    );
  });

  describe('Book button behavior', () => {
    it('should always enable "Book This Spot" button when no bookings exist', () => {
      const onBook = vi.fn();

      render(<ParkingSpotCard spotNumber={84} currentBookings={[]} onBook={onBook} />);

      const button = screen.getByRole('button', { name: /book this spot/i });
      expect(button).toBeEnabled();
    });

    it('should enable button even when spot has today bookings (shows "Book This Spot")', () => {
      const onBook = vi.fn();
      const today = new Date().toISOString().split('T')[0];

      // Car alone (3/4 units) - partial availability
      const currentBookings = [
        makeBooking({
          id: '1',
          date: today,
          duration: 'full',
          vehicle_type: 'car',
          user_name: 'John Doe',
        }),
      ];

      render(<ParkingSpotCard spotNumber={84} currentBookings={currentBookings} onBook={onBook} />);

      // With new capacity system, a car leaves room for 1 motorcycle
      const button = screen.getByRole('button', { name: /book this spot/i });
      expect(button).toBeEnabled();
    });

    it('should show "View Options" button when spot is fully booked for today', () => {
      const onBook = vi.fn();
      const today = new Date().toISOString().split('T')[0];

      // Fully booked with car (3 units) + motorcycle (1 unit) = 4 units total
      const currentBookings = [
        makeBooking({
          id: '1',
          date: today,
          duration: 'full',
          vehicle_type: 'car',
          user_name: 'John Doe',
        }),
        makeBooking({
          id: '2',
          date: today,
          duration: 'full',
          vehicle_type: 'motorcycle',
          user_name: 'Jane Doe',
        }),
      ];

      render(<ParkingSpotCard spotNumber={85} currentBookings={currentBookings} onBook={onBook} />);

      const button = screen.getByRole('button', { name: /view options/i });
      // Button should be enabled because users can book for other days
      expect(button).toBeEnabled();
    });

    it('should enable "Book This Spot" button when some motorcycles are present but not at capacity', () => {
      const onBook = vi.fn();
      const today = new Date().toISOString().split('T')[0];

      // 3 motorcycles (3/4 units) - room for 1 more motorcycle, so "partial" status
      const currentBookings = Array.from({ length: 3 }, (_, i) =>
        makeBooking({
          id: `${i + 1}`,
          date: today,
          duration: 'full',
          vehicle_type: 'motorcycle',
          user_name: `Biker ${i + 1}`,
        })
      );

      render(<ParkingSpotCard spotNumber={84} currentBookings={currentBookings} onBook={onBook} />);

      const button = screen.getByRole('button', { name: /book this spot/i });
      // Button should be enabled because users can add more motorcycles
      expect(button).toBeEnabled();
    });

    it('should show "View Options" when both car and motorcycles are fully booked', () => {
      const onBook = vi.fn();
      const today = new Date().toISOString().split('T')[0];

      const currentBookings = [
        makeBooking({
          id: '1',
          date: today,
          duration: 'morning',
          vehicle_type: 'car',
          user_name: 'Morning Car',
        }),
        makeBooking({
          id: '2',
          date: today,
          duration: 'afternoon',
          vehicle_type: 'car',
          user_name: 'Afternoon Car',
        }),
        ...Array.from({ length: 4 }, (_, i) =>
          makeBooking({
            id: `${i + 3}`,
            date: today,
            duration: 'full',
            vehicle_type: 'motorcycle',
            user_name: `Biker ${i + 1}`,
          })
        ),
      ];

      render(<ParkingSpotCard spotNumber={85} currentBookings={currentBookings} onBook={onBook} />);

      const button = screen.getByRole('button', { name: /view options/i });
      // Button should be enabled because users can book for other days
      expect(button).toBeEnabled();
    });

    it('should show "Book This Spot" when car is present, as room exists for motorcycle', () => {
      const onBook = vi.fn();
      const today = new Date().toISOString().split('T')[0];

      // Car alone (3/4 units) - room for 1 motorcycle, so "Book This Spot"
      const currentBookings = [
        makeBooking({
          id: '1',
          date: today,
          duration: 'full',
          vehicle_type: 'car',
          user_name: 'John Doe',
        }),
      ];

      render(<ParkingSpotCard spotNumber={84} currentBookings={currentBookings} onBook={onBook} />);

      // With new capacity system, car leaves room for motorcycle, so shows "Book This Spot"
      expect(screen.getByRole('button', { name: /book this spot/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /view options/i })).not.toBeInTheDocument();
    });
  });

  describe('Display status badges', () => {
    it('should show "✓ Available" badge when no bookings exist', () => {
      const onBook = vi.fn();

      render(<ParkingSpotCard spotNumber={84} currentBookings={[]} onBook={onBook} />);

      expect(screen.getByText('✓ Available')).toBeInTheDocument();
    });

    it('should show "✕ Full" badge when spot is fully booked for today', () => {
      const onBook = vi.fn();
      const today = new Date().toISOString().split('T')[0];

      // Fully booked: car (3 units) + motorcycle (1 unit) = 4 units
      const currentBookings = [
        makeBooking({
          id: '1',
          date: today,
          duration: 'full',
          vehicle_type: 'car',
          user_name: 'John Doe',
        }),
        makeBooking({
          id: '2',
          date: today,
          duration: 'full',
          vehicle_type: 'motorcycle',
          user_name: 'Jane Doe',
        }),
      ];

      render(<ParkingSpotCard spotNumber={84} currentBookings={currentBookings} onBook={onBook} />);

      // Badge should show status, and button shows "View Options"
      expect(screen.getByText('✕ Full')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /view options/i })).toBeEnabled();
    });

    it('should show "◐ Partial" badge when some slots are taken', () => {
      const onBook = vi.fn();
      const today = new Date().toISOString().split('T')[0];

      const currentBookings = [
        makeBooking({
          id: '1',
          date: today,
          duration: 'morning',
          vehicle_type: 'car',
          user_name: 'Morning User',
        }),
      ];

      render(<ParkingSpotCard spotNumber={84} currentBookings={currentBookings} onBook={onBook} />);

      expect(screen.getByText('◐ Partial')).toBeInTheDocument();
    });
  });

  describe('Button styling based on status', () => {
    it('should show warning gradient button when spot is fully booked', () => {
      const onBook = vi.fn();
      const today = new Date().toISOString().split('T')[0];

      // Fully booked: car (3 units) + motorcycle (1 unit) = 4 units
      const currentBookings = [
        makeBooking({
          id: '1',
          date: today,
          duration: 'full',
          vehicle_type: 'car',
          user_name: 'John Doe',
        }),
        makeBooking({
          id: '2',
          date: today,
          duration: 'full',
          vehicle_type: 'motorcycle',
          user_name: 'Jane Doe',
        }),
      ];

      render(<ParkingSpotCard spotNumber={84} currentBookings={currentBookings} onBook={onBook} />);

      const button = screen.getByRole('button', { name: /view options/i });
      // Check that button has warning gradient class for fully booked spots
      expect(button.className).toContain('gradient-warning');
    });

    it('should show primary gradient button when spot is available', () => {
      const onBook = vi.fn();

      render(<ParkingSpotCard spotNumber={84} currentBookings={[]} onBook={onBook} />);

      const button = screen.getByRole('button', { name: /book this spot/i });
      // Check that button has primary gradient class for available spots
      expect(button.className).toContain('gradient-primary');
    });

    it('should show primary gradient button when spot is partially booked', () => {
      const onBook = vi.fn();
      const today = new Date().toISOString().split('T')[0];

      const currentBookings = [
        makeBooking({
          id: '1',
          date: today,
          duration: 'morning',
          vehicle_type: 'car',
          user_name: 'Morning User',
        }),
      ];

      render(<ParkingSpotCard spotNumber={84} currentBookings={currentBookings} onBook={onBook} />);

      const button = screen.getByRole('button', { name: /book this spot/i });
      // Check that button has primary gradient class for partially booked spots
      expect(button.className).toContain('gradient-primary');
    });
  });
});
