import { chromium } from '@playwright/test';

async function testRefinedDashboard() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
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

  await page.evaluate(() => {
    const overlay = document.createElement('div');
    overlay.id = 'guide-annotation-layer';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '999999';
    document.body.appendChild(overlay);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.position = 'absolute';
    svg.style.inset = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.overflow = 'visible';
    svg.innerHTML = `
      <defs>
        <marker id="arrow-blue" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#2563eb" />
        </marker>
        <marker id="arrow-emerald" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#059669" />
        </marker>
        <marker id="arrow-purple" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#7c3aed" />
        </marker>
        <marker id="arrow-amber" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#d97706" />
        </marker>
      </defs>
    `;
    overlay.appendChild(svg);

    // Find actual elements
    const kpiRow = document.querySelector('.stats-grid, [class*="stats"], [class*="grid"]');
    const openPosBtn = Array.from(document.querySelectorAll('a, button')).find(el => el.textContent.includes('Open POS'));
    const salesCard = Array.from(document.querySelectorAll('.card, section, div')).find(el => {
      const h = el.querySelector('h2, h3');
      return h && h.textContent.includes('Sales rhythm');
    }) || document.querySelector('.card:has(h2)');
    const rightNowCard = Array.from(document.querySelectorAll('.card, section, div')).find(el => {
      const h = el.querySelector('h2, h3');
      return h && h.textContent.includes('Right now');
    });

    const items = [
      {
        num: 1,
        color: '#2563eb',
        bg: 'rgba(37,99,235,0.08)',
        border: '#2563eb',
        label: '1. Real-time KPI Metric Cards',
        el: kpiRow,
        badgePos: { x: 'left', y: 'top', offsetX: 16, offsetY: -16 }
      },
      {
        num: 2,
        color: '#059669',
        bg: 'rgba(5,150,105,0.08)',
        border: '#059669',
        label: '2. Quick Action POS Button',
        el: openPosBtn,
        badgePos: { x: 'left', y: 'bottom', offsetX: -80, offsetY: 22 }
      },
      {
        num: 3,
        color: '#7c3aed',
        bg: 'rgba(124,58,237,0.08)',
        border: '#7c3aed',
        label: '3. Live Sales Rhythm & Volume',
        el: salesCard,
        badgePos: { x: 'left', y: 'top', offsetX: 16, offsetY: -16 }
      },
      {
        num: 4,
        color: '#d97706',
        bg: 'rgba(217,119,6,0.08)',
        border: '#d97706',
        label: '4. Urgent Stock & Sync Alerts',
        el: rightNowCard,
        badgePos: { x: 'left', y: 'top', offsetX: 16, offsetY: -16 }
      }
    ];

    items.forEach(item => {
      if (!item.el) return;
      const rect = item.el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      // Draw box
      const box = document.createElement('div');
      box.style.position = 'absolute';
      box.style.top = `${rect.top - 4}px`;
      box.style.left = `${rect.left - 4}px`;
      box.style.width = `${rect.width + 8}px`;
      box.style.height = `${rect.height + 8}px`;
      box.style.border = `2.5px solid ${item.border}`;
      box.style.borderRadius = '12px';
      box.style.backgroundColor = item.bg;
      box.style.boxShadow = `0 0 0 4px ${item.border}26, 0 10px 25px -5px rgba(0,0,0,0.15)`;
      overlay.appendChild(box);

      // Compute badge position
      let badgeX = rect.left + item.badgePos.offsetX;
      let badgeY = item.badgePos.y === 'top' ? rect.top + item.badgePos.offsetY : rect.bottom + item.badgePos.offsetY;

      // Ensure inside viewport bounds
      badgeX = Math.max(16, Math.min(window.innerWidth - 300, badgeX));
      badgeY = Math.max(16, Math.min(window.innerHeight - 50, badgeY));

      const badge = document.createElement('div');
      badge.style.position = 'absolute';
      badge.style.top = `${badgeY}px`;
      badge.style.left = `${badgeX}px`;
      badge.style.display = 'flex';
      badge.style.alignItems = 'center';
      badge.style.gap = '8px';
      badge.style.background = '#0f172a';
      badge.style.border = `2px solid ${item.border}`;
      badge.style.borderRadius = '999px';
      badge.style.padding = '3px 14px 3px 4px';
      badge.style.boxShadow = '0 6px 18px rgba(0,0,0,0.3)';

      const circle = document.createElement('span');
      circle.style.width = '24px';
      circle.style.height = '24px';
      circle.style.borderRadius = '50%';
      circle.style.background = item.color;
      circle.style.color = '#ffffff';
      circle.style.display = 'inline-flex';
      circle.style.alignItems = 'center';
      circle.style.justifyContent = 'center';
      circle.style.fontWeight = '800';
      circle.style.fontSize = '13px';
      circle.innerText = item.num;

      const label = document.createElement('span');
      label.style.color = '#f8fafc';
      label.style.fontSize = '12.5px';
      label.style.fontWeight = '700';
      label.style.letterSpacing = '0.2px';
      label.innerText = item.label;

      badge.appendChild(circle);
      badge.appendChild(label);
      overlay.appendChild(badge);

      // Add small connecting arrow or line if badge is offset
      if (item.badgePos.y === 'bottom') {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', `${badgeX + 20}`);
        line.setAttribute('y1', `${badgeY}`);
        line.setAttribute('x2', `${rect.left + rect.width / 2}`);
        line.setAttribute('y2', `${rect.bottom + 4}`);
        line.setAttribute('stroke', item.border);
        line.setAttribute('stroke-width', '2');
        line.setAttribute('stroke-dasharray', '3 3');
        svg.appendChild(line);
      }
    });
  });

  await page.screenshot({ path: 'public/guide-screenshots/dashboard-overview.png' });
  await page.screenshot({ path: 'guide-screenshots/dashboard-overview.png' });
  console.log('Saved refined real dashboard screenshot!');

  await browser.close();
}

testRefinedDashboard().catch(console.error);
