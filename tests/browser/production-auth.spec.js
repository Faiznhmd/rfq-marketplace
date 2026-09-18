import { test, expect } from '@playwright/test';
import { createApp } from '../../server/app.js';
import { resolveAuthConfig } from '../../server/origin.js';
import { migrate } from '../../server/database.js';
import { openTestDatabase } from '../database.js';

// Model Render's HTTPS edge forwarding to an internal HTTP server. Every browser
// request is intercepted: this test never contacts or writes to the live service.
const origin = 'https://rfq-marketplace-1bu7.onrender.com';
let db, server, upstream;
test.beforeAll(async () => {
  db = await openTestDatabase();
  await migrate(db);
  const config = resolveAuthConfig({
    RENDER: 'true',
    RENDER_EXTERNAL_URL: origin,
    NODE_ENV: 'development',
  });
  const app = createApp(db, { ...config, serveClient: true });
  server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  upstream = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await db?.close();
});

test('production browser stores secure session, restores login on refresh and logs out', async ({
  page,
  context,
}) => {
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin)
      throw new Error('Unexpected request outside the isolated production origin.');
    const response = await route.fetch({
      url: upstream + url.pathname + url.search,
      headers: {
        ...(await request.allHeaders()),
        host: new URL(upstream).host,
        'x-forwarded-proto': 'https',
      },
      maxRedirects: 0,
    });
    await route.fulfill({ response });
  });
  const email = `production-${Date.now()}@example.test`;
  const password = 'Isolated-production-test-42';
  const initialMe = page.waitForResponse((response) => response.url().endsWith('/api/auth/me'));
  await page.goto(origin + '/register');
  expect((await initialMe).status()).toBe(401);
  await page.getByLabel('Full name').fill('Production Test Buyer');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  const registration = page.waitForResponse((response) =>
    response.url().endsWith('/api/auth/register'),
  );
  await page.getByRole('button', { name: 'Create account' }).click();
  expect((await registration).status()).toBe(201);
  await expect(page).toHaveURL(origin + '/rfqs');

  async function logout() {
    // URL changes can precede the lazy-loaded workspace header rendering.
    await expect(page.getByRole('link', { name: 'Sourcewell home' })).toBeVisible();
    const menu = page.getByRole('button', { name: 'Open navigation' });
    if (await menu.isVisible()) await menu.click();
    const response = page.waitForResponse((response) =>
      response.url().endsWith('/api/auth/logout'),
    );
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    expect((await response).status()).toBe(204);
    await expect(page).toHaveURL(origin + '/login');
  }
  await logout();
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  const loginResponse = page.waitForResponse((response) =>
    response.url().endsWith('/api/auth/login'),
  );
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  const login = await loginResponse;
  expect(login.status()).toBe(200);
  expect(await login.request().headerValue('origin')).toBe(origin);
  await expect(page).toHaveURL(origin + '/rfqs');
  const cookie = (await context.cookies(origin)).find(
    (cookie) => cookie.name === '__Host-rfq_session',
  );
  expect(Boolean(cookie)).toBe(true);
  expect(cookie.secure).toBe(true);
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.sameSite).toBe('Lax');
  expect(cookie.path).toBe('/');
  expect(cookie.domain).toBe(new URL(origin).hostname);
  expect(await page.evaluate(() => document.cookie.includes('__Host-rfq_session'))).toBe(false);
  const restored = page.waitForResponse((response) => response.url().endsWith('/api/auth/me'));
  await page.reload();
  expect((await restored).status()).toBe(200);
  await expect(page.getByText('Your first request starts here')).toBeVisible();
  await logout();
  expect(
    (await context.cookies(origin)).some((cookie) => cookie.name === '__Host-rfq_session'),
  ).toBe(false);
  expect(
    await page.evaluate(
      async () => (await fetch('/api/auth/me', { credentials: 'same-origin' })).status,
    ),
  ).toBe(401);
});
