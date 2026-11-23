import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  CalendarIcon,
  Car,
  Bike,
  Clock,
  Sun,
  Sunset,
  Loader2,
  UserPlus,
  Pencil,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import type { Booking } from '@/types/booking';
import { addDays, format, startOfDay, startOfWeek } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useUserProfile } from '@/hooks/useUserProfile';
import { DURATION_PRESETS, type CreateBookingData, type Duration } from '@/services/bookingService';

export interface BookingDialogData extends CreateBookingData {
  dates?: string[];
}

interface BookingDialogWithValidationProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spotNumber: number;
  editingBooking?: Booking;
  onConfirm: (booking: BookingDialogData) => void | Promise<void>;
}

export const BookingDialogWithValidation = ({
  open,
  onOpenChange,
  spotNumber,
  editingBooking,
  onConfirm,
}: BookingDialogWithValidationProps) => {
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const isEditing = !!editingBooking;
  const defaultVehicle = (profile?.default_vehicle_type as 'car' | 'motorcycle' | null) ?? 'car';
  const defaultStartTime = profile?.default_start_time ?? DURATION_PRESETS.full.start_time;
  const defaultEndTime = profile?.default_end_time ?? DURATION_PRESETS.full.end_time;

  const [date, setDate] = useState<Date>();
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [duration, setDuration] = useState<Duration>('full');
  const [startTime, setStartTime] = useState(defaultStartTime);
  const [endTime, setEndTime] = useState(defaultEndTime);
  const [vehicleType, setVehicleType] = useState<'car' | 'motorcycle'>(defaultVehicle);
  const [isSmallCar, setIsSmallCar] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [behalfMode, setBehalfMode] = useState(false);
  const [behalfEmail, setBehalfEmail] = useState('');
  const today = startOfDay(new Date());
  const weekStart = date ? startOfWeek(date, { weekStartsOn: 1 }) : undefined;
  const weekDays = weekStart
    ? Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
    : [];

  useEffect(() => {
    if (!open) return;

    const initialDate = editingBooking
      ? new Date(editingBooking.date + 'T00:00:00')
      : startOfDay(new Date());
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initialize the selected week on dialog open
    setDate(initialDate);
    setSelectedDates(editingBooking ? [] : [format(initialDate, 'yyyy-MM-dd')]);
  }, [open, editingBooking]);

  // Loading profile defaults must not reset the selected booking days.
  useEffect(() => {
    if (!open) return;

    if (editingBooking) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVehicleType(editingBooking.vehicle_type as 'car' | 'motorcycle');
      setIsSmallCar(editingBooking.vehicle_type === 'car' && editingBooking.capacity === 2);

      setStartTime(editingBooking.start_time.slice(0, 5));

      setEndTime(editingBooking.end_time.slice(0, 5));
      const matchedPreset = (
        Object.entries(DURATION_PRESETS) as [Duration, { start_time: string; end_time: string }][]
      ).find(
        ([, p]) =>
          p.start_time === editingBooking.start_time.slice(0, 5) &&
          p.end_time === editingBooking.end_time.slice(0, 5)
      );

      setDuration(matchedPreset?.[0] ?? (editingBooking.duration as Duration));

      setBehalfMode(false);

      setBehalfEmail('');
      return;
    }

    setVehicleType(defaultVehicle);
    setIsSmallCar(false);

    setStartTime(defaultStartTime);

    setEndTime(defaultEndTime);
    // Infer the matching preset (or keep 'full' as fallback)
    const matchedPreset = (
      Object.entries(DURATION_PRESETS) as [Duration, { start_time: string; end_time: string }][]
    ).find(([, p]) => p.start_time === defaultStartTime && p.end_time === defaultEndTime);

    setDuration(matchedPreset?.[0] ?? 'full');
    setBehalfMode(false);
    setBehalfEmail('');
  }, [open, editingBooking, defaultVehicle, defaultStartTime, defaultEndTime]);

  const handleDurationChange = (value: Duration) => {
    setDuration(value);
    setStartTime(DURATION_PRESETS[value].start_time);
    setEndTime(DURATION_PRESETS[value].end_time);
  };

  const handleSubmit = async () => {
    if (!date) {
      toast.error('Please select a date');
      return;
    }

    const dates = isEditing ? [format(date, 'yyyy-MM-dd')] : [...selectedDates].sort();
    const [selectedDate] = dates;
    if (!selectedDate) {
      toast.error('Please select at least one day');
      return;
    }

    if (!user) {
      toast.error('You must be logged in to book');
      return;
    }

    if (endTime <= startTime) {
      toast.error('End time must be after start time');
      return;
    }

    if (behalfMode && !behalfEmail.trim()) {
      toast.error('Please enter the email of the user to book for');
      return;
    }

    setIsValidating(true);

    try {
      // All pre-validation passed — delegate conflict validation to the service via onConfirm
      await onConfirm({
        date: selectedDate,
        ...(!isEditing && { dates }),
        duration,
        start_time: startTime,
        end_time: endTime,
        vehicle_type: vehicleType,
        is_small_car: vehicleType === 'car' && isSmallCar,
        spot_number: spotNumber,
        ...(behalfMode && { behalfEmail: behalfEmail.trim() }),
      });

      // Reset form
      setDate(undefined);
      setSelectedDates([]);
      setStartTime(defaultStartTime);
      setEndTime(defaultEndTime);
      setDuration('full');
      setVehicleType(defaultVehicle);
      setIsSmallCar(false);
      setBehalfMode(false);
      setBehalfEmail('');
      onOpenChange(false);
    } catch (error) {
      console.error('Error validating booking:', error);
      toast.error('Failed to validate booking. Please try again.');
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={nextOpen => {
        if (!isValidating) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="bg-background flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden border-2 p-0 shadow-2xl sm:max-w-[500px]">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="gradient-primary flex h-8 w-8 items-center justify-center rounded-lg">
              {isEditing ? (
                <Pencil className="h-4 w-4 text-white" />
              ) : (
                <CalendarIcon className="h-4 w-4 text-white" />
              )}
            </div>
            {isEditing ? `Edit Booking — Spot ${spotNumber}` : `Book Spot ${spotNumber}`}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the details for this booking.'
              : "Fill in the details to reserve your parking spot. You can book multiple spots per day as long as the times don't overlap."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <fieldset
            disabled={isValidating}
            aria-label="Booking details"
            aria-busy={isValidating}
            className="min-w-0 space-y-6"
          >
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Select Date</Label>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'hover:border-primary/50 h-12 w-full justify-start border-2 text-left font-normal transition-all',
                      !date && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="text-primary mr-2 h-4 w-4" />
                    {date ? format(date, 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={d => {
                      setDate(d);
                      setSelectedDates(d ? [format(d, 'yyyy-MM-dd')] : []);
                      setCalendarOpen(false);
                    }}
                    disabled={day => day < today}
                    autoFocus
                    weekStartsOn={1}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              {!isEditing && date && (
                <div role="group" aria-label="Booking days" className="grid grid-cols-7 gap-1 pt-2">
                  {weekDays.map(day => {
                    const dateKey = format(day, 'yyyy-MM-dd');
                    const selected = selectedDates.includes(dateKey);
                    const label = format(day, 'EEEE, MMMM d, yyyy');

                    return (
                      <Button
                        key={dateKey}
                        type="button"
                        variant={selected ? 'default' : 'outline'}
                        className="aspect-square h-auto w-full max-w-10 justify-self-center rounded-full p-0 text-sm"
                        aria-label={label}
                        aria-pressed={selected}
                        title={label}
                        disabled={day < today}
                        onClick={() =>
                          setSelectedDates(previous =>
                            selected
                              ? previous.filter(value => value !== dateKey)
                              : [...previous, dateKey]
                          )
                        }
                      >
                        {format(day, 'EEEEE')}
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-semibold">Vehicle Type</Label>
              <RadioGroup
                value={vehicleType}
                onValueChange={v => {
                  setVehicleType(v as 'car' | 'motorcycle');
                  setIsSmallCar(false);
                }}
                className="grid grid-cols-2 gap-3"
              >
                <Label
                  htmlFor="car"
                  className={cn(
                    'flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 p-4 transition-all',
                    vehicleType === 'car'
                      ? 'border-primary bg-primary/10 shadow-primary/10 shadow-lg'
                      : 'border-border hover:border-primary/50 hover:bg-muted/50'
                  )}
                >
                  <RadioGroupItem value="car" id="car" className="hidden" />
                  <div className="flex flex-col items-center gap-2">
                    <Car
                      className={cn(
                        'h-8 w-8',
                        vehicleType === 'car' ? 'text-primary' : 'text-muted-foreground'
                      )}
                    />
                    <span className={cn('font-medium', vehicleType === 'car' && 'text-primary')}>
                      Car
                    </span>
                  </div>
                </Label>
                <Label
                  htmlFor="motorcycle"
                  className={cn(
                    'flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 p-4 transition-all',
                    vehicleType === 'motorcycle'
                      ? 'border-accent bg-accent/10 shadow-accent/10 shadow-lg'
                      : 'border-border hover:border-accent/50 hover:bg-muted/50'
                  )}
                >
                  <RadioGroupItem value="motorcycle" id="motorcycle" className="hidden" />
                  <div className="flex flex-col items-center gap-2">
                    <Bike
                      className={cn(
                        'h-8 w-8',
                        vehicleType === 'motorcycle' ? 'text-accent' : 'text-muted-foreground'
                      )}
                    />
                    <span
                      className={cn('font-medium', vehicleType === 'motorcycle' && 'text-accent')}
                    >
                      Motorcycle
                    </span>
                  </div>
                </Label>
              </RadioGroup>
              {vehicleType === 'car' && (
                <div className="bg-muted/50 flex items-center justify-between gap-2 rounded-lg p-3">
                  <Label
                    htmlFor="small-car"
                    className="text-xs font-medium whitespace-nowrap sm:text-sm"
                  >
                    Small car (room for 2 bikes)
                  </Label>
                  <Switch id="small-car" checked={isSmallCar} onCheckedChange={setIsSmallCar} />
                </div>
              )}
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-semibold">Duration Preset</Label>
              <RadioGroup
                value={duration}
                onValueChange={v => handleDurationChange(v as Duration)}
                className="space-y-2"
              >
                <div
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-all',
                    duration === 'full'
                      ? 'border-primary bg-primary/10 shadow-md'
                      : 'border-border hover:border-primary/50 hover:bg-muted/50'
                  )}
                >
                  <RadioGroupItem value="full" id="full" />
                  <Label htmlFor="full" className="flex flex-1 cursor-pointer items-center gap-3">
                    <Clock
                      className={cn(
                        'h-5 w-5',
                        duration === 'full' ? 'text-primary' : 'text-muted-foreground'
                      )}
                    />
                    <div>
                      <div className="font-medium">Full Day</div>
                      <div className="text-muted-foreground text-xs">
                        {DURATION_PRESETS.full.start_time} – {DURATION_PRESETS.full.end_time}
                      </div>
                    </div>
                  </Label>
                </div>
                <div
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-all',
                    duration === 'morning'
                      ? 'border-info bg-info/10 shadow-md'
                      : 'border-border hover:border-info/50 hover:bg-muted/50'
                  )}
                >
                  <RadioGroupItem value="morning" id="morning" />
                  <Label
                    htmlFor="morning"
                    className="flex flex-1 cursor-pointer items-center gap-3"
                  >
                    <Sun
                      className={cn(
                        'h-5 w-5',
                        duration === 'morning' ? 'text-info' : 'text-muted-foreground'
                      )}
                    />
                    <div>
                      <div className="font-medium">Morning</div>
                      <div className="text-muted-foreground text-xs">
                        {DURATION_PRESETS.morning.start_time} – {DURATION_PRESETS.morning.end_time}
                      </div>
                    </div>
                  </Label>
                </div>
                <div
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-all',
                    duration === 'afternoon'
                      ? 'border-warning bg-warning/10 shadow-md'
                      : 'border-border hover:border-warning/50 hover:bg-muted/50'
                  )}
                >
                  <RadioGroupItem value="afternoon" id="afternoon" />
                  <Label
                    htmlFor="afternoon"
                    className="flex flex-1 cursor-pointer items-center gap-3"
                  >
                    <Sunset
                      className={cn(
                        'h-5 w-5',
                        duration === 'afternoon' ? 'text-warning' : 'text-muted-foreground'
                      )}
                    />
                    <div>
                      <div className="font-medium">Afternoon</div>
                      <div className="text-muted-foreground text-xs">
                        {DURATION_PRESETS.afternoon.start_time} –{' '}
                        {DURATION_PRESETS.afternoon.end_time}
                      </div>
                    </div>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Custom time override */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">
                Time Range
                <span className="text-muted-foreground ml-1 text-xs font-normal">
                  (adjust if needed)
                </span>
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="start_time" className="text-muted-foreground text-xs">
                    Start
                  </Label>
                  <Input
                    id="start_time"
                    type="time"
                    value={startTime}
                    onChange={e => setStartTime(e.target.value)}
                    className="h-10"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="end_time" className="text-muted-foreground text-xs">
                    End
                  </Label>
                  <Input
                    id="end_time"
                    type="time"
                    value={endTime}
                    onChange={e => setEndTime(e.target.value)}
                    className="h-10"
                  />
                </div>
              </div>
            </div>

            {/* Book on behalf of another user — hidden in edit mode */}
            {!isEditing && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2 text-sm font-semibold">
                    <UserPlus className="h-4 w-4" />
                    Book for someone else
                  </Label>
                  <Switch checked={behalfMode} onCheckedChange={setBehalfMode} />
                </div>
                {behalfMode && (
                  <Input
                    type="email"
                    placeholder="colleague@lht.dlh.de"
                    value={behalfEmail}
                    onChange={e => setBehalfEmail(e.target.value)}
                    className="h-10"
                    autoFocus
                  />
                )}
              </div>
            )}
          </fieldset>
        </div>

        <div className="flex gap-3 border-t px-6 py-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-12 flex-1"
            disabled={isValidating}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            className="gradient-primary shadow-primary/30 hover:shadow-primary/50 h-12 flex-1 font-semibold text-white shadow-lg transition-all"
            disabled={isValidating}
          >
            {isValidating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {isEditing ? 'Updating...' : 'Booking...'}
              </>
            ) : isEditing ? (
              'Update Booking'
            ) : selectedDates.length > 1 ? (
              `Confirm ${selectedDates.length} Bookings`
            ) : (
              'Confirm Booking'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
