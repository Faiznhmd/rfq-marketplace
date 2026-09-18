import { test, expect } from '@playwright/test';
const password = 'Supplier-browser-password42';
const future = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
async function account(page, role, name) {
  const email = `supplier-features-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  expect(
    (
      await page.request.post('/api/auth/register', { data: { name, role, email, password } })
    ).status(),
  ).toBe(201);
  return email;
}
async function setup(page, browser, testInfo) {
  const context = await browser.newContext({ ...testInfo.project.use });
  const buyer = await context.newPage();
  await account(buyer, 'BUYER', 'Saved RFQ Buyer');
  const product = `Saved bearings ${Date.now()}`;
  const response = await buyer.request.post('/api/rfqs', {
    data: {
      productName: product,
      description: 'Steel bearings, quantity in pieces.',
      quantity: 50,
      deliveryLocation: 'Pune',
      deadline: future,
    },
  });
  expect(response.status()).toBe(201);
  const id = (await response.json()).rfq.id;
  await account(page, 'SUPPLIER', 'Supplier A');
  return { context, buyer, product, id };
}
async function browse(page, product) {
  await page.goto('/rfqs');
  await page.getByLabel('Keyword', { exact: true }).fill(product);
  await page.getByRole('button', { name: 'Search RFQs' }).click();
  await expect(page.getByRole('heading', { name: product, exact: true })).toBeVisible();
}
async function nav(page, name) {
  await expect(page.getByRole('link', { name: 'Sourcewell home' })).toBeVisible();
  const toggle = page.getByRole('button', { name: 'Open navigation' });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole('navigation').getByRole('link', { name, exact: true }).click();
}
async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
test('supplier saves, withdraws, retains history and cannot access another supplier records', async ({
  page,
  browser,
}, testInfo) => {
  const { context, buyer, product, id } = await setup(page, browser, testInfo);
  const otherContext = await browser.newContext({ ...testInfo.project.use });
  const other = await otherContext.newPage();
  try {
    await browse(page, product);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Saved', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.reload();
    await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
    await nav(page, 'Saved RFQs');
    await expect(page.getByRole('heading', { name: product })).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('saved-rfqs.png'), fullPage: true });
    await page.getByRole('link', { name: 'View details', exact: true }).click();
    await page.getByLabel('Quoted price (USD)').fill('850.50');
    await page.getByLabel('Estimated delivery time').fill('10 business days');
    await page
      .getByLabel('Message / notes (optional)')
      .fill('Protective packaging and delivery included.');
    await page.getByRole('button', { name: 'Submit quotation' }).click();
    await expect(page.getByText('Your quotation is submitted.')).toBeVisible();
    await buyer.goto(`/rfqs/${id}`);
    await expect(
      buyer
        .getByRole('table', { name: 'Quotation comparison' })
        .getByText('Supplier A', { exact: true }),
    ).toBeVisible();
    await nav(page, 'My quotations');
    await expect(page.getByText('ACTIVE', { exact: true })).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('active-quotation.png'), fullPage: true });
    const quotation = (await (await page.request.get('/api/quotations/my')).json()).quotations[0];
    await page.getByRole('button', { name: 'Withdraw quotation', exact: true }).click();
    await expect(page.getByText('WITHDRAWN', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Withdraw quotation', exact: true })).toHaveCount(
      0,
    );
    await page.reload();
    await expect(page.getByText('WITHDRAWN', { exact: true })).toBeVisible();
    await expect(page.getByText('$850.50', { exact: true })).toBeVisible();
    await noOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('withdrawn-quotation.png'), fullPage: true });
    await page.getByRole('link', { name: 'View request', exact: true }).click();
    await expect(page.getByText('Your quotation is withdrawn.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit quotation' })).toHaveCount(0);
    await buyer.reload();
    await expect(buyer.getByRole('table', { name: 'Quotation comparison' })).toHaveCount(0);
    await expect(buyer.getByText('Your next connection is on its way')).toBeVisible();
    await account(other, 'SUPPLIER', 'Supplier B');
    await other.goto('/saved-rfqs');
    await expect(other.getByText('No saved RFQs yet.')).toBeVisible();
    expect(
      (
        await other.request.patch(`/api/quotations/${quotation.id}/status`, {
          data: { status: 'WITHDRAWN' },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await buyer.request.patch(`/api/quotations/${quotation.id}/status`, {
          data: { status: 'WITHDRAWN' },
        })
      ).status(),
    ).toBe(403);
    expect((await buyer.request.put(`/api/rfqs/${id}/saved`, { data: {} })).status()).toBe(403);
    await buyer.goto('/saved-rfqs');
    await expect(buyer).toHaveURL(/\/rfqs$/);
    await page.goto('/saved-rfqs');
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(page.getByText('No saved RFQs yet.')).toBeVisible();
    await page.reload();
    await expect(page.getByText('No saved RFQs yet.')).toBeVisible();
    await browse(page, product);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
    expect(
      (
        await buyer.request.patch(`/api/rfqs/${id}/status`, { data: { status: 'CLOSED' } })
      ).status(),
    ).toBe(200);
    await page.goto('/saved-rfqs');
    await expect(page.getByText('CLOSED', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'View details', exact: true }).click();
    await expect(page.getByText('Your quotation is withdrawn.')).toBeVisible();
    await page.goto('/saved-rfqs');
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(page.getByText('No saved RFQs yet.')).toBeVisible();
  } finally {
    await buyer.request.delete(`/api/rfqs/${id}`, { data: {} });
    await context.close();
    await otherContext.close();
  }
});
test('save, remove, saved-list and withdrawal failures retain state and support retry', async ({
  page,
  browser,
}, testInfo) => {
  const { context, buyer, product, id } = await setup(page, browser, testInfo);
  const saved = `**/api/rfqs/${id}/saved`;
  const failure = async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Operation unavailable. Please retry.' }),
    });
  };
  try {
    await browse(page, product);
    await page.route(saved, failure);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Saving...', exact: true })).toBeDisabled();
    await expect(page.getByRole('alert')).toContainText('Operation unavailable. Please retry.');
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await page.unroute(saved);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
    await page.route('**/api/rfqs/saved', failure);
    await page.goto('/saved-rfqs');
    await expect(
      page.getByRole('status').filter({ hasText: 'Loading saved RFQs...' }),
    ).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('Operation unavailable. Please retry.');
    await page.unroute('**/api/rfqs/saved');
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { name: product })).toBeVisible();
    await page.route(saved, failure);
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Removing...', exact: true })).toBeDisabled();
    await expect(page.getByRole('alert')).toContainText('Operation unavailable. Please retry.');
    await expect(page.getByRole('heading', { name: product })).toBeVisible();
    await page.unroute(saved);
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(page.getByText('No saved RFQs yet.')).toBeVisible();
    expect(
      (
        await page.request.post(`/api/rfqs/${id}/quotations`, {
          data: { price: 150, deliveryTime: '3 days', message: '' },
        })
      ).status(),
    ).toBe(201);
    await page.goto('/quotations');
    await page.route('**/api/quotations/*/status', failure);
    await page.getByRole('button', { name: 'Withdraw quotation', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Withdrawing...', exact: true })).toBeDisabled();
    await expect(page.getByRole('alert')).toContainText('Operation unavailable. Please retry.');
    await expect(page.getByText('ACTIVE', { exact: true })).toBeVisible();
    await noOverflow(page);
    await page.unroute('**/api/quotations/*/status');
    await page.getByRole('button', { name: 'Withdraw quotation', exact: true }).click();
    await expect(page.getByText('WITHDRAWN', { exact: true })).toBeVisible();
  } finally {
    await buyer.request.delete(`/api/rfqs/${id}`, { data: {} });
    await context.close();
  }
});
