import { chromium } from '@playwright/test';

async function testPosModes() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  const catalog = [
    {
      id: 'var-1',
      product_id: 'prod-1',
      product_name: 'Espresso Roast (Single Origin)',
      name: 'Whole Bean 250g',
      sku: 'ESP-ROAST-250',
      price: '14.50',
      barcode: '88012345001',
      quantity_on_hand: '45',
      images: []
    },
    {
      id: 'var-2',
      product_id: 'prod-2',
      product_name: 'Cold Brew Blend',
      name: '12oz Bottle',
      sku: 'CB-12OZ',
      price: '5.50',
      barcode: '88012345002',
      quantity_on_hand: '120',
      images: []
    },
    {
      id: 'var-3',
      product_id: 'prod-3',
      product_name: 'Artisan Sourdough Croissant',
      name: 'Fresh Daily',
      sku: 'BAK-CR-01',
      price: '4.75',
      barcode: '88012345003',
      quantity_on_hand: '30',
      images: []
    },
    {
      id: 'var-4',
      product_id: 'prod-4',
      product_name: 'Matcha Oat Latte',
      name: '16oz Iced',
      sku: 'BEV-MOL-16',
      price: '6.25',
      barcode: '88012345004',
      quantity_on_hand: '80',
      images: []
    },
    {
      id: 'var-5',
      product_id: 'prod-5',
      product_name: 'Stainless Steel Tumbler 500ml',
      name: 'Matte Charcoal',
      sku: 'ACC-TUMB-500',
      price: '28.00',
      barcode: '88012345005',
      quantity_on_hand: '22',
      images: []
    },
    {
      id: 'var-6',
      product_id: 'prod-6',
      product_name: 'Almond Biscotti (2-pack)',
      name: 'Classic Crunch',
      sku: 'BAK-BIS-02',
      price: '3.50',
      barcode: '88012345006',
      quantity_on_hand: '65',
      images: []
    }
  ];

  const paymentTypes = [
    { id: 'pt-1', code: 'CASH', name: 'Cash', category_code: 'CASH', is_active: true },
    { id: 'pt-2', code: 'CARD', name: 'Credit / Debit Card', category_code: 'CARD', is_active: true },
    { id: 'pt-3', code: 'TRANSFER', name: 'Bank Transfer / QR', category_code: 'BANK', is_active: true }
  ];

  for (const mode of ['MINI', 'SIMPLE', 'COMPLEX']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 2 });

    const user = {
      id: 'user-1',
      merchant_id: 'merchant-1',
      display_name: 'Alexander Wright',
      is_active: true,
      roles: [{ code: 'OWNER', permission_codes: ['*'] }]
    };

    const merchant = {
      id: 'merchant-1',
      name: 'Modern Flagship Store',
      default_currency_code: 'USD',
      pos_complexity_level: mode,
      is_active: true,
      module_codes: ['repair', 'sales', 'inventory', 'delivery', 'catalog']
    };

    const shop = {
      id: 'shop-1',
      name: 'Downtown Flagship',
      is_active: true,
      module_codes: ['repair', 'sales', 'inventory', 'delivery']
    };

    await page.route('**/api/v1/**', async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname.replace('/api/v1', '');

      if (path === '/auth/me') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: user }) });
      if (path === '/merchant') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: merchant }) });
      if (path === '/shops') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [shop] }) });
      if (path === '/currencies') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [{ code: 'USD', symbol: '$' }] }) });
      if (path.startsWith('/pos/catalog')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: catalog, meta: { total: catalog.length } }) });
      if (path.startsWith('/payment-types')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: paymentTypes, meta: { total: paymentTypes.length } }) });
      if (path.startsWith('/promotions')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'pr-1', name: 'Summer Special 10%', is_active: true }], meta: { total: 1 } }) });
      if (path.includes('/deliveries')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'del-1', name: 'Express Bike Dispatch', fee: '5.00' }] }) });

      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [], meta: { total: 0 } }) });
    });

    await page.addInitScript(({ user, shop }) => {
      localStorage.setItem('bc.session', JSON.stringify({ access_token: 'mock-token', expires_at: '2099-01-01T00:00:00Z', user }));
      localStorage.setItem('bc.current-shop', shop.id);
    }, { user, shop });

    await page.goto('http://localhost:3001/pos');
    await page.waitForTimeout(2000);

    // Add an item to the cart by clicking the first product card/button
    const firstItem = page.locator('button:has-text("Espresso Roast"), .pos-item-card, [class*="product-card"]').first();
    if (await firstItem.count() > 0) {
      await firstItem.click();
      await page.waitForTimeout(500);
    }

    const filename = `pos-${mode.toLowerCase()}.png`;
    console.log(`Rendered POS in ${mode} mode. Checking UI elements...`);
    await page.screenshot({ path: `public/guide-screenshots/${filename}` });
    await page.close();
  }

  await browser.close();
}

testPosModes().catch(console.error);
