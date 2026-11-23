# Copilot Instructions

## Git

Do not stage or commit changes. The user reviews and commits all changes themselves.

## Supabase CLI

**NEVER run any `supabase` CLI commands** (e.g. `supabase db push`, `supabase start`, `supabase migration`, etc.). The user runs all Supabase CLI commands themselves.

## Documentation

Always keep documentation up to date when making code changes:

- Update `README.md` if you change the tech stack, add/remove features, modify commands, or change environment variables
- Update `supabase/migrations/` descriptions in the README Database Setup section when adding new migrations
- Update `.github/copilot-instructions.md` if you change architectural patterns, conventions, or tooling

## Commands

CI and release builds use Node.js 26 and pnpm 10.

```bash
pnpm dev                  # Start dev server (http://localhost:5173)
pnpm build                # Production build
pnpm lint                 # ESLint
pnpm lint:fix             # ESLint with auto-fix
pnpm format               # Prettier write
pnpm test                 # Vitest (watch mode)
pnpm test -- --run        # Vitest single run (used in CI)
pnpm test:coverage        # Coverage report
pnpm test:e2e             # Playwright E2E
pnpm test:e2e:debug       # Playwright with debugger

# Run a single unit test file
pnpm test -- src/test/bookingService.test.ts --run

# Run a single E2E test file
pnpm test:e2e -- e2e/auth.spec.ts
```

## Architecture

React 18 + TypeScript SPA backed by Supabase (PostgreSQL + Auth + Realtime). No custom backend — all data logic runs through the Supabase client and DB functions/triggers.

### Layers

```
src/pages/         → Route-level components (Index, Statistics, Auth, NotFound)
src/components/    → Feature components + src/components/ui/ (shadcn/ui, never edit directly)
src/hooks/         → React Query data hooks (one hook per data domain)
src/services/      → Business logic: BookingService, AuthService
src/integrations/supabase/  → Generated types (types.ts) + client setup (client.ts)
src/lib/           → env validation, error messages, password validation, cn() utility
src/types/         → Thin domain type aliases over generated Supabase types
supabase/migrations/        → All DB schema, RLS, triggers, functions
```

### Data flow

Components call **React Query hooks** → hooks call **service layer** → services call **Supabase client** directly.

- `useCreateBooking` / `useDeleteBooking` → `BookingService.createBooking` / `cancelBooking`
- `useBookings`, `useParkingSpots`, `useStatistics` → direct Supabase queries in hooks
- After mutations, hooks invalidate `['bookings']` query key to trigger refetches
- Bulk creation submits each selected date through `useCreateBooking().mutateAsync`, catches failures per date, and continues. Editing always updates one booking.
- Booking drag-and-drop uses `@dnd-kit/core` through `BookingDragDrop`. Move requests send only `date` and `spot_number` through `useUpdateBooking`; the dashboard shows the pending position and restores it on failure. Await query invalidation before clearing the pending position. Drags require ownership or admin access; existing RLS and database triggers enforce permissions and conflicts.
- Sort upcoming booking tiles by date, then spot number (84 before 85). Sort bookings within each tile by start time, then end time.
- Theme preference is managed by `src/components/ThemeProvider.tsx` and `src/hooks/useTheme.ts`. Preserve the `park-it-easy-theme` local storage key and resolve system preference through `matchMedia` without injecting inline scripts.

### Key pages

| Page             | Purpose                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| `Index.tsx`      | Main dashboard: parking spot grid, active bookings list, booking dialog |
| `Statistics.tsx` | Analytics with tabs: Overview, My Profile, Team, Trends                 |
| `Auth.tsx`       | Login / sign-up / password reset (single page, tab-switched)            |

## Key Conventions

### Supabase types

Always use generated types from `src/integrations/supabase/types.ts`:

```ts
import type { Tables, TablesInsert, Enums } from '@/integrations/supabase/types';
type Booking = Tables<'bookings'>;
type NewBooking = TablesInsert<'bookings'>;
```

Domain aliases in `src/types/` are thin wrappers — prefer using them over raw generated types in components.

### Supabase client

```ts
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
```

`isSupabaseConfigured` is false when env vars are missing (e.g., in Dependabot PR E2E runs). The client falls back to a safe mock. Check this before making calls when outside the service layer.

### React Query patterns

- Query keys follow the pattern `['bookings']`, `['parkingSpots']`, `['statistics', userId]`
- Mutations live in dedicated hooks (`useCreateBooking`, `useDeleteBooking`) and call `queryClient.invalidateQueries` on success
- Components never call `supabase` directly for mutations — always go through the hook/service layer

### Form handling

- Controlled `useState` + manual validation + `toast` for errors (not react-hook-form in most places)
- Zod schemas are used in `src/lib/` for validation logic and inferred TS types
- Date fields are prefilled in `useEffect` on dialog open (see `BookingDialogWithValidation.tsx`)

### Error handling

Map Supabase/Postgres errors through `src/lib/errorMessages.ts` before showing them to users. Never surface raw Postgres error codes in the UI.

### Environment variables

Validated at startup via Zod in `src/lib/env.ts`. All vars are prefixed `VITE_`:

```
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_SUPABASE_PROJECT_ID
VITE_ALLOWED_EMAIL_DOMAIN   # restricts sign-ups (default: @lht.dlh.de)
```

### Styling

- Tailwind CSS with shadcn/ui components in `src/components/ui/` — do not modify these directly, extend via `classNames` props or wrapper components
- Use `cn()` from `src/lib/utils.ts` for conditional class merging

### Database migrations

New migrations go in `supabase/migrations/` with the filename format `YYYYMMDDHHMMSS_description.sql`. Apply to the remote project with:

```bash
supabase db push
```

Booking conflict and capacity rules are enforced both in `BookingService` (app layer) **and** via DB triggers — keep both in sync when changing booking logic.

#### Migrations that UPDATE the `bookings` table

The `bookings_future_date` check constraint (`CHECK (date >= CURRENT_DATE)`) causes `UPDATE` statements to fail for past-dated rows, even when the `date` column itself is not being changed (PostgreSQL re-evaluates all constraints on every touched row).

Always wrap backfill `UPDATE`s on `bookings` with a drop/restore of this constraint:

```sql
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_future_date;

-- ... your UPDATE ...

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_future_date CHECK (date >= CURRENT_DATE) NOT VALID;
-- NOT VALID = enforced on new rows only, not retroactively on past-dated rows
```

### Testing

- Unit tests mock `src/integrations/supabase/client` — import the mock via `vi.mock('@/integrations/supabase/client')`
- DOM globals (`matchMedia`, `IntersectionObserver`) are mocked in `src/test/setup.ts`
- Booking business rule tests live in `src/test/booking.test.ts` and `bookingService.test.ts` — update these when changing conflict/capacity logic
