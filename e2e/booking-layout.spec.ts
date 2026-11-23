import { expect, test, type Locator, type Page } from '@playwright/test';

test.use({ hasTouch: true });

const user = {
  id: 'driver',
  email: 'driver@example.com',
  aud: 'authenticated',
  app_metadata: {},
  user_metadata: { user_name: 'Alexandra Montgomery' },
  created_at: '2029-01-01T00:00:00Z',
};

const bookings = [
  {
    id: 'own-booking',
    user_id: user.id,
    user_name: user.user_metadata.user_name,
    date: '2030-01-02',
    spot_number: 84,
    duration: 'full',
    start_time: '09:00:00',
    end_time: '17:00:00',
    vehicle_type: 'car',
    capacity: 2,
    created_at: '2029-12-01T00:00:00Z',
  },
  {
    id: 'colleague-booking',
    user_id: 'colleague',
    user_name: 'Casey',
    date: '2030-01-02',
    spot_number: 84,
    duration: 'full',
    start_time: '09:00:00',
    end_time: '17:00:00',
    vehicle_type: 'motorcycle',
    capacity: 1,
    created_at: '2029-12-01T00:00:00Z',
  },
  {
    id: 'other-car',
    user_id: 'other-driver',
    user_name: 'Morgan Anderson',
    date: '2030-01-02',
    spot_number: 85,
    duration: 'full',
    start_time: '18:00:00',
    end_time: '22:00:00',
    vehicle_type: 'car',
    capacity: 2,
    created_at: '2029-12-01T00:00:00Z',
  },
];

async function openDashboard(page: Page, isAdmin: boolean) {
  let savedBookings = bookings.map(booking => ({ ...booking }));
  await page.clock.setFixedTime(new Date('2030-01-01T12:00:00'));
  await page.addInitScript(
    ({ session }) => {
      const getItem = Storage.prototype.getItem;
      Storage.prototype.getItem = function (key) {
        if (this === window.localStorage && /^sb-.*-auth-token$/.test(key)) {
          return JSON.stringify(session);
        }
        return getItem.call(this, key);
      };
    },
    {
      session: {
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkcml2ZXIifQ.c2lnbmF0dXJl',
        refresh_token: 'test-refresh-token',
        expires_in: 3600,
        expires_at: 4102444800,
        token_type: 'bearer',
        user,
      },
    }
  );
  await page.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': request.headers()['access-control-request-headers'] ?? '*',
      'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (url.pathname === '/rest/v1/bookings') {
      if (request.method() === 'DELETE') {
        const id = url.searchParams.get('id')?.replace(/^eq\./, '');
        if (!savedBookings.some(booking => booking.id === id)) {
          return route.fulfill({ status: 404, json: { message: 'Not found' }, headers });
        }
        savedBookings = savedBookings.filter(booking => booking.id !== id);
        return route.fulfill({ status: 204, headers });
      }
      if (request.method() === 'PATCH') {
        const id = url.searchParams.get('id')?.replace(/^eq\./, '');
        const booking = savedBookings.find(item => item.id === id);
        if (!booking)
          return route.fulfill({ status: 404, json: { message: 'Not found' }, headers });
        Object.assign(booking, request.postDataJSON());
        return route.fulfill({ json: booking, headers });
      }
      return route.fulfill({ json: savedBookings, headers });
    }
    if (url.pathname === '/rest/v1/user_profiles') {
      return route.fulfill({ json: { id: user.id, is_admin: isAdmin }, headers });
    }
    if (url.pathname.startsWith('/auth/v1/')) return route.fulfill({ json: user, headers });
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) return route.abort();
    return route.continue();
  });
  await page.goto('/');
  await page.addStyleTag({
    content: '*, *::before, *::after { animation: none !important; transition: none !important; }',
  });
}

async function expectSingleLine(row: Locator, name: string, controls: Locator[]) {
  const nameLabel = row.getByText(name, { exact: true });
  const handle = row.getByRole('button', { name: /^Move booking for/ });
  const items = [
    ...((await handle.count()) ? [handle] : []),
    row.locator('svg.lucide-car, svg.lucide-bike'),
    nameLabel,
    ...controls,
  ];
  await row.scrollIntoViewIfNeeded();
  const rowBox = await row.boundingBox();
  const boxes = await Promise.all(
    items.map(async item => {
      await expect(item).toBeVisible();
      const box = await item.boundingBox();
      if (!box) throw new Error('Booking row item has no bounding box');
      return box;
    })
  );
  if (!rowBox) throw new Error('Booking row has no bounding box');

  const nameBox = boxes[items.indexOf(nameLabel)];
  expect(nameBox.width).toBeGreaterThanOrEqual(24);
  const centerY = nameBox.y + nameBox.height / 2;
  for (const [index, box] of boxes.entries()) {
    expect(Math.abs(box.y + box.height / 2 - centerY)).toBeLessThan(3);
    expect(box.x).toBeGreaterThanOrEqual(rowBox.x);
    expect(box.x + box.width).toBeLessThanOrEqual(rowBox.x + rowBox.width + 0.5);
    if (index > 0) {
      expect(box.x).toBeGreaterThanOrEqual(boxes[index - 1].x + boxes[index - 1].width - 0.5);
    }
  }
}

test('keeps upcoming bookings on one line across viewport widths', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await openDashboard(page, false);
  const section = page.locator('section').filter({
    has: page.getByRole('heading', { name: /All Upcoming Bookings/ }),
  });
  const ownRow = section
    .getByRole('button', { name: /Move booking for Alexandra Montgomery,/ })
    .locator('..');
  const colleagueRow = section.getByText('Casey', { exact: true }).locator('xpath=../../..');

  for (const width of [320, 360, 375, 414, 639, 640, 768, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await expectSingleLine(ownRow, 'Alexandra Montgomery', [
      ownRow.getByRole('button', { name: 'Small car (2/4 capacity)' }),
      ownRow.getByText('You', { exact: true }),
      ownRow.getByText('09:00–17:00', { exact: true }),
      ownRow.getByRole('button', { name: /Edit/ }),
      ownRow.getByRole('button', { name: /Cancel/ }),
    ]);
    await expectSingleLine(colleagueRow, 'Casey', [
      colleagueRow.getByText('09:00–17:00', { exact: true }),
    ]);
  }
});

test("keeps another user's booking on one line for admins", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await openDashboard(page, true);
  const row = page.getByRole('button', { name: /Move booking for Morgan Anderson,/ }).locator('..');

  await expectSingleLine(row, 'Morgan Anderson', [
    row.getByRole('button', { name: 'Small car (2/4 capacity)' }),
    row.getByText('18:00–22:00', { exact: true }),
    row.getByRole('button', { name: /Edit/ }),
    row.getByRole('button', { name: /Cancel/ }),
  ]);
});

test('gives mobile tiles balanced padding and room between bookings', async ({ page }) => {
  await openDashboard(page, false);
  const tile = page.locator(
    'section [data-booking-drop-date="2030-01-02"][data-booking-drop-spot="84"]'
  );

  for (const width of [320, 375, 414]) {
    await page.setViewportSize({ width, height: 900 });
    await tile.scrollIntoViewIfNeeded();
    const spacing = await tile.evaluate(element => {
      const content = element.firstElementChild!;
      const date = content.children[0].getBoundingClientRect();
      const heading = content.children[1].getBoundingClientRect();
      const rows = content.children[2].children;
      const firstRow = rows[0].getBoundingClientRect();
      const secondRow = rows[1].getBoundingClientRect();
      const tileRect = element.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      const tileStyle = getComputedStyle(element);
      const rowStyle = getComputedStyle(rows[0]);
      return {
        top: contentRect.top - tileRect.top - parseFloat(tileStyle.borderTopWidth),
        bottom: tileRect.bottom - contentRect.bottom - parseFloat(tileStyle.borderBottomWidth),
        left: parseFloat(tileStyle.paddingLeft),
        right: parseFloat(tileStyle.paddingRight),
        headerGap: firstRow.top - Math.max(date.bottom, heading.bottom),
        bookingGap: secondRow.top - firstRow.bottom,
        rowTop: parseFloat(rowStyle.paddingTop),
        rowBottom: parseFloat(rowStyle.paddingBottom),
        elementGap: parseFloat(getComputedStyle(rows[0].lastElementChild!).columnGap),
      };
    });

    expect(spacing.top).toBeGreaterThanOrEqual(16);
    expect(Math.abs(spacing.top - spacing.bottom)).toBeLessThan(1);
    expect(spacing.headerGap).toBeGreaterThanOrEqual(12);
    expect(spacing.bookingGap).toBeGreaterThanOrEqual(8);
    expect(spacing.rowTop).toBeGreaterThanOrEqual(8);
    expect(spacing.rowBottom).toBe(spacing.rowTop);
    if (width >= 360) {
      expect(spacing.left).toBeGreaterThanOrEqual(16);
      expect(spacing.right).toBe(spacing.left);
      expect(spacing.elementGap).toBeGreaterThanOrEqual(4);
    }
  }
});

test('keeps mobile editing and cancellation usable', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await openDashboard(page, false);
  const row = page
    .getByRole('button', { name: /Move booking for Alexandra Montgomery,/ })
    .locator('..');

  await row.getByRole('button', { name: 'Edit' }).click();
  const dialog = page.getByRole('dialog', { name: /Edit Booking — Spot 84/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  const cancellation = page.waitForRequest(
    request =>
      request.method() === 'DELETE' && new URL(request.url()).pathname === '/rest/v1/bookings'
  );
  await row.getByRole('button', { name: 'Cancel' }).click();
  expect(new URL((await cancellation).url()).searchParams.get('id')).toBe('eq.own-booking');
  await expect(row).toHaveCount(0);
});

test('still moves a booking by holding and dragging the mobile handle', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await openDashboard(page, false);
  const section = page.locator('section').filter({
    has: page.getByRole('heading', { name: /All Upcoming Bookings/ }),
  });
  const handle = section.getByRole('button', { name: /Move booking for Alexandra Montgomery,/ });
  const destination = section.locator(
    '[data-booking-drop-date="2030-01-02"][data-booking-drop-spot="85"]'
  );
  await destination.scrollIntoViewIfNeeded();
  const handleBox = await handle.boundingBox();
  const destinationBox = await destination.boundingBox();
  if (!handleBox || !destinationBox) throw new Error('Missing drag source or destination');

  const touch = await page.context().newCDPSession(page);
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: handleBox.x + handleBox.width / 2, y: handleBox.y + handleBox.height / 2 }],
  });
  await expect(handle).toHaveAttribute('aria-pressed', 'true');
  const move = page.waitForRequest(
    request =>
      request.method() === 'PATCH' && new URL(request.url()).pathname === '/rest/v1/bookings'
  );
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      {
        x: destinationBox.x + destinationBox.width / 2,
        y: destinationBox.y + destinationBox.height / 2,
      },
    ],
  });
  await expect(destination).toHaveClass(/outline-2/);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  expect((await move).postDataJSON()).toEqual({ date: '2030-01-02', spot_number: 85 });
  await expect(destination.getByText('Alexandra Montgomery', { exact: true })).toBeVisible();
});
