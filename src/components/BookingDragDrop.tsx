import {
  createContext,
  useContext,
  useId,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Booking } from '@/types/booking';

export type BookingDestination = Pick<Booking, 'date' | 'spot_number'>;

interface DragPermissions {
  userId?: string;
  isAdmin: boolean;
  disabled: boolean;
  today: string;
}

const DragPermissionsContext = createContext<DragPermissions | null>(null);

const canMoveBooking = (booking: Booking, userId: string | undefined, isAdmin: boolean) =>
  Boolean(userId && (booking.user_id === userId || isAdmin));

const collisionDetection: CollisionDetection = args =>
  args.pointerCoordinates ? pointerWithin(args) : closestCenter(args);

const keyboardCoordinates: KeyboardCoordinateGetter = (event, { context, currentCoordinates }) => {
  const direction = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.code];
  if (!direction || !context.collisionRect) return;
  event.preventDefault();

  const targets = context.droppableContainers.getEnabled().sort((a, b) => {
    if (!a.node.current || !b.node.current) return 0;
    return a.node.current.compareDocumentPosition(b.node.current) & Node.DOCUMENT_POSITION_FOLLOWING
      ? -1
      : 1;
  });
  const currentIndex = targets.findIndex(target => target.id === context.over?.id);
  const target = targets[currentIndex + direction];
  const rect = target && context.droppableRects.get(target.id);
  if (!rect) return;

  return {
    x:
      currentCoordinates.x +
      rect.left +
      rect.width / 2 -
      (context.collisionRect.left + context.collisionRect.width / 2),
    y:
      currentCoordinates.y +
      rect.top +
      rect.height / 2 -
      (context.collisionRect.top + context.collisionRect.height / 2),
  };
};

interface BookingDragDropProps extends DragPermissions {
  className?: string;
  bookings: Booking[];
  onMove: (booking: Booking, destination: BookingDestination) => Promise<void>;
  children: ReactNode;
}

export function BookingDragDrop({
  bookings,
  userId,
  isAdmin,
  disabled,
  today,
  onMove,
  className,
  children,
}: BookingDragDropProps) {
  const [activeBookingId, setActiveBookingId] = useState<string | null>(null);
  const activeBooking = bookings.find(booking => booking.id === activeBookingId);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates })
  );

  return (
    <DragPermissionsContext.Provider value={{ userId, isAdmin, disabled, today }}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              'Press Space or Enter to pick up a booking. Use the arrow keys to choose a parking tile. Press Space or Enter to drop, or Escape to cancel.',
          },
          announcements: {
            onDragStart: () => 'Booking picked up. Choose a parking tile.',
            onDragOver: ({ over }) =>
              over
                ? `Parking spot ${over.data.current?.spot_number} on ${over.data.current?.date}.`
                : 'Not over a parking tile.',
            onDragEnd: ({ over }) =>
              over ? 'Booking dropped.' : 'Move cancelled. The booking has not changed.',
            onDragCancel: () => 'Move cancelled. The booking has not changed.',
          },
        }}
        onDragStart={({ active }) => {
          const booking = bookings.find(item => item.id === active.data.current?.bookingId);
          if (booking && !disabled && canMoveBooking(booking, userId, isAdmin)) {
            setActiveBookingId(booking.id);
          }
        }}
        onDragCancel={() => setActiveBookingId(null)}
        onDragEnd={async ({ active, over }) => {
          setActiveBookingId(null);
          const booking = bookings.find(item => item.id === active.data.current?.bookingId);
          const destination = over?.data.current;
          if (
            disabled ||
            !booking ||
            !canMoveBooking(booking, userId, isAdmin) ||
            typeof destination?.date !== 'string' ||
            typeof destination.spot_number !== 'number' ||
            destination.date < today ||
            ![84, 85].includes(destination.spot_number) ||
            (booking.date === destination.date && booking.spot_number === destination.spot_number)
          ) {
            return;
          }
          await onMove(booking, {
            date: destination.date,
            spot_number: destination.spot_number,
          });
        }}
      >
        <div className={className}>{children}</div>
        <DragOverlay dropAnimation={null}>
          {activeBooking && (
            <div className="bg-card text-card-foreground rounded-lg border p-3 shadow-xl">
              <p className="truncate text-sm font-semibold">{activeBooking.user_name}</p>
              <p className="text-muted-foreground text-xs">
                {activeBooking.start_time.slice(0, 5)}-{activeBooking.end_time.slice(0, 5)}
                {' | '}
                {activeBooking.vehicle_type === 'car' ? 'Car' : 'Motorcycle'}
              </p>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </DragPermissionsContext.Provider>
  );
}

interface DraggableBookingProps extends HTMLAttributes<HTMLDivElement> {
  booking: Booking;
}

export function DraggableBooking({
  booking,
  className,
  children,
  ...props
}: DraggableBookingProps) {
  const permissions = useContext(DragPermissionsContext);
  const id = useId();
  const canMove = permissions
    ? canMoveBooking(booking, permissions.userId, permissions.isAdmin)
    : false;
  const disabled = !canMove || permissions?.disabled;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id,
    data: { bookingId: booking.id },
    disabled,
  });

  return (
    <div
      {...props}
      ref={setNodeRef}
      className={cn(
        'relative',
        className,
        canMove && 'pl-7',
        canMove && !disabled && 'cursor-grab',
        isDragging && 'opacity-40'
      )}
      onMouseDown={event => {
        if (
          !disabled &&
          event.target instanceof Element &&
          !event.target.closest('button, a, input, [role="switch"]')
        ) {
          listeners?.onMouseDown?.(event);
        }
      }}
    >
      {canMove && (
        <button
          {...attributes}
          {...listeners}
          ref={setActivatorNodeRef}
          type="button"
          disabled={disabled}
          aria-label={`Move booking for ${booking.user_name}, ${booking.date}, spot ${booking.spot_number}, ${booking.start_time.slice(0, 5)}-${booking.end_time.slice(0, 5)}`}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute top-1/2 left-0.5 flex h-8 w-6 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded focus-visible:ring-2 focus-visible:outline-none active:cursor-grabbing disabled:cursor-wait disabled:opacity-50"
        >
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
      {children}
    </div>
  );
}

interface BookingDropTargetProps extends HTMLAttributes<HTMLDivElement> {
  date: string;
  spotNumber: number;
}

export function BookingDropTarget({
  date,
  spotNumber,
  className,
  children,
  ...props
}: BookingDropTargetProps) {
  const permissions = useContext(DragPermissionsContext);
  const id = useId();
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { date, spot_number: spotNumber },
    disabled: !permissions || permissions.disabled || date < permissions.today,
  });

  return (
    <div
      {...props}
      ref={setNodeRef}
      data-booking-drop-date={date}
      data-booking-drop-spot={spotNumber}
      className={cn(
        'rounded-xl',
        className,
        isOver && 'outline-primary outline-2 outline-offset-2'
      )}
    >
      {children}
    </div>
  );
}
