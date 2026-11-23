import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Booking } from '@/types/booking';

const originalBooking: Booking = {
  id: 'my-booking',
  user_id: 'driver',
  user_name: 'Driver',
  date: '2026-12-30',
  spot_number: 84,
  duration: 'full',
  start_time: '09:00:00',
  end_time: '17:00:00',
  vehicle_type: 'car',
  capacity: 2,
  created_at: '2026-12-29T12:00:00Z',
};
const colleagueBooking: Booking = {
  ...originalBooking,
  id: 'colleague-booking',
  user_id: 'colleague',
  user_name: 'Colleague',
  date: '2026-12-31',
  spot_number: 85,
  vehicle_type: 'motorcycle',
  capacity: 1,
};
const moveBooking =
  vi.fn<(params: { bookingId: string; date: string; spot_number: number }) => Promise<Booking>>();
const toastError = vi.fn();
const toastSuccess = vi.fn();
let bookings: Booking[];
let isAdmin: boolean;

const tile = (date: string, spot: number) => {
  const element = document.querySelector<HTMLElement>(
    `[data-booking-drop-date="${date}"][data-booking-drop-spot="${spot}"]`
  );
  if (!element) throw new Error(`Missing tile for ${date}, spot ${spot}`);
  return within(element);
};

async function renderDashboard() {
  const { default: Index } = await import('@/pages/Index');
  const { TooltipProvider } = await import('@/components/ui/tooltip');
  render(
    <TooltipProvider>
      <Index />
    </TooltipProvider>
  );
}

async function pickUpBooking(name = 'Driver') {
  const handle = screen.getAllByRole('button', {
    name: new RegExp(`Move booking for ${name},`),
  })[0];
  handle.focus();
  fireEvent.keyDown(handle, { code: 'Space', key: ' ' });
  await waitFor(() => expect(handle).toHaveAttribute('aria-pressed', 'true'));
  return handle;
}

async function chooseNextTile(date: string, spot: number) {
  fireEvent.keyDown(document, { code: 'ArrowDown', key: 'ArrowDown' });
  await screen.findByText(`Parking spot ${spot} on ${date}.`);
}

describe('Moving bookings between parking tiles', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 11, 30, 12));
    bookings = [originalBooking, colleagueBooking];
    isAdmin = false;
    moveBooking.mockReset().mockImplementation(async ({ bookingId, ...destination }) => {
      bookings = bookings.map(booking =>
        booking.id === bookingId ? { ...booking, ...destination } : booking
      );
      return bookings.find(booking => booking.id === bookingId)!;
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      const target = this.closest('[data-booking-drop-date]');
      const targets = Array.from(document.querySelectorAll('[data-booking-drop-date]'));
      return new DOMRect(0, Math.max(0, targets.indexOf(target!)) * 100, 600, 80);
    });
    vi.doMock('@/hooks/useAuth', () => ({
      useAuth: () => ({
        user: { id: 'driver', email: 'driver@example.com', user_metadata: { user_name: 'Driver' } },
        signOut: vi.fn(),
      }),
    }));
    vi.doMock('@/hooks/useUserProfile', () => ({
      useUserProfile: () => ({ profile: null, isAdmin }),
    }));
    vi.doMock('@/hooks/useBookings', () => ({
      useBookings: () => ({ data: bookings, isLoading: false }),
    }));
    vi.doMock('@/hooks/useUpdateBooking', () => ({
      useUpdateBooking: () => ({ mutate: vi.fn(), mutateAsync: moveBooking, isPending: false }),
    }));
    vi.doMock('@/hooks/useCreateBooking', () => ({
      useCreateBooking: () => ({ mutateAsync: vi.fn() }),
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
    for (const module of [
      '@/hooks/useAuth',
      '@/hooks/useUserProfile',
      '@/hooks/useBookings',
      '@/hooks/useUpdateBooking',
      '@/hooks/useCreateBooking',
      '@/hooks/useDeleteBooking',
      'react-router-dom',
      '@/components/v2/ThemeToggle',
      'sonner',
    ]) {
      vi.doUnmock(module);
    }
    vi.resetModules();
  });

  it("only makes the signed-in user's bookings draggable", async () => {
    await renderDashboard();
    expect(screen.getAllByRole('button', { name: /Move booking for Driver,/ })).toHaveLength(2);
    expect(
      screen.queryByRole('button', { name: /Move booking for Colleague,/ })
    ).not.toBeInTheDocument();
  });

  it('orders tiles by date and then spot number, regardless of booking start times', async () => {
    bookings = [
      { ...colleagueBooking, date: '2026-12-30', start_time: '08:00:00' },
      { ...originalBooking, start_time: '16:00:00' },
      { ...colleagueBooking, id: 'tomorrow', spot_number: 84 },
    ];
    await renderDashboard();
    const section = screen
      .getByRole('heading', { name: /All Upcoming Bookings/ })
      .closest('section')!;
    const cards = section.querySelectorAll<HTMLElement>('[data-booking-drop-date]');

    expect(
      Array.from(cards, card => [card.dataset.bookingDropDate, card.dataset.bookingDropSpot])
    ).toEqual([
      ['2026-12-30', '84'],
      ['2026-12-30', '85'],
      ['2026-12-31', '84'],
    ]);
  });

  it("allows admins to move another user's booking without changing its owner", async () => {
    isAdmin = true;
    await renderDashboard();
    await pickUpBooking('Colleague');
    fireEvent.keyDown(document, { code: 'ArrowUp', key: 'ArrowUp' });
    await screen.findByText('Parking spot 84 on 2026-12-30.');
    fireEvent.keyDown(document, { code: 'Enter', key: 'Enter' });

    await waitFor(() =>
      expect(moveBooking).toHaveBeenCalledExactlyOnceWith({
        bookingId: 'colleague-booking',
        date: '2026-12-30',
        spot_number: 84,
      })
    );
    expect(bookings.find(booking => booking.id === 'colleague-booking')?.user_id).toBe('colleague');
  });

  it('updates both date and spot while preserving the original booking details', async () => {
    await renderDashboard();
    await pickUpBooking();
    await chooseNextTile('2026-12-30', 85);
    await chooseNextTile('2026-12-30', 84);
    await chooseNextTile('2026-12-31', 85);
    fireEvent.keyDown(document, { code: 'Enter', key: 'Enter' });

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Booking moved successfully!'));
    expect(moveBooking).toHaveBeenCalledExactlyOnceWith({
      bookingId: originalBooking.id,
      date: '2026-12-31',
      spot_number: 85,
    });
    expect(bookings[0]).toEqual({ ...originalBooking, date: '2026-12-31', spot_number: 85 });
    expect(tile('2026-12-31', 85).getByText('Driver')).toBeVisible();
    expect(tile('2026-12-30', 84).queryByText('Driver')).not.toBeInTheDocument();
  });

  it('can change only the date while keeping the same spot', async () => {
    bookings = [originalBooking, { ...colleagueBooking, spot_number: 84 }];
    await renderDashboard();
    await pickUpBooking();
    await chooseNextTile('2026-12-30', 85);
    await chooseNextTile('2026-12-30', 84);
    await chooseNextTile('2026-12-31', 84);
    fireEvent.keyDown(document, { code: 'Enter', key: 'Enter' });

    await waitFor(() =>
      expect(moveBooking).toHaveBeenCalledExactlyOnceWith({
        bookingId: originalBooking.id,
        date: '2026-12-31',
        spot_number: 84,
      })
    );
    expect(tile('2026-12-31', 84).getByText('Driver')).toBeVisible();
  });

  it.each([
    [
      'This spot already has a car booking at that time',
      'This spot already has a car booked for that time slot.',
    ],
    [
      'Not enough capacity. Available: 1 units, Required: 2 units',
      'There is not enough room in this spot for that time slot.',
    ],
    ['raw_database_failure', 'Failed to update booking. Please try again.'],
  ])('restores a failed move and reports a safe error: %s', async (message, userMessage) => {
    let rejectMove!: (error: Error) => void;
    moveBooking.mockReturnValue(
      new Promise<Booking>((_, reject) => {
        rejectMove = reject;
      })
    );
    await renderDashboard();
    await pickUpBooking();
    await chooseNextTile('2026-12-30', 85);
    fireEvent.keyDown(document, { code: 'Enter', key: 'Enter' });

    await waitFor(() => expect(moveBooking).toHaveBeenCalledOnce());
    expect(tile('2026-12-30', 85).getByText('Driver')).toBeVisible();
    expect(tile('2026-12-30', 84).queryByText('Driver')).not.toBeInTheDocument();
    for (const handle of screen.getAllByRole('button', { name: /Move booking for Driver,/ })) {
      expect(handle).toBeDisabled();
    }
    rejectMove(new Error(message));

    await waitFor(() => expect(tile('2026-12-30', 84).getByText('Driver')).toBeVisible());
    expect(tile('2026-12-30', 85).queryByText('Driver')).not.toBeInTheDocument();
    expect(toastError).toHaveBeenCalledWith(
      userMessage,
      expect.objectContaining({
        description: 'The booking has been returned to its original position.',
      })
    );
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('does not send an update when dropped on the original date and spot', async () => {
    await renderDashboard();
    const handle = await pickUpBooking();
    fireEvent.keyDown(document, { code: 'Enter', key: 'Enter' });
    await waitFor(() => expect(handle).not.toHaveAttribute('aria-pressed', 'true'));
    expect(moveBooking).not.toHaveBeenCalled();
  });

  it('cancels the move with Escape without sending an update', async () => {
    await renderDashboard();
    await pickUpBooking();
    await chooseNextTile('2026-12-30', 85);
    fireEvent.keyDown(document, { code: 'Escape', key: 'Escape' });

    await screen.findByText('Move cancelled. The booking has not changed.');
    expect(moveBooking).not.toHaveBeenCalled();
    expect(tile('2026-12-30', 84).getByText('Driver')).toBeVisible();
  });

  it('does not send an update when a mouse drag ends outside every tile', async () => {
    await renderDashboard();
    const handle = screen.getAllByRole('button', { name: /Move booking for Driver,/ })[0];
    fireEvent.mouseDown(tile('2026-12-30', 84).getByText('Driver'), {
      button: 0,
      clientX: 300,
      clientY: 40,
    });
    fireEvent.mouseMove(document, { clientX: 310, clientY: 40 });
    await waitFor(() => expect(handle).toHaveAttribute('aria-pressed', 'true'));
    fireEvent.mouseMove(document, { clientX: 900, clientY: 700 });
    fireEvent.mouseUp(document);

    await waitFor(() => expect(handle).not.toHaveAttribute('aria-pressed', 'true'));
    expect(moveBooking).not.toHaveBeenCalled();
    expect(tile('2026-12-30', 84).getByText('Driver')).toBeVisible();
    // dnd-kit removes its document-level click suppression 50ms after mouseup.
    await new Promise(resolve => setTimeout(resolve, 60));
  });
});
