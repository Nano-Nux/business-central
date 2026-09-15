import { chromium } from '@playwright/test';

async function testRender() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });

  const user = {
    id: 'user-1',
    merchant_id: 'merchant-1',
    display_name: 'Alexander Wright',
    is_active: true,
    roles: [{ code: 'OWNER', permission_codes: ['*'] }]
  };

  const merchant = {
    id: 'merchant-1',
    name: 'Tech Flagship Store',
    default_currency_code: 'USD',
    pos_complexity_level: 'SIMPLE',
    is_active: true,
    module_codes: ['repair', 'sales', 'inventory', 'delivery', 'catalog', 'reports']
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

    if (path.startsWith('/reports/sales-summary')) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            order_count: 48,
            item_quantity: '142',
            net_sales: '12850.00',
            gross_profit: '4320.00',
            gross_margin_percent: '33.6'
          }
        })
      });
    }

    if (path.startsWith('/reports/sales-by-day')) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            { day: '2026-09-08', net_sales: '1650.00' },
            { day: '2026-09-09', net_sales: '1820.00' },
            { day: '2026-09-10', net_sales: '1490.00' },
            { day: '2026-09-11', net_sales: '2100.00' },
            { day: '2026-09-12', net_sales: '2450.00' },
            { day: '2026-09-13', net_sales: '3200.00' },
            { day: '2026-09-14', net_sales: '2140.00' }
          ]
        })
      });
    }

    if (path.startsWith('/repairs/orders')) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: 'rep-1',
              ticket_number: 'REP-2026-0104',
              customer_name: 'Sarah Jenkins',
              customer_phone: '+1 555 234 5678',
              device_brand: 'Apple',
              device_model: 'MacBook Pro 16" M2',
              issue_description: 'Retina Display flickering & backlight failure',
              status: 'IN_PROGRESS',
              estimated_price: '380.00',
              created_at: new Date().toISOString()
            }
          ],
          meta: { total: 1 }
        })
      });
    }

    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [], meta: { total: 0 } }) });
  });

  await page.addInitScript(({ user, shop }) => {
    localStorage.setItem('bc.session', JSON.stringify({ access_token: 'mock-token', expires_at: '2099-01-01T00:00:00Z', user }));
    localStorage.setItem('bc.current-shop', shop.id);
  }, { user, shop });

  await page.goto('http://localhost:3001/dashboard');
  await page.waitForTimeout(2000);
  console.log('Dashboard title:', await page.title());
  console.log('Headings:', await page.locator('h1, h2, h3').allInnerTexts());
  console.log('Stat cards:', await page.locator('.stat-card, [class*="stat"]').allInnerTexts());

  await browser.close();
}

testRender().catch(console.error);
