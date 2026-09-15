# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: products-ui.spec.ts >> Products page modern UI and responsiveness >> Mobile phone view renders beautiful responsive cards without horizontal overflow
- Location: e2e\products-ui.spec.ts:194:7

# Error details

```
Error: expect(received).toBeLessThanOrEqual(expected)

Expected: <= 0
Received:    3
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - button "Open Next.js Dev Tools" [ref=e7] [cursor=pointer]
  - alert [ref=e11]
  - generic [ref=e12]:
    - complementary [ref=e13]:
      - button "Close menu" [ref=e14] [cursor=pointer]
      - link "Business Central Merchant workspace" [ref=e17] [cursor=pointer]:
        - /url: /merchant/dashboard
        - generic [ref=e20]:
          - text: Business Central
          - generic [ref=e21]: Merchant workspace
      - generic "Selected shop" [ref=e22]:
        - generic [ref=e23]: DS
        - generic [ref=e24]:
          - generic [ref=e25]: Selected shop
          - strong [ref=e26]: Downtown Store
          - generic [ref=e27]: DT01
      - navigation [ref=e28]:
        - generic [ref=e29]:
          - paragraph [ref=e30]: Overview
          - link "Today" [ref=e31] [cursor=pointer]:
            - /url: /merchant/dashboard
          - link "Point of sale" [ref=e36] [cursor=pointer]:
            - /url: /pos
        - generic [ref=e42]:
          - paragraph [ref=e43]: Operations
          - link "Catalog" [ref=e44] [cursor=pointer]:
            - /url: /catalog
          - link "Variant attributes" [ref=e49] [cursor=pointer]:
            - /url: /catalog/attributes
          - link "Storage" [ref=e54] [cursor=pointer]:
            - /url: /storage
          - link "Stock in" [ref=e59] [cursor=pointer]:
            - /url: /stock-in
          - link "Stock barcodes" [ref=e64] [cursor=pointer]:
            - /url: /stock-assets
          - link "Stock history" [ref=e69] [cursor=pointer]:
            - /url: /stock-movements
          - link "Transaction history" [ref=e74] [cursor=pointer]:
            - /url: /transaction-history
          - link "Customers" [ref=e79] [cursor=pointer]:
            - /url: /customers
          - link "Deliveries" [ref=e84] [cursor=pointer]:
            - /url: /deliveries
        - generic [ref=e89]:
          - paragraph [ref=e90]: Insights
          - link "Invoices" [ref=e91] [cursor=pointer]:
            - /url: /invoices
          - link "Reports" [ref=e96] [cursor=pointer]:
            - /url: /reports
          - link "Promotions" [ref=e100] [cursor=pointer]:
            - /url: /promotions
        - generic [ref=e105]:
          - paragraph [ref=e106]: Manage
          - link "Staff accounts" [ref=e107] [cursor=pointer]:
            - /url: /accounts
          - link "Settings" [ref=e112] [cursor=pointer]:
            - /url: /settings
          - link "Quick guide" [ref=e117] [cursor=pointer]:
            - /url: /guide
      - link "? Need a hand? View the quick guide" [ref=e122] [cursor=pointer]:
        - /url: /guide
        - generic [ref=e123]: "?"
        - generic [ref=e124]:
          - strong [ref=e125]: Need a hand?
          - generic [ref=e126]: View the quick guide
    - generic [ref=e129]:
      - generic [ref=e130]:
        - button "Open menu" [ref=e131] [cursor=pointer]
        - status [ref=e134]:
          - generic [ref=e136]: Sync needs attention
          - button "Sync now" [ref=e137] [cursor=pointer]
        - group [ref=e138]:
          - generic "Sync issue" [ref=e139] [cursor=pointer]
        - link "Language setting" [ref=e140] [cursor=pointer]:
          - /url: /settings/language
          - generic [ref=e144]: EN
        - button "TM" [ref=e146] [cursor=pointer]
      - main [ref=e148]:
        - generic [ref=e149]:
          - generic [ref=e150]:
            - paragraph [ref=e151]: Catalog
            - heading "Products" [level=1] [ref=e152]
            - paragraph [ref=e153]: Manage product records and the variants that become sellable SKUs.
          - button "New product" [ref=e155] [cursor=pointer]
        - generic [ref=e159]:
          - article [ref=e160]:
            - generic [ref=e165]:
              - paragraph [ref=e166]: Total Products
              - strong [ref=e167]: "3"
              - generic [ref=e168]: 2 active in catalog
          - article [ref=e169]:
            - generic [ref=e173]:
              - paragraph [ref=e174]: Active vs Inactive
              - strong [ref=e175]: 2 / 1
              - generic [ref=e176]: Sellable in POS
          - article [ref=e177]:
            - generic [ref=e182]:
              - paragraph [ref=e183]: Physical & Services
              - strong [ref=e184]: 2 / 1
              - generic [ref=e185]: Catalog item types
          - article [ref=e186]:
            - generic [ref=e191]:
              - paragraph [ref=e192]: Catalog Coverage
              - strong [ref=e193]: 2 categories
              - generic [ref=e194]: 2 brands configured
        - generic [ref=e195]:
          - generic [ref=e196]:
            - generic [ref=e199]:
              - textbox "Search products or barcode…" [ref=e200]
              - button "Camera scanner" [ref=e201] [cursor=pointer]
              - button "Barcode scanner" [ref=e203] [cursor=pointer]
            - generic [ref=e205]:
              - combobox "Sort products" [ref=e207] [cursor=pointer]:
                - 'option "Name: A–Z" [selected]'
                - 'option "Name: Z–A"'
                - option "Sort by Type"
              - link "Prices" [ref=e208] [cursor=pointer]:
                - /url: /pricing
              - link "Variant attributes" [ref=e213] [cursor=pointer]:
                - /url: /catalog/attributes
          - tablist "Filter products" [ref=e218]:
            - tab "All products 3" [selected] [ref=e219] [cursor=pointer]:
              - generic [ref=e220]: All products
              - generic [ref=e221]: "3"
            - tab "Active 2" [ref=e222] [cursor=pointer]:
              - generic [ref=e223]: Active
              - generic [ref=e224]: "2"
            - tab "Inactive 1" [ref=e225] [cursor=pointer]:
              - generic [ref=e226]: Inactive
              - generic [ref=e227]: "1"
            - tab "Physical 2" [ref=e228] [cursor=pointer]:
              - generic [ref=e229]: Physical
              - generic [ref=e230]: "2"
            - tab "Services 1" [ref=e231] [cursor=pointer]:
              - generic [ref=e232]: Services
              - generic [ref=e233]: "1"
        - generic [ref=e235]:
          - generic [ref=e236]:
            - generic [ref=e237]:
              - generic [ref=e243]:
                - strong [ref=e244]: Archived Vintage Radio
                - generic [ref=e245]: Old model discontinued in previous quarter
              - generic [ref=e246]: Inactive
            - generic [ref=e248]:
              - generic [ref=e249]: Physical
              - generic [ref=e251]: ARC-0099
              - generic [ref=e257]: Sony
              - generic [ref=e258]: Electronics → Audio
            - generic [ref=e259]:
              - button "Variants" [ref=e260] [cursor=pointer]
              - generic [ref=e265]:
                - button "Edit Archived Vintage Radio" [ref=e266] [cursor=pointer]
                - button "Delete Archived Vintage Radio" [ref=e269] [cursor=pointer]
          - generic [ref=e272]:
            - generic [ref=e273]:
              - generic [ref=e279]:
                - strong [ref=e280]: Screen Repair & Replacement Service
                - generic [ref=e281]: Full OLED screen replacement with certified warranty
              - generic [ref=e282]: Active
            - generic [ref=e284]:
              - generic [ref=e285]: Service
              - generic [ref=e287]: SRV-SCR-001
              - generic [ref=e293]: Apple
              - generic [ref=e294]: Electronics
            - generic [ref=e295]:
              - button "Variants" [ref=e296] [cursor=pointer]
              - generic [ref=e301]:
                - button "Edit Screen Repair & Replacement Service" [ref=e302] [cursor=pointer]
                - button "Delete Screen Repair & Replacement Service" [ref=e305] [cursor=pointer]
          - generic [ref=e308]:
            - generic [ref=e309]:
              - generic [ref=e315]:
                - strong [ref=e316]: Wireless Noise Cancelling Headphones WH-1000XM5
                - generic [ref=e317]: Premium industry-leading noise canceling over-ear headphones
              - generic [ref=e318]: Active
            - generic [ref=e320]:
              - generic [ref=e321]: Physical
              - generic [ref=e323]: "4548736132566"
              - generic [ref=e329]: Sony
              - generic [ref=e330]: Electronics → Audio
            - generic [ref=e331]:
              - button "Variants" [ref=e332] [cursor=pointer]
              - generic [ref=e337]:
                - button "Edit Wireless Noise Cancelling Headphones WH-1000XM5" [ref=e338] [cursor=pointer]
                - button "Delete Wireless Noise Cancelling Headphones WH-1000XM5" [ref=e341] [cursor=pointer]
        - navigation "products pagination" [ref=e344]:
          - paragraph [ref=e345]:
            - text: Showing
            - strong [ref=e346]: 1–3
            - text: of
            - strong [ref=e347]: "3"
            - text: products
          - generic [ref=e348]:
            - button "Previous" [disabled] [ref=e349]
            - button "Go to page 1" [ref=e352] [cursor=pointer]: "1"
            - button "Next" [disabled] [ref=e353]
```

# Test source

```ts
  194 |   test("Mobile phone view renders beautiful responsive cards without horizontal overflow", async ({ page }) => {
  195 |     await page.setViewportSize({ width: 375, height: 812 });
  196 | 
  197 |     await page.route("**/api/v1/**", async (route) => {
  198 |       const url = new URL(route.request().url());
  199 |       const pathName = url.pathname.replace("/api/v1", "");
  200 | 
  201 |       if (pathName === "/auth/me") {
  202 |         return route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: user }) });
  203 |       }
  204 |       if (pathName === "/merchant") {
  205 |         return route.fulfill({
  206 |           contentType: "application/json",
  207 |           body: JSON.stringify({
  208 |             data: {
  209 |               id: merchantID,
  210 |               name: "Tech Hub Electronics",
  211 |               slug: "tech-hub",
  212 |               default_currency_code: "USD",
  213 |               timezone: "UTC",
  214 |               pos_complexity_level: "COMPLEX",
  215 |               is_active: true,
  216 |             },
  217 |           }),
  218 |         });
  219 |       }
  220 |       if (pathName === "/shops") {
  221 |         return route.fulfill({
  222 |           contentType: "application/json",
  223 |           body: JSON.stringify({
  224 |             data: [{ id: shopID, name: "Downtown Store", code: "DT01", is_active: true, module_codes: [] }],
  225 |           }),
  226 |         });
  227 |       }
  228 |       if (pathName === "/catalog/products") {
  229 |         return route.fulfill({
  230 |           contentType: "application/json",
  231 |           body: JSON.stringify({
  232 |             data: sampleProducts,
  233 |             meta: { page_index: 0, page_size: 100, total: sampleProducts.length, total_pages: 1 },
  234 |           }),
  235 |         });
  236 |       }
  237 |       if (pathName === "/catalog/categories") {
  238 |         return route.fulfill({
  239 |           contentType: "application/json",
  240 |           body: JSON.stringify({
  241 |             data: sampleCategories,
  242 |             meta: { page_index: 0, page_size: 200, total: sampleCategories.length, total_pages: 1 },
  243 |           }),
  244 |         });
  245 |       }
  246 |       if (pathName === "/catalog/brands") {
  247 |         return route.fulfill({
  248 |           contentType: "application/json",
  249 |           body: JSON.stringify({
  250 |             data: sampleBrands,
  251 |             meta: { page_index: 0, page_size: 200, total: sampleBrands.length, total_pages: 1 },
  252 |           }),
  253 |         });
  254 |       }
  255 |       if (pathName === "/catalog/attributes" || pathName === "/units") {
  256 |         return route.fulfill({
  257 |           contentType: "application/json",
  258 |           body: JSON.stringify({ data: [], meta: { page_index: 0, page_size: 100, total: 0, total_pages: 1 } }),
  259 |         });
  260 |       }
  261 |       return route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: [] }) });
  262 |     });
  263 | 
  264 |     await page.addInitScript(
  265 |       ({ testUser, selectedShopID }) => {
  266 |         localStorage.setItem(
  267 |           "bc.session",
  268 |           JSON.stringify({
  269 |             access_token: "test-token",
  270 |             refresh_token: "test-refresh",
  271 |             token_type: "Bearer",
  272 |             expires_at: "2099-01-01T00:00:00Z",
  273 |             user: testUser,
  274 |           }),
  275 |         );
  276 |         localStorage.setItem("bc.current-shop", selectedShopID);
  277 |       },
  278 |       { testUser: user, selectedShopID: shopID },
  279 |     );
  280 | 
  281 |     await page.goto("/products");
  282 |     await page.waitForLoadState("networkidle");
  283 | 
  284 |     // In mobile, desktop table should be hidden, mobile cards visible
  285 |     await expect(page.locator(".products-desktop-table")).toBeHidden();
  286 |     await expect(page.locator(".products-mobile-cards")).toBeVisible();
  287 |     await expect(page.locator(".product-mobile-card")).toHaveCount(3);
  288 | 
  289 |     // Verify no horizontal overflow
  290 |     const overflow = await page.evaluate(() => ({
  291 |       body: document.body.scrollWidth - document.documentElement.clientWidth,
  292 |       doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  293 |     }));
> 294 |     expect(overflow.body).toBeLessThanOrEqual(0);
      |                           ^ Error: expect(received).toBeLessThanOrEqual(expected)
  295 |     expect(overflow.doc).toBeLessThanOrEqual(0);
  296 | 
  297 |     // Screenshot mobile
  298 |     await page.screenshot({ path: path.join(artifactDir, "products_mobile.png"), fullPage: true });
  299 |   });
  300 | });
  301 | 
```