import { test, expect } from '@playwright/test';
const future = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
async function register(page, role, name) {
  const response = await page.request.post('/api/auth/register', {
    data: {
      name,
      role,
      email: `feature-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`,
      password: 'Feature-browser-password42',
    },
  });
  expect(response.status()).toBe(201);
}
async function count(page, label, value) {
  const card = page
    .getByRole('region', { name: 'Dashboard summary' })
    .locator('.summary-card')
    .filter({ has: page.getByText(label, { exact: true }) });
  await expect(card.locator('dd')).toHaveText(String(value));
}
async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
test('status, live database summaries and multi-supplier comparison work together', async ({
  page,
  browser,
}, testInfo) => {
  await register(page, 'BUYER', 'Comparison Buyer');
  await page.goto('/rfqs');
  await count(page, 'Total RFQs', 0);
  await count(page, 'Quotations received', 0);
  const contexts = [];
  const suppliers = [];
  try {
    for (const name of ['Precision Industrial Supplies', 'Reliable Parts Company']) {
      const context = await browser.newContext({ ...testInfo.project.use });
      contexts.push(context);
      const supplier = await context.newPage();
      await register(supplier, 'SUPPLIER', name);
      suppliers.push(supplier);
    }
    const baseline = (await (await suppliers[0].request.get('/api/dashboard/summary')).json())
      .summary.availableRfqs;
    await page.getByRole('link', { name: 'Create RFQ', exact: true }).click();
    const product = `Comparison bearings ${Date.now()}`;
    await page.getByLabel('Product or service name').fill(product);
    await page
      .getByLabel('Description', { exact: true })
      .fill('Sealed bearings, quantity in pieces.');
    await page.getByLabel('Quantity', { exact: true }).fill('50');
    await page.getByLabel('Delivery location', { exact: true }).fill('Pune');
    await page.getByLabel('Quotation deadline (UTC)').fill(future);
    await page.getByRole('button', { name: 'Publish RFQ' }).click();
    await expect(page.getByRole('heading', { name: product })).toBeVisible();
    const detail = page.url();
    await expect(page.getByText('OPEN', { exact: true })).toBeVisible();
    await page.goto('/rfqs');
    await count(page, 'Total RFQs', 1);
    for (const [index, supplier] of suppliers.entries()) {
      await supplier.goto('/rfqs');
      await count(supplier, 'Available RFQs', baseline + 1);
      await count(supplier, 'My quotations', 0);
      await supplier.goto(detail);
      await expect(supplier.getByRole('button', { name: 'Close RFQ' })).toHaveCount(0);
      await supplier.getByLabel('Quoted price (USD)').fill(index ? '975.50' : '850');
      await supplier
        .getByLabel('Estimated delivery time')
        .fill(index ? '5 business days' : '10 business days');
      await supplier
        .getByLabel('Message / notes (optional)')
        .fill(
          index
            ? 'Express delivery included, subject to address confirmation.'
            : 'Standard shipping and protective packaging included.',
        );
      await supplier.getByRole('button', { name: 'Submit quotation' }).click();
      await expect(supplier.getByText('Your quotation is submitted.')).toBeVisible();
      await supplier.goto('/rfqs');
      await count(supplier, 'My quotations', 1);
    }
    await page.reload();
    await count(page, 'Quotations received', 2);
    await page.goto(detail);
    const comparison = page.getByRole('table', { name: 'Quotation comparison' });
    await expect(comparison.locator('tbody tr')).toHaveCount(2);
    for (const value of [
      'Precision Industrial Supplies',
      'Reliable Parts Company',
      '$850.00',
      '$975.50',
      '5 business days',
      '10 business days',
      'Standard shipping and protective packaging included.',
      'Express delivery included, subject to address confirmation.',
    ]) {
      await expect(comparison.getByText(value, { exact: true })).toBeVisible();
    }
    await noOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('comparison.png'), fullPage: true });
    await page.route('**/api/rfqs/*/status', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unable to close. Please retry.' }),
      });
    });
    await page.getByRole('button', { name: 'Close RFQ' }).click();
    await expect(page.getByRole('button', { name: 'Closing...' })).toBeDisabled();
    await expect(page.getByRole('alert')).toContainText('Unable to close. Please retry.');
    await expect(page.getByText('OPEN', { exact: true })).toBeVisible();
    await page.unroute('**/api/rfqs/*/status');
    await page.getByRole('button', { name: 'Close RFQ' }).click();
    await expect(page.getByText('CLOSED', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close RFQ' })).toHaveCount(0);
    await page.reload();
    await expect(page.getByText('CLOSED', { exact: true })).toBeVisible();
    await expect(comparison.locator('tbody tr')).toHaveCount(2);
    await page.goto('/rfqs');
    await count(page, 'Total RFQs', 1);
    await count(page, 'Quotations received', 2);
    for (const supplier of suppliers) {
      await supplier.goto('/rfqs');
      await count(supplier, 'Available RFQs', baseline);
      await count(supplier, 'My quotations', 1);
      await supplier.getByLabel('Keyword', { exact: true }).fill(product);
      await supplier.getByRole('button', { name: 'Search RFQs' }).click();
      await expect(supplier.getByRole('heading', { name: 'No matching requests' })).toBeVisible();
      await supplier.goto(detail);
      await expect(supplier.getByText('CLOSED', { exact: true })).toBeVisible();
      await expect(supplier.getByRole('button', { name: 'Submit quotation' })).toHaveCount(0);
      await expect(supplier.getByText('Your quotation is submitted.')).toBeVisible();
      await supplier.goto('/quotations');
      await expect(supplier.getByRole('heading', { name: product })).toBeVisible();
      await noOverflow(supplier);
    }
    await page.goto(detail);
    await page.getByRole('button', { name: 'Delete request' }).click();
    await page.getByRole('button', { name: 'Delete RFQ', exact: true }).click();
    await count(page, 'Total RFQs', 0);
    await count(page, 'Quotations received', 0);
    await suppliers[0].goto('/rfqs');
    await count(suppliers[0], 'My quotations', 0);
  } finally {
    for (const context of contexts) await context.close();
  }
});

test('dashboard summary handles loading, failure and retry without hiding RFQs', async ({
  page,
}) => {
  await register(page, 'BUYER', 'Summary States');
  await page.route('**/api/dashboard/summary', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Summary temporarily unavailable.' }),
    });
  });
  await page.goto('/rfqs');
  await expect(page.getByRole('status').filter({ hasText: 'Loading summary...' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Summary temporarily unavailable.');
  await expect(page.getByText('Your first request starts here')).toBeVisible();
  await page.unroute('**/api/dashboard/summary');
  await page.getByRole('button', { name: 'Try again' }).click();
  await count(page, 'Total RFQs', 0);
  await count(page, 'Quotations received', 0);
  await noOverflow(page);
});
