import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { Booking } from '@/types/booking';
import type { BookingDialogData } from '@/components/BookingDialogWithValidation';

const toastError = vi.fn();

async function renderCreateDialog(
  onConfirm: (booking: BookingDialogData) => void | Promise<void> = vi.fn()
) {
  const { BookingDialogWithValidation } = await import('@/components/BookingDialogWithValidation');
  const onOpenChange = vi.fn();
  render(
    <BookingDialogWithValidation
      open
      onOpenChange={onOpenChange}
      spotNumber={84}
      onConfirm={onConfirm}
    />
  );
  return { onConfirm, onOpenChange };
}

describe('Booking dialog', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 11, 30, 12));
    vi.doMock('@/hooks/useAuth', () => ({
      useAuth: () => ({ user: { id: 'driver' } }),
    }));
    vi.doMock('@/hooks/useUserProfile', () => ({
      useUserProfile: () => ({ profile: null }),
    }));
    vi.doMock('sonner', () => ({ toast: { error: toastError } }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.doUnmock('@/hooks/useAuth');
    vi.doUnmock('@/hooks/useUserProfile');
    vi.doUnmock('sonner');
    vi.resetModules();
  });

  it('submits the small-car option and clears it when switching to motorcycle', async () => {
    const { onConfirm, onOpenChange } = await renderCreateDialog();
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
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('shows Monday to Sunday with the chosen date selected and past dates disabled', async () => {
    await renderCreateDialog();
    const days = within(screen.getByRole('group', { name: 'Booking days' })).getAllByRole('button');
    expect(days.map(day => day.textContent)).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
    expect(days[0]).toBeDisabled();
    expect(days[1]).toBeDisabled();
    expect(days[2]).toHaveAccessibleName('Wednesday, December 30, 2026');
    expect(days[2]).toHaveAttribute('aria-pressed', 'true');
    expect(days.slice(3).every(day => day.getAttribute('aria-pressed') === 'false')).toBe(true);
    expect(screen.getByRole('button', { name: 'Sunday, January 3, 2027' })).toBeEnabled();
  });

  it('submits only selected dates, including weekends across a year boundary', async () => {
    const { onConfirm, onOpenChange } = await renderCreateDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Sunday, January 3, 2027' }));
    fireEvent.click(screen.getByRole('button', { name: 'Thursday, December 31, 2026' }));
    fireEvent.click(screen.getByRole('button', { name: 'Wednesday, December 30, 2026' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm 2 Bookings' }));

    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        date: '2026-12-31',
        dates: ['2026-12-31', '2027-01-03'],
      })
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('resets the selected days to the new date when changing calendar weeks', async () => {
    await renderCreateDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Thursday, December 31, 2026' }));
    fireEvent.click(screen.getByRole('button', { name: 'December 30th, 2026' }));
    fireEvent.click(screen.getByRole('button', { name: /go to the next month/i }));
    fireEvent.click(screen.getByRole('button', { name: /Wednesday, January 6th, 2027/ }));

    const days = within(screen.getByRole('group', { name: 'Booking days' })).getAllByRole('button');
    expect(days[0]).toHaveAccessibleName('Monday, January 4, 2027');
    expect(days.every(day => !day.hasAttribute('disabled'))).toBe(true);
    expect(days.filter(day => day.getAttribute('aria-pressed') === 'true')).toEqual([
      screen.getByRole('button', { name: 'Wednesday, January 6, 2027' }),
    ]);
  });

  it('requires at least one selected day', async () => {
    const { onConfirm } = await renderCreateDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Wednesday, December 30, 2026' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Booking' }));

    expect(toastError).toHaveBeenCalledWith('Please select at least one day');
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('keeps selected booking days when profile defaults finish loading', async () => {
    let profile: {
      default_vehicle_type: 'car';
      default_start_time: string;
      default_end_time: string;
    } | null = null;
    vi.doMock('@/hooks/useUserProfile', () => ({
      useUserProfile: () => ({ profile }),
    }));
    const { BookingDialogWithValidation } =
      await import('@/components/BookingDialogWithValidation');
    const props = { open: true, onOpenChange: vi.fn(), spotNumber: 84, onConfirm: vi.fn() };
    const { rerender } = render(<BookingDialogWithValidation {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Thursday, December 31, 2026' }));

    profile = {
      default_vehicle_type: 'car',
      default_start_time: '09:00',
      default_end_time: '17:00',
    };
    rerender(<BookingDialogWithValidation {...props} />);

    expect(screen.getByRole('button', { name: 'Thursday, December 31, 2026' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Confirm 2 Bookings' })).toBeEnabled();
    expect(screen.getByLabelText('Start')).toHaveValue('09:00');
  });

  it('waits for all requests to finish and prevents duplicate submissions', async () => {
    let finish = () => {};
    const pending = new Promise<void>(resolve => {
      finish = resolve;
    });
    const onConfirm = vi.fn(() => pending);
    const { onOpenChange } = await renderCreateDialog(onConfirm);
    fireEvent.click(screen.getByRole('button', { name: 'Thursday, December 31, 2026' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm 2 Bookings' }));

    const submit = screen.getByRole('button', { name: 'Booking...' });
    expect(submit).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Thursday, December 31, 2026' })).toBeDisabled();
    fireEvent.click(submit);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();

    await act(async () => finish());
    expect(onOpenChange).toHaveBeenCalledWith(false);
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
    expect(screen.queryByRole('group', { name: 'Booking days' })).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Small car/ })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Update Booking' }));
    expect(props.onConfirm).toHaveBeenCalledWith(expect.objectContaining({ is_small_car: true }));
    expect(props.onConfirm.mock.calls[0][0]).not.toHaveProperty('dates');
    await waitFor(() => expect(props.onOpenChange).toHaveBeenCalledWith(false));
    rerender(<BookingDialogWithValidation {...props} open={false} />);
    rerender(<BookingDialogWithValidation {...props} open />);
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: /Small car/ })).not.toBeChecked()
    );
    expect(screen.getByRole('button', { name: 'Wednesday, December 30, 2026' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
});
