import { test, expect } from '@playwright/test';

const password = 'Browser-test-password42';
const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const future = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
async function register(page, role, email, name) {
  await page.goto('/register');
  await page.getByRole('radio', { name: role === 'BUYER' ? /Buyer/ : /Supplier/ }).check();
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/rfqs$/);
}
async function login(page, email) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(/\/(rfqs|quotations)$/);
}
async function nav(page, label) {
  const toggle = page.getByRole('button', { name: 'Open navigation' });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole('navigation').getByRole('link', { name: label, exact: true }).click();
}
async function logout(page) {
  const toggle = page.getByRole('button', { name: 'Open navigation' });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
}
async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}

test('complete buyer and supplier workflows, responsive layout, persistence and deletion', async ({
  page,
  browser,
}, testInfo) => {
  const id = unique();
  const buyerEmail = `buyer-${id}@example.test`;
  const supplierEmail = `supplier-${id}@example.test`;
  const product = `Recycled packaging ${id}`;
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await register(page, 'BUYER', buyerEmail, 'Asha Mehta');
  await expect(page.getByText('Your first request starts here')).toBeVisible();
  await noOverflow(page);
  await page.getByRole('link', { name: 'Create RFQ', exact: true }).click();
  await page.getByRole('button', { name: 'Publish RFQ' }).click();
  await expect(page.getByText('Product or service name is required.')).toBeVisible();
  await page.getByLabel('Product or service name').fill(product);
  await page
    .getByLabel('Description', { exact: true })
    .fill('Recycled cardboard boxes, 20 × 20 cm. Quantity is in pieces.');
  await page.getByLabel('Quantity', { exact: true }).fill('500');
  await page.getByLabel('Quotation deadline (UTC)').fill(future);
  await page.getByLabel('Delivery location', { exact: true }).fill('Bengaluru');
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('create-rfq.png'), fullPage: true });
  await page.getByRole('button', { name: 'Publish RFQ' }).click();
  await expect(page.getByRole('heading', { name: product, exact: true })).toBeVisible();
  const detailUrl = page.url();
  await expect(page.getByText('Your next connection is on its way')).toBeVisible();
  await page.getByRole('link', { name: 'Edit request' }).click();
  await expect(page.getByLabel('Quantity', { exact: true })).toHaveValue('500.000');
  await page.getByLabel('Quantity', { exact: true }).fill('650');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Your request has been updated.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('definition').filter({ hasText: /^650$/ })).toBeVisible();

  const supplierContext = await browser.newContext({
    viewport: testInfo.project.use.viewport,
    isMobile: testInfo.project.use.isMobile,
    hasTouch: testInfo.project.use.hasTouch,
  });
  const supplierPage = await supplierContext.newPage();
  supplierPage.on('pageerror', (error) => errors.push(error.message));
  await register(supplierPage, 'SUPPLIER', supplierEmail, 'Dev Patel');
  await supplierPage.getByLabel('Keyword', { exact: true }).fill('no-matching-' + id);
  await supplierPage.getByRole('button', { name: 'Search RFQs' }).click();
  await expect(supplierPage.getByRole('heading', { name: 'No matching requests' })).toBeVisible();
  await supplierPage.getByLabel('Keyword', { exact: true }).fill(product);
  await supplierPage.getByLabel('Delivery location', { exact: true }).fill('London');
  await supplierPage.getByRole('button', { name: 'Search RFQs' }).click();
  await expect(supplierPage.getByRole('heading', { name: 'No matching requests' })).toBeVisible();
  await supplierPage.getByLabel('Delivery location', { exact: true }).fill('Bengaluru');
  await supplierPage.getByRole('button', { name: 'Search RFQs' }).click();
  await expect(supplierPage.getByRole('heading', { name: product, exact: true })).toBeVisible();
  await noOverflow(supplierPage);
  await supplierPage.screenshot({
    path: testInfo.outputPath('supplier-browse.png'),
    fullPage: true,
  });
  await supplierPage.getByRole('link', { name: 'View details', exact: true }).click();
  await expect(supplierPage.getByText('Asha Mehta', { exact: true })).toBeVisible();
  await supplierPage.getByRole('button', { name: 'Submit quotation' }).click();
  await expect(supplierPage.getByText('Estimated delivery time is required.')).toBeVisible();
  await supplierPage.getByLabel('Quoted price (USD)').fill('1250.50');
  await supplierPage.getByLabel('Estimated delivery time').fill('7 business days');
  await supplierPage
    .getByLabel('Message / notes (optional)')
    .fill('Delivery included. Recycled materials throughout.');
  await supplierPage.screenshot({
    path: testInfo.outputPath('quotation-form.png'),
    fullPage: true,
  });
  await noOverflow(supplierPage);
  await supplierPage.getByRole('button', { name: 'Submit quotation' }).click();
  await expect(supplierPage.getByText('Your quotation is submitted.')).toBeVisible();
  await supplierPage.reload();
  await expect(supplierPage.getByText('Your quotation is submitted.')).toBeVisible();
  await supplierPage.getByRole('link', { name: 'View my quotations' }).click();
  await expect(supplierPage.getByRole('heading', { name: product })).toBeVisible();
  await expect(supplierPage.getByText('$1,250.50', { exact: true })).toBeVisible();
  await noOverflow(supplierPage);
  await supplierPage.screenshot({
    path: testInfo.outputPath('quotation-history.png'),
    fullPage: true,
  });
  await logout(supplierPage);
  await login(supplierPage, supplierEmail);
  await nav(supplierPage, 'My quotations');
  await expect(supplierPage.getByRole('heading', { name: product })).toBeVisible();
  await page.goto(detailUrl);
  await expect(page.getByRole('heading', { name: 'Dev Patel' })).toBeVisible();
  await expect(page.getByText('$1,250.50', { exact: true })).toBeVisible();
  await expect(page.getByText('7 business days', { exact: true })).toBeVisible();
  await expect(page.getByText('Delivery included. Recycled materials throughout.')).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('buyer-quotations.png'), fullPage: true });
  await page.getByRole('button', { name: 'Delete request' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Keep RFQ' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Delete request' }).click();
  await page.getByRole('button', { name: 'Delete RFQ', exact: true }).click();
  await expect(page.getByText('Your first request starts here')).toBeVisible();
  await supplierPage.reload();
  await expect(supplierPage.getByText('Your first offer is an opportunity')).toBeVisible();
  await logout(page);
  await login(page, buyerEmail);
  await expect(page.getByText('Your first request starts here')).toBeVisible();
  expect(errors).toEqual([]);
  await supplierContext.close();
});

test('loading, empty, server error, retry and network failure states', async ({ page }) => {
  const id = unique();
  await register(page, 'BUYER', `states-${id}@example.test`, 'State Test');
  await page.route('**/api/rfqs/my', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 900));
    await route.continue();
  });
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: 'Loading requests' })).toBeVisible();
  await expect(page.getByText('Your first request starts here')).toBeVisible();
  await page.unroute('**/api/rfqs/my');
  await page.route('**/api/rfqs/my', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Temporary failure. Please retry.' }),
    }),
  );
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Temporary failure. Please retry.');
  await page.unroute('**/api/rfqs/my');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('Your first request starts here')).toBeVisible();
  await page.route('**/api/rfqs/my', (route) => route.abort());
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Unable to connect.');
  await noOverflow(page);
});

test('form failure retains values and disables submission while saving', async ({ page }) => {
  const id = unique();
  await register(page, 'BUYER', `form-${id}@example.test`, 'Form Test');
  await page.goto('/rfqs/new');
  await page.getByLabel('Product or service name').fill('Retained requirement');
  await page.getByLabel('Description', { exact: true }).fill('A detailed specification');
  await page.getByLabel('Quantity', { exact: true }).fill('2');
  await page.getByLabel('Quotation deadline (UTC)').fill(future);
  await page.getByLabel('Delivery location', { exact: true }).fill('Mumbai');
  await page.route('**/api/rfqs', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Could not save your request.' }),
    });
  });
  await page.getByRole('button', { name: 'Publish RFQ' }).click();
  await expect(page.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('Could not save your request.');
  await expect(page.getByLabel('Product or service name')).toHaveValue('Retained requirement');
  await expect(page.getByRole('button', { name: 'Publish RFQ' })).toBeEnabled();
});

test('login validation, incorrect credentials, and protected-route redirect', async ({
  page,
}, testInfo) => {
  await page.goto('/rfqs/new');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByText('Enter a valid email address.')).toBeVisible();
  await expect(page.getByText('Password is required.')).toBeVisible();
  await page.getByLabel('Email address').fill('unknown@example.test');
  await page.getByLabel('Password', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Email or password is incorrect.');
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('login.png'), fullPage: true });
});
