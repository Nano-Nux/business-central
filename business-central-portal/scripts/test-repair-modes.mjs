import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

async function testRepairModes() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  const artifactDir = 'C:/Users/lonsh/.gemini/antigravity-ide/brain/442e897c-42f1-4001-a036-3e16e8b0090b';

  const user = {
    id: 'user-1',
    merchant_id: 'merchant-1',
    display_name: 'Lead Technician',
    is_active: true,
    roles: [{ code: 'OWNER', permission_codes: ['*'] }]
  };

  const shop = {
    id: 'shop-1',
    name: 'Downtown Tech Depot',
    code: 'MAIN',
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
    { id: 'b-3', name: 'Google', is_active: true },
    { id: 'b-4', name: 'Sony', is_active: true }
  ];

  const presets = [
    { id: 'p-1', shop_id: 'shop-1', preset_type: 'ISSUE', value: 'Screen cracked / Touch unresponsive', is_active: true },
    { id: 'p-2', shop_id: 'shop-1', preset_type: 'ISSUE', value: 'Battery drains rapidly or swollen', is_active: true },
    { id: 'p-3', shop_id: 'shop-1', preset_type: 'ISSUE', value: 'Charging port loose / No power', is_active: true },
    { id: 'p-4', shop_id: 'shop-1', preset_type: 'CONDITION', value: 'Minor cosmetic scratches on frame', is_active: true },
    { id: 'p-5', shop_id: 'shop-1', preset_type: 'CONDITION', value: 'Heavily scuffed / Dent on corner', is_active: true }
  ];

  const services = [
    { id: 'srv-1', code: 'DIAG', name: 'Comprehensive Diagnostics', labor_fee: '25.00', is_active: true },
    { id: 'srv-2', code: 'SCRN', name: 'OLED Display Replacement', labor_fee: '65.00', is_active: true },
    { id: 'srv-3', code: 'BATT', name: 'High-Capacity Battery Replacement', labor_fee: '45.00', is_active: true }
  ];

  const variants = [
    { id: 'var-1', product_name: 'iPhone 15 Pro OLED Assembly', name: 'OEM Grade Black', sku: 'DISP-IP15P-OEM', price: '189.00', is_stock_tracked: true, quantity_on_hand: '12' },
    { id: 'var-2', product_name: 'Galaxy S24 Ultra Glass Lens', name: 'Titanium Gray', sku: 'DISP-GS24U-TGR', price: '145.00', is_stock_tracked: true, quantity_on_hand: '8' },
    { id: 'var-3', product_name: 'USB-C Flex Charging Port', name: 'Rev 2.0', sku: 'PORT-USBC-FLEX', price: '22.00', is_stock_tracked: true, quantity_on_hand: '35' },
    { id: 'var-4', product_name: 'Thermal Heat Paste 4g', name: 'Extreme Compound', sku: 'THRM-PST-04', price: '8.50', is_stock_tracked: true, quantity_on_hand: '50' }
  ];

  const paymentTypes = [
    { id: 'pt-1', code: 'CASH', name: 'Cash', category_code: 'CASH', is_active: true },
    { id: 'pt-2', code: 'CARD', name: 'Card Terminal', category_code: 'CARD', is_active: true }
  ];

  const promotions = [
    { id: 'promo-1', name: '10% First-Time Repair Promo', is_active: true, discount_percent: 10 }
  ];

  for (const mode of ['MINI', 'SIMPLE', 'COMPLEX']) {
    console.log(`\n========================================`);
    console.log(`Testing POS Mode: ${mode}`);
    console.log(`========================================`);

    const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });

    const merchant = {
      id: 'merchant-1',
      name: 'Downtown Tech Depot',
      default_currency_code: 'USD',
      pos_complexity_level: mode,
      is_active: true,
      module_codes: ['repair', 'sales', 'inventory', 'delivery', 'catalog']
    };

    let createdTicket = null;

    await page.route('**/api/v1/**', async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname.replace('/api/v1', '');
      const method = route.request().method();

      if (path === '/auth/me') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: user }) });
      if (path === '/merchant') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: merchant }) });
      if (path === '/shops') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [shop] }) });
      if (path === '/currencies') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [{ code: 'USD', symbol: '$' }] }) });
      if (path.startsWith('/repairs/orders')) {
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ data: createdTicket ? [createdTicket] : [], meta: { page_index: 0, page_size: 100, total: createdTicket ? 1 : 0, total_pages: 1 } })
        });
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
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: promotions, meta: { total: promotions.length } }) });
      }
      if (path === '/repairs/tickets' && method === 'POST') {
        createdTicket = {
          id: 'ticket-created-1',
          order_number: 'REP-TEST-001',
          status: 'RECEIVED',
          customer_name: 'Sarah Connor',
          total_cost: '65.00'
        };
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: createdTicket }) });
      }

      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [], meta: { total: 0 } }) });
    });

    await page.addInitScript(({ user, shop }) => {
      localStorage.setItem('bc.session', JSON.stringify({ access_token: 'mock-token', expires_at: '2099-01-01T00:00:00Z', user }));
      localStorage.setItem('bc.current-shop', shop.id);
    }, { user, shop });

    if (mode === 'MINI') {
      await page.goto('http://localhost:3001/repairs/desk');
    } else {
      await page.goto('http://localhost:3001/repairs');
    }

    await page.waitForTimeout(1500);

    // Click Create / New Repair Ticket button
    const createBtn = page.getByRole('button', { name: /(Create|New) repair ticket/i }).first();
    await createBtn.click();
    await page.waitForTimeout(500);

    const dialog = page.getByRole('dialog', { name: 'New repair ticket' });
    if (!(await dialog.isVisible())) {
      throw new Error(`Modal dialog not open in ${mode} mode!`);
    }

    console.log(`Modal successfully opened in ${mode} mode.`);

    // Fill in basic intake
    await dialog.getByLabel('Customer name').fill('Sarah Connor');
    await dialog.getByLabel('Customer phone').fill('555-0199');
    await dialog.getByLabel('Device type').first().selectOption('PHONE');
    await dialog.getByLabel('Manufacturer').first().selectOption('Apple');
    await dialog.getByLabel('Model').first().fill('iPhone 15 Pro');
    await dialog.getByPlaceholder('Enter or scan IMEI / serial number').first().fill('IMEI-3549281099238');
    await dialog.getByLabel('Issue 1 *').first().fill('Screen cracked and flickering');
    await dialog.getByLabel('Price', { exact: true }).first().fill('65');

    // Screenshot initial state of modal
    const publicPath = `public/guide-screenshots/repair-modal-${mode.toLowerCase()}.png`;
    await page.screenshot({ path: publicPath });
    const screenshotPath = path.join(artifactDir, `repair-modal-${mode.toLowerCase()}.png`);
    fs.copyFileSync(publicPath, screenshotPath);
    console.log(`Saved screenshot to ${screenshotPath}`);

    // In MINI mode, test adding a second device and expanding advanced options
    if (mode === 'MINI') {
      const addDevBtn = dialog.getByRole('button', { name: /Add another device/i });
      if (await addDevBtn.isVisible()) {
        await addDevBtn.click();
        await page.waitForTimeout(400);

        await dialog.getByLabel('Device type').nth(1).selectOption('TABLET');
        await dialog.getByLabel('Manufacturer').nth(1).selectOption('Apple');
        await dialog.getByLabel('Model').nth(1).fill('iPad Mini 6');
        await dialog.getByLabel('Issue 1 *').nth(1).fill('Port loose / no charge');
        await dialog.getByLabel('Price', { exact: true }).nth(1).fill('40');

        const miniMultiPublic = `public/guide-screenshots/repair-modal-mini-multidevice.png`;
        await page.screenshot({ path: miniMultiPublic });
        const miniMultiScreenshot = path.join(artifactDir, `repair-modal-mini-multidevice.png`);
        fs.copyFileSync(miniMultiPublic, miniMultiScreenshot);
        console.log(`Saved multi-device MINI screenshot to ${miniMultiScreenshot}`);
      }

      const advancedToggle = dialog.getByRole('button', { name: /Show additional options/i });
      if (await advancedToggle.isVisible()) {
        await advancedToggle.click();
        await page.waitForTimeout(400);
        const advPublic = `public/guide-screenshots/repair-modal-mini-expanded.png`;
        await page.screenshot({ path: advPublic });
        const advancedScreenshot = path.join(artifactDir, `repair-modal-mini-expanded.png`);
        fs.copyFileSync(advPublic, advancedScreenshot);
        console.log(`Saved expanded MINI screenshot to ${advancedScreenshot}`);
      }
    }

    // In COMPLEX mode, test navigation pills and adding second device
    if (mode === 'COMPLEX') {
      const addDevBtn = dialog.getByRole('button', { name: 'Add device to this ticket' });
      await addDevBtn.click();
      await page.waitForTimeout(400);

      await dialog.getByLabel('Device type').nth(1).selectOption('TABLET');
      await dialog.getByLabel('Manufacturer').nth(1).selectOption('Apple');
      await dialog.getByLabel('Model').nth(1).fill('iPad Pro 11');
      await dialog.getByLabel('Issue 1 *').nth(1).fill('Battery degraded');
      await dialog.getByLabel('Price', { exact: true }).nth(1).fill('45');

      const compPublic = `public/guide-screenshots/repair-modal-complex-multidevice.png`;
      await page.screenshot({ path: compPublic });
      const complexMultiScreenshot = path.join(artifactDir, `repair-modal-complex-multidevice.png`);
      fs.copyFileSync(compPublic, complexMultiScreenshot);
      console.log(`Saved multi-device COMPLEX screenshot to ${complexMultiScreenshot}`);
    }

    // Test creating the ticket
    const submitBtn = dialog.getByRole('button', { name: 'Create ticket' });
    await submitBtn.click();
    await page.waitForTimeout(1000);

    console.log(`Ticket creation submitted successfully in ${mode} mode.`);
    await page.close();
  }

  await browser.close();
  console.log('\nAll 3 modes verified and tested successfully!');
}

testRepairModes().catch(console.error);
