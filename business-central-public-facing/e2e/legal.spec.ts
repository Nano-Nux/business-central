import { expect, test } from "@playwright/test";

for (const [path, title] of [
  ["/privacy-policy", "Privacy Policy"],
  ["/terms-of-service", "Terms of Service"],
] as const) {
  test(`${title} is public, server rendered and readable without JavaScript`, async ({
    browser,
    request,
  }) => {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain(title);
    expect(html).toContain("nanonux808@gmail.com");
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:3211${path}`);
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: `test-results/legal${path}-mobile.png` });
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      new RegExp(`${path}$`),
    );
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
      "content",
      new RegExp(`${path}$`),
    );
    await expect(
      page.getByRole("navigation", { name: "On this page" }),
    ).toBeVisible();
    await page
      .getByRole("navigation", { name: "On this page" })
      .getByRole("link")
      .last()
      .click();
    await expect(
      page.getByRole("heading", { level: 2 }).last(),
    ).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("link", { name: "Back to website", exact: true }),
    ).toHaveAttribute("href", "/");
    await context.close();
  });
}

test("homepage exposes both policies and the sitemap includes their public URLs", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const legal = page.getByRole("navigation", { name: "Legal", exact: true });
  await legal
    .getByRole("link", { name: "Privacy Policy", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Privacy Policy", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Legal", exact: true })
    .getByRole("link", { name: "Terms of Service", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Terms of Service", exact: true }),
  ).toBeVisible();
  const sitemap = await request.get("/sitemap.xml");
  const xml = await sitemap.text();
  expect(xml).toContain("/privacy-policy</loc>");
  expect(xml).toContain("/terms-of-service</loc>");
});
