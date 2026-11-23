import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { Booking } from '@/types/booking';

describe('Small-car booking toggle', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock('@/hooks/useAuth', () => ({
      useAuth: () => ({ user: { id: 'driver' } }),
    }));
    vi.doMock('@/hooks/useUserProfile', () => ({
      useUserProfile: () => ({ profile: null }),
    }));
  });

  afterEach(() => {
    vi.doUnmock('@/hooks/useAuth');
    vi.doUnmock('@/hooks/useUserProfile');
    vi.resetModules();
  });

  it('submits the small-car option and clears it when switching to motorcycle', async () => {
    const { BookingDialogWithValidation } =
      await import('@/components/BookingDialogWithValidation');
    const onConfirm = vi.fn();
    render(
      <BookingDialogWithValidation
        open
        onOpenChange={vi.fn()}
        spotNumber={84}
        onConfirm={onConfirm}
      />
    );
    const toggle = screen.getByRole('switch', { name: 'Small car (room for 2 bikes)' });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    fireEvent.click(screen.getByText('Motorcycle'));
    expect(screen.queryByRole('switch', { name: /Small car/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Car'));
    expect(screen.getByRole('switch', { name: /Small car/ })).not.toBeChecked();
    fireEvent.click(screen.getByRole('switch', { name: /Small car/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Booking' }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ is_small_car: true }));
  });

  it('preserves the small-car option when editing and resets it for a new booking', async () => {
    const { BookingDialogWithValidation } =
      await import('@/components/BookingDialogWithValidation');
    const editingBooking: Booking = {
      id: 'small-car',
      date: '2099-01-15',
      duration: 'full',
      start_time: '08:00:00',
      end_time: '18:00:00',
      vehicle_type: 'car',
      capacity: 2,
      spot_number: 84,
      user_id: 'driver',
      user_name: 'Driver',
      created_at: '2026-11-23T12:00:00Z',
    };
    const props = { onOpenChange: vi.fn(), spotNumber: 84, onConfirm: vi.fn() };
    const { rerender } = render(
      <BookingDialogWithValidation {...props} open editingBooking={editingBooking} />
    );
    expect(screen.getByRole('switch', { name: /Small car/ })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Update Booking' }));
    expect(props.onConfirm).toHaveBeenCalledWith(expect.objectContaining({ is_small_car: true }));
    rerender(<BookingDialogWithValidation {...props} open={false} />);
    rerender(<BookingDialogWithValidation {...props} open />);
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: /Small car/ })).not.toBeChecked()
    );
  });
});
