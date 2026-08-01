import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BookingService, type CreateBookingData } from '@/services/bookingService';

interface UpdateBookingParams extends Pick<
  CreateBookingData,
  'date' | 'duration' | 'start_time' | 'end_time' | 'vehicle_type'
> {
  bookingId: string;
}

export function useUpdateBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ bookingId, ...data }: UpdateBookingParams) => {
      const result = await BookingService.updateBooking(bookingId, data);
      if (!result.success) {
        throw new Error(result.error ?? 'Failed to update booking');
      }
      return result.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
}
