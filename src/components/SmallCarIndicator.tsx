import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export const SmallCarIndicator = ({ availableMotorcycles }: { availableMotorcycles?: number }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button
        type="button"
        aria-label="Small car (2/4 capacity)"
        className="bg-primary/10 text-primary focus-visible:ring-ring shrink-0 rounded px-1 py-0.5 text-[10px] font-medium whitespace-nowrap focus-visible:ring-2 focus-visible:outline-none sm:px-1.5"
      >
        Small<span className="hidden sm:inline"> car</span>
      </button>
    </TooltipTrigger>
    <TooltipContent className="max-w-60">
      Small car (2/4 capacity).{' '}
      {availableMotorcycles === undefined
        ? 'Room for up to 2 motorcycles.'
        : `Room for ${availableMotorcycles} more ${availableMotorcycles === 1 ? 'motorcycle' : 'motorcycles'} during this booking.`}
    </TooltipContent>
  </Tooltip>
);
