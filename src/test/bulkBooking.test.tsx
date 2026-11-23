import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CreateBookingData } from '@/services/bookingService';

const createBooking =
  vi.fn<(params: CreateBookingData & { userId: string; userName: string }) => Promise<unknown>>();
const toastError = vi.fn();
const toastSuccess = vi.fn();

async function openBookingDialog() {
  const { default: Index } = await import('@/pages/Index');
  render(<Index />);
  fireEvent.click(screen.getAllByRole('button', { name: 'Book This Spot' })[0]);
}

function selectThreeDays() {
  fireEvent.click(screen.getByRole('button', { name: 'Thursday, December 31, 2026' }));
  fireEvent.click(screen.getByRole('button', { name: 'Friday, January 1, 2027' }));
}

describe('Bulk booking requests', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 11, 30, 12));
    createBooking.mockReset().mockResolvedValue({});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.doMock('@/hooks/useAuth', () => ({
      useAuth: () => ({
        user: { id: 'driver', email: 'driver@lht.dlh.de', user_metadata: { user_name: 'Driver' } },
        signOut: vi.fn(),
      }),
    }));
    vi.doMock('@/hooks/useUserProfile', () => ({
      useUserProfile: () => ({ profile: null, isAdmin: false }),
    }));
    vi.doMock('@/hooks/useBookings', () => ({
      useBookings: () => ({ data: [], isLoading: false }),
    }));
    vi.doMock('@/hooks/useCreateBooking', () => ({
      useCreateBooking: () => ({ mutateAsync: createBooking }),
    }));
    vi.doMock('@/hooks/useUpdateBooking', () => ({
      useUpdateBooking: () => ({ mutate: vi.fn() }),
    }));
    vi.doMock('@/hooks/useDeleteBooking', () => ({
      useDeleteBooking: () => ({ mutate: vi.fn() }),
    }));
    vi.doMock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
    vi.doMock('@/components/v2/ThemeToggle', () => ({ ThemeToggle: () => null }));
    vi.doMock('sonner', () => ({ toast: { error: toastError, success: toastSuccess } }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.doUnmock('@/hooks/useAuth');
    vi.doUnmock('@/hooks/useUserProfile');
    vi.doUnmock('@/hooks/useBookings');
    vi.doUnmock('@/hooks/useCreateBooking');
    vi.doUnmock('@/hooks/useUpdateBooking');
    vi.doUnmock('@/hooks/useDeleteBooking');
    vi.doUnmock('react-router-dom');
    vi.doUnmock('@/components/v2/ThemeToggle');
    vi.doUnmock('sonner');
    vi.resetModules();
  });

  it('continues after a failed date and preserves the booking options for every request', async () => {
    createBooking
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('This spot already has a car booking at that time'))
      .mockResolvedValueOnce({});
    await openBookingDialog();
    selectThreeDays();
    fireEvent.click(screen.getByRole('switch', { name: /Small car/ }));
    fireEvent.click(screen.getByRole('switch', { name: '' }));
    fireEvent.change(screen.getByPlaceholderText('colleague@lht.dlh.de'), {
      target: { value: 'colleague@lht.dlh.de' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm 3 Bookings' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(createBooking.mock.calls.map(([params]) => params.date)).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
    ]);
    for (const [params] of createBooking.mock.calls) {
      expect(params).toEqual(
        expect.objectContaining({
          duration: 'full',
          start_time: '08:00',
          end_time: '18:00',
          vehicle_type: 'car',
          is_small_car: true,
          spot_number: 84,
          behalfEmail: 'colleague@lht.dlh.de',
          userId: 'driver',
          userName: 'Driver',
        })
      );
    }
    expect(toastError).toHaveBeenCalledExactlyOnceWith(
      'Created 2 of 3 bookings.',
      expect.objectContaining({ duration: Infinity, closeButton: true, position: 'top-center' })
    );
    render(toastError.mock.calls[0][1].description);
    expect(
      screen.getByText('2026-12-31: This spot already has a car booked for that time slot.')
    ).toBeVisible();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('attempts every date even if all fail, without showing a success notification', async () => {
    createBooking.mockRejectedValue(new Error('raw_database_failure'));
    await openBookingDialog();
    selectThreeDays();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm 3 Bookings' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(createBooking).toHaveBeenCalledTimes(3);
    expect(toastError).toHaveBeenCalledExactlyOnceWith(
      'No bookings were created.',
      expect.objectContaining({ duration: Infinity, closeButton: true })
    );
    render(toastError.mock.calls[0][1].description);
    for (const date of ['2026-12-30', '2026-12-31', '2027-01-01']) {
      expect(
        screen.getByText(`${date}: Failed to create booking. Please try again.`)
      ).toBeVisible();
    }
    expect(screen.queryByText(/raw_database_failure/)).not.toBeInTheDocument();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('renders the failure notification in the frontend after the dialog closes', async () => {
    vi.doUnmock('sonner');
    const { Toaster } = await import('@/components/ui/sonner');
    const { ThemeProvider } = await import('@/components/ThemeProvider');
    render(
      <ThemeProvider>
        <Toaster />
      </ThemeProvider>
    );
    createBooking.mockRejectedValue(new Error('This spot already has a car booking at that time'));
    await openBookingDialog();
    selectThreeDays();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm 3 Bookings' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('No bookings were created.')).toBeVisible();
    for (const date of ['2026-12-30', '2026-12-31', '2027-01-01']) {
      expect(
        screen.getByText(`${date}: This spot already has a car booked for that time slot.`)
      ).toBeVisible();
    }
    fireEvent.click(screen.getByRole('button', { name: /close toast/i }));
    await waitFor(() =>
      expect(screen.queryByText('No bookings were created.')).not.toBeInTheDocument()
    );
  });

  it('still creates just one booking when only the default date is selected', async () => {
    await openBookingDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Booking' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(createBooking).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ date: '2026-12-30' })
    );
    expect(toastSuccess).toHaveBeenCalledWith('Parking spot booked successfully!');
    expect(toastError).not.toHaveBeenCalled();
  });
});
