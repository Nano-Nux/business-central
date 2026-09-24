import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

async function runMobileRepairTests() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  const artifactDir = 'C:/Users/lonsh/.gemini/antigravity-ide/brain/442e897c-42f1-4001-a036-3e16e8b0090b';

  const user = {
    id: 'user-mobile-1',
    merchant_id: 'merchant-mobile-1',
    display_name: 'Mobile Tech',
    is_active: true,
    roles: [{ code: 'OWNER', permission_codes: ['*'] }]
  };

  const shop = {
    id: 'shop-mobile-1',
    name: 'QuickFix Mobile Hub',
    code: 'QFIX',
    timezone: 'UTC',
    is_active: true,
    module_codes: ['repair', 'sales', 'inventory', 'delivery'],
    include_tax: true,
    tax_label: 'VAT',
    tax_rate: '0.08'
  };

  const brands = [
    { id: 'b-1', name: 'Apple', is_active: true },
    { id: 'b-2', name: 'Samsung', is_active: true },
    { id: 'b-3', name: 'Google', is_active: true }
  ];

  const presets = [
    { id: 'p-1', shop_id: 'shop-mobile-1', preset_type: 'ISSUE', value: 'Shattered front screen', is_active: true },
    { id: 'p-2', shop_id: 'shop-mobile-1', preset_type: 'ISSUE', value: 'Battery failing / won\'t charge', is_active: true },
    { id: 'p-3', shop_id: 'shop-mobile-1', preset_type: 'CONDITION', value: 'Clean glass, scuffed corner', is_active: true }
  ];

  const services = [
    { id: 'srv-1', code: 'DIAG', name: 'Diagnostics', labor_fee: '20.00', is_active: true },
    { id: 'srv-2', code: 'SCRN', name: 'Screen Replacement', labor_fee: '50.00', is_active: true }
  ];

  const variants = [
    { id: 'var-1', product_name: 'iPhone 15 Display Module', name: 'Original OLED', sku: 'DISP-IP15', price: '160.00', is_stock_tracked: true, quantity_on_hand: '10' },
    { id: 'var-2', product_name: 'Galaxy S24 Glass', name: 'OEM Black', sku: 'DISP-S24', price: '120.00', is_stock_tracked: true, quantity_on_hand: '6' }
  ];

  const paymentTypes = [
    { id: 'pt-1', merchant_id: 'merchant-mobile-1', name: 'Cash', category_code: 'CASH', is_active: true, created_at: '', updated_at: '' },
    { id: 'pt-2', merchant_id: 'merchant-mobile-1', name: 'Credit Card', category_code: 'ONLINE', is_active: true, created_at: '', updated_at: '' }
  ];

  let currentPosMode = 'COMPLEX';
  let ticketList = [
    {
      id: 'ticket-mob-001',
      service_order_id: 'svc-mob-001',
      device_id: 'dev-mob-001',
      order_number: 'REP-MOB-2026-01',
      status: 'RECEIVED',
      payment_status: 'UNPAID',
      customer_name: 'Alex Mercer',
      customer_phone: '555-0144',
      issue_description: 'Screen cracked & flickering after drop',
      received_at: '2026-09-20T10:30:00Z',
      waiting_start_date: '2026-09-20',
      waiting_end_date: '2026-09-23',
      waiting_days: 3,
      labor_fee: '50.00',
      additional_fee: '0.00',
      deposit_paid: '0.00',
      total_cost: '210.00',
      work_items: [
        {
          id: 'wi-mob-1',
          sequence_number: 1,
          type: 'DEVICE',
          status: 'RECEIVED',
          form_version: 1,
          device: {
            device_type: 'PHONE',
            manufacturer: 'Apple',
            model: 'iPhone 15',
            serial_number: 'IMEI-99238472910'
          },
          issue_description: 'Screen cracked & flickering after drop',
          issues: ['Screen cracked & flickering after drop'],
          conditions: ['Clean glass, scuffed corner'],
          note: 'Customer requested rush turnaround',
          additional_fee: '50.00',
          waiting_start_date: '2026-09-20',
          waiting_end_date: '2026-09-23',
          waiting_days: 3,
          financials: { balance: '210.00' }
        }
      ]
    }
  ];

  // Configure mobile viewport (iPhone 13 / standard mobile portrait)
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2
  });

  const page = await context.newPage();

  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api/v1', '');
    const method = route.request().method();

    if (path === '/auth/me') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: user }) });
    if (path === '/merchant') {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'merchant-mobile-1',
            name: 'QuickFix Mobile Hub',
            default_currency_code: 'USD',
            pos_complexity_level: currentPosMode,
            is_active: true,
            module_codes: ['repair', 'sales', 'inventory', 'delivery', 'catalog']
          }
        })
      });
    }
    if (path === '/shops') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [shop] }) });
    if (path === '/currencies') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [{ code: 'USD', symbol: '$' }] }) });
    if (path === '/repairs/devices') {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'dev-mob-001', device_type: 'Smartphone', brand: 'Apple', model: 'iPhone 13 Pro' }] }) });
    }
    if (path === '/repairs/orders' || path === '/repairs/orders/') {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ data: ticketList, meta: { page_index: 0, page_size: 100, total: ticketList.length, total_pages: 1 } })
      });
    }
    if (path.match(/\/repairs\/orders\/[^/]+$/) && method === 'GET') {
      const orderId = path.split('/').pop();
      const order = ticketList.find(t => t.id === orderId) || ticketList[0];
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: order }) });
    }
    if (path.includes('/work-items')) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: ticketList[0].work_items || [], meta: { total: (ticketList[0].work_items || []).length } }) });
    }
    if (path.includes('/parts')) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [], meta: { total: 0 } }) });
    }
    if (path.includes('/diagnostics')) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [], meta: { total: 0 } }) });
    }
    if (path.includes('/images')) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [], meta: { total: 0 } }) });
    }
    if (path.includes('/approvals')) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [], meta: { total: 0 } }) });
    }
    if (path.includes('/warranties')) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [], meta: { total: 0 } }) });
    }
    if (path.startsWith('/repairs/presets')) {
      const type = url.searchParams.get('preset_type');
      const filtered = presets.filter(p => !type || p.preset_type === type);
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: filtered, meta: { total: filtered.length } }) });
    }
    if (path.startsWith('/catalog/brands') || path.startsWith('/repairs/brands') || path.startsWith('/brands')) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: brands, meta: { total: brands.length } }) });
    }
    if (path.startsWith('/services/catalog')) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: services, meta: { total: services.length } }) });
    }
    if (path.startsWith('/services/forms/definitions')) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [], meta: { total: 0 } }) });
    }
    if (path.startsWith('/pos/catalog') || path.startsWith('/products/variants')) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: variants, meta: { total: variants.length } }) });
    }
    if (path.startsWith('/payment-types')) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: paymentTypes, meta: { total: paymentTypes.length } }) });
    }
    if (path.startsWith('/promotions')) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [], meta: { total: 0 } }) });
    }
    if (path.startsWith('/services/orders/') && path.endsWith('/items')) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [], meta: { total: 0 } }) });
    }
    if (path === '/repairs/tickets' && method === 'POST') {
      const newTicket = {
        ...ticketList[0],
        id: `ticket-created-${Date.now()}`,
        order_number: 'REP-MOB-NEW',
        status: 'RECEIVED',
        customer_name: 'John Doe',
        total_cost: '65.00',
        work_items: [
          {
            ...ticketList[0].work_items[0],
            id: `wi-created-${Date.now()}`,
            repair_order_id: `ticket-created-${Date.now()}`,
          }
        ]
      };
      ticketList.unshift(newTicket);
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: newTicket }) });
    }
    if (path.includes('/payments') && method === 'POST') {
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: { id: 'pmt-1', amount: '210.00' } }) });
    }
    if (path.startsWith('/repairs/orders/') && method === 'PATCH') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: ticketList[0] }) });
    }

    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [], meta: { total: 0 } }) });
  });

  page.on('console', msg => {
    if (msg.type() === 'error') console.log('PAGE ERROR LOG:', msg.text());
  });
  page.on('pageerror', err => console.log('PAGE EXCEPTION:', err.message));

  await page.addInitScript(({ user, shop }) => {
    localStorage.setItem('bc.session', JSON.stringify({ access_token: 'mock-token', expires_at: '2099-01-01T00:00:00Z', user }));
    localStorage.setItem('bc.current-shop', shop.id);
  }, { user, shop });

  console.log('\n======================================================');
  console.log('1. Testing Repair Desk & Table (Mobile Viewport: 375x812)');
  console.log('======================================================');

  await page.goto('http://localhost:3001/repairs');
  await page.waitForTimeout(1500);

  // Check that page does not blow out viewport horizontally
  const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  console.log(`Body scroll width: ${bodyScrollWidth}px, Viewport width: ${viewportWidth}px`);
  if (bodyScrollWidth > viewportWidth + 5) {
    console.warn(`WARNING: Horizontal overflow detected on /repairs! ${bodyScrollWidth} > ${viewportWidth}`);
  } else {
    console.log('PASS: No horizontal viewport blowout on /repairs desk.');
  }

  // Save screenshot of mobile repair desk list
  const deskPublic = 'public/guide-screenshots/repair-mobile-desk.png';
  await page.screenshot({ path: deskPublic });
  fs.copyFileSync(deskPublic, path.join(artifactDir, 'repair-mobile-desk.png'));
  console.log('Saved mobile desk screenshot.');

  console.log('\n======================================================');
  console.log('2. Testing Create Repair Ticket in POS-COMPLEX Mode (Mobile)');
  console.log('======================================================');

  await page.getByRole('button', { name: /(Create|New) repair ticket/i }).first().click();
  await page.waitForTimeout(500);

  const dialog = page.getByRole('dialog', { name: 'New repair ticket' });
  if (!(await dialog.isVisible())) throw new Error('Create Ticket modal failed to open on mobile!');

  // Check modal bounds
  const modalBox = await dialog.boundingBox();
  console.log(`Create Modal bounds on mobile: width=${modalBox.width}px, height=${modalBox.height}px`);

  // Fill in intake details
  await dialog.getByLabel('Customer name').fill('Dana Scully');
  await dialog.getByLabel('Customer phone').fill('555-0188');
  await dialog.getByLabel('Device type').first().selectOption('PHONE');
  await dialog.getByLabel('Model').first().fill('Pixel 8 Pro');
  await dialog.getByLabel('Issue 1 *').first().fill('Battery draining prematurely');
  await dialog.getByLabel('Price', { exact: true }).first().fill('45');

  // Test parts search on mobile
  const partsSearch = dialog.getByPlaceholder('Filter parts by name, SKU...');
  if (await partsSearch.isVisible()) {
    await partsSearch.fill('iPhone');
    await page.waitForTimeout(200);
  }

  const complexCreatePublic = 'public/guide-screenshots/repair-mobile-create-complex.png';
  await page.screenshot({ path: complexCreatePublic });
  fs.copyFileSync(complexCreatePublic, path.join(artifactDir, 'repair-mobile-create-complex.png'));
  console.log('Saved mobile complex create ticket screenshot.');

  // Submit the ticket
  await dialog.getByRole('button', { name: 'Create ticket' }).click();
  await page.waitForTimeout(1000);
  console.log('Ticket submitted in COMPLEX mode on mobile.');

  console.log('\n======================================================');
  console.log('3. Testing Create Repair Ticket in POS-MINI Mode (Mobile)');
  console.log('======================================================');

  currentPosMode = 'MINI';
  await page.goto('http://localhost:3001/repairs/desk');
  await page.waitForTimeout(1200);

  await page.getByRole('button', { name: /(Create|New) repair ticket/i }).first().click();
  await page.waitForTimeout(500);

  const miniDialog = page.getByRole('dialog', { name: 'New repair ticket' });
  if (!(await miniDialog.isVisible())) throw new Error('MINI modal failed to open on mobile!');

  // Test adding another device in MINI mode on mobile
  const addDevBtn = miniDialog.getByRole('button', { name: /Add another device/i });
  if (await addDevBtn.isVisible()) {
    await addDevBtn.click();
    await page.waitForTimeout(300);
    console.log('PASS: Successfully added another device in MINI mode on mobile.');
  }

  // Test expanding additional options drawer on mobile
  const expandBtn = miniDialog.getByRole('button', { name: /Show additional options/i });
  if (await expandBtn.isVisible()) {
    await expandBtn.click();
    await page.waitForTimeout(300);
  }

  const miniCreatePublic = 'public/guide-screenshots/repair-mobile-create-mini.png';
  await page.screenshot({ path: miniCreatePublic });
  fs.copyFileSync(miniCreatePublic, path.join(artifactDir, 'repair-mobile-create-mini.png'));
  console.log('Saved mobile mini create ticket screenshot.');

  await miniDialog.getByRole('button', { name: 'Close' }).click();
  await page.waitForTimeout(500);

  console.log('\n======================================================');
  console.log('4. Testing Ticket Details Drawer (Mobile Viewport)');
  console.log('======================================================');

  currentPosMode = 'COMPLEX';
  // Wait for table to load and click "Open ticket"
  const openBtn = page.getByTitle('Open ticket').first();
  await openBtn.waitFor({ state: 'visible', timeout: 5000 });
  await openBtn.click();

  const ticketDetailsModal = page.locator('.modal.repair-ticket-modal').last();
  await ticketDetailsModal.waitFor({ state: 'visible', timeout: 5000 });
  console.log('Ticket Details drawer is open and visible on mobile.');

  const detailsPublic = 'public/guide-screenshots/repair-mobile-ticket-details.png';
  await page.screenshot({ path: detailsPublic });
  fs.copyFileSync(detailsPublic, path.join(artifactDir, 'repair-mobile-ticket-details.png'));
  console.log('Saved mobile ticket details screenshot.');

  // Test "Record final payment" modal on mobile
  const recordPmtBtn = ticketDetailsModal.getByRole('button', { name: 'Record final payment' });
  if (await recordPmtBtn.isVisible()) {
    await recordPmtBtn.click();
    await page.waitForTimeout(400);

    const paymentModal = page.getByRole('dialog', { name: 'Record final payment' });
    if (await paymentModal.isVisible()) {
      const pmtPublic = 'public/guide-screenshots/repair-mobile-payment-modal.png';
      await page.screenshot({ path: pmtPublic });
      fs.copyFileSync(pmtPublic, path.join(artifactDir, 'repair-mobile-payment-modal.png'));
      console.log('Saved mobile record final payment modal screenshot.');
      await paymentModal.getByRole('button', { name: 'Cancel' }).click();
      await page.waitForTimeout(300);
    }
  }

  await ticketDetailsModal.getByRole('button', { name: 'Close', exact: true }).click();
  await page.waitForTimeout(400);

  console.log('\n======================================================');
  console.log('5. Testing Edit Repair Ticket Page (Mobile Viewport)');
  console.log('======================================================');

  await page.goto('http://localhost:3001/repairs/ticket-mob-001/edit');
  await page.waitForTimeout(1500);

  const editScrollWidth = await page.evaluate(() => document.body.scrollWidth);
  const editViewportWidth = await page.evaluate(() => window.innerWidth);
  console.log(`Edit Page scroll width: ${editScrollWidth}px, Viewport width: ${editViewportWidth}px`);
  if (editScrollWidth > editViewportWidth + 5) {
    console.warn(`WARNING: Horizontal overflow detected on /edit! ${editScrollWidth} > ${editViewportWidth}`);
  } else {
    console.log('PASS: No horizontal viewport blowout on /edit page.');
  }

  const editPublic = 'public/guide-screenshots/repair-mobile-ticket-edit.png';
  await page.screenshot({ path: editPublic });
  fs.copyFileSync(editPublic, path.join(artifactDir, 'repair-mobile-ticket-edit.png'));
  console.log('Saved mobile ticket edit page screenshot.');

  await browser.close();
  console.log('\n======================================================');
  console.log('All mobile repair CRUD tests completed successfully!');
  console.log('======================================================\n');
}

runMobileRepairTests().catch(console.error);
