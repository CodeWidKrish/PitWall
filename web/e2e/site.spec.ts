import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";

/** The data the site was built from, so the tests follow whatever race is next. */
const site = JSON.parse(readFileSync(join(__dirname, "..", "src", "data", "site.json"), "utf8")) as {
  next_race: { season: number; round: number; race_name: string; odds: { driver_id: string }[] } | null;
  drivers: Record<string, { name: string; code: string; last_name: string }>;
};
const race = site.next_race!;
const short = race.race_name.replace(/ Grand Prix.*$/, "");
const fav = site.drivers[race.odds[0].driver_id];

/** Wait until React has taken over the page, so clicks reach their handlers. */
async function hydrated(page: Page) {
  await page.waitForFunction(() => "__lenis" in window, null, { timeout: 30_000 });
}

/** Nothing on the page may be wider than the screen (no sideways scrolling on phones). */
async function noSidewaysScroll(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over, "page is wider than the screen").toBeLessThanOrEqual(0);
}

/** Errors in the browser console fail the test, except the 3D model being absent in CI. */
function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/glb|car model|WebGL|GPU stall|404/i.test(m.text())) errors.push(m.text());
  });
  return errors;
}

test.describe("home page", () => {
  test("shows the next race, the full grid of odds and no errors", async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(`Who wins`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(short, { ignoreCase: true });
    await expect(page.locator("#odds button[aria-expanded]")).toHaveCount(race.odds.length);
    await expect(page.locator("#live")).toBeAttached();
    await noSidewaysScroll(page);
    expect(errors).toEqual([]);
  });

  test("opening a driver's odds shows the inputs and a link to their page", async ({ page }) => {
    await page.goto("/#odds");
    const first = page.locator("#odds button[aria-expanded]").first();
    await first.scrollIntoViewIfNeeded();
    await first.click();
    await expect(first).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("link", { name: new RegExp(`${fav.last_name}.s full profile`) })).toBeVisible();
  });

  test("the podium game gives the odds of a locked-in call", async ({ page }) => {
    await page.goto("/#game");
    const chips = page.locator("#game [aria-label*='Press to place']");
    await chips.first().scrollIntoViewIfNeeded();
    for (const i of [0, 1, 2]) await chips.nth(i).click();
    await page.locator("#game button", { hasText: "Lock it in" }).click();
    await expect(page.locator("#game")).toContainText(/1 in\s*[\d.,]+/);
  });

  test("the scroll progress line and header stay within the screen while scrolling", async ({ page }) => {
    await page.goto("/");
    for (const y of [800, 3000, 9000]) {
      await page.evaluate((v) => window.scrollTo(0, v), y);
      await page.waitForTimeout(200);
      await noSidewaysScroll(page);
    }
  });
});

test.describe("pages", () => {
  for (const path of ["/methodology", "/privacy", "/credits", `/drivers/${race.odds[0].driver_id}`]) {
    test(`${path} loads and fits the screen`, async ({ page }) => {
      const errors = watchConsole(page);
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await noSidewaysScroll(page);
      expect(errors).toEqual([]);
    });
  }

  test("a driver page shows their odds and a share image", async ({ page, request }) => {
    const id = race.odds[0].driver_id;
    await page.goto(`/drivers/${id}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(fav.last_name, { ignoreCase: true });
    await expect(page.getByText(/Chance to win/)).toBeVisible();
    const og = await page.locator('meta[property="og:image"]').getAttribute("content");
    const img = await request.get(new URL(og!).pathname + new URL(og!).search);
    expect(img.headers()["content-type"]).toContain("image/png");
  });

  test("a shared podium call opens with its odds", async ({ page }) => {
    const picks = race.odds.slice(0, 3).map((o) => o.driver_id).join(",");
    await page.goto(`/call?r=${race.season}-${race.round}&p=${picks}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/1 in/);
    await expect(page.getByRole("link", { name: /Make your own call/ })).toBeVisible();
    await noSidewaysScroll(page);
  });
});

test.describe("api", () => {
  test("health reports fresh data", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.next_race.name).toBe(race.race_name);
    expect(typeof body.data_age_hours).toBe("number");
  });

  test("podium cards render, and invalid calls are refused", async ({ request }) => {
    const picks = race.odds.slice(0, 3).map((o) => o.driver_id).join(",");
    const ok = await request.get(`/api/card?r=${race.season}-${race.round}&p=${picks}`);
    expect(ok.headers()["content-type"]).toContain("image/png");
    const bad = await request.get("/api/card?p=a,b,c");
    expect(bad.status()).toBe(400);
  });

  test("the homepage has a share image", async ({ request }) => {
    const res = await request.get("/opengraph-image");
    expect(res.ok()).toBeTruthy();
    expect(res.headers()["content-type"]).toContain("image/png");
  });

  test("the alerts endpoint refuses sends without the secret", async ({ request }) => {
    const res = await request.post("/api/alerts/send");
    expect(res.status()).toBe(401);
  });
});

test.describe("interactions", () => {
  test("the pit wall chat shows an answer and the data it used", async ({ page }) => {
    // The model is not called in tests: the API answer is stubbed, the interface is real.
    await page.route("**/api/ask", (route) =>
      route.fulfill({ json: { answer: `${fav.name} is the favourite.\n- Best Elo in the field`, sources: [`${fav.name}`] } }),
    );
    await page.goto("/");
    await hydrated(page);
    // On phones the button steps aside over the opening race and while scrolling; it
    // comes back once you have scrolled past the hero and stopped.
    await page.evaluate(() => window.scrollTo(0, innerHeight * 1.5));
    const launch = page.getByRole("button", { name: "Ask the pit wall" });
    const panel = page.getByRole("dialog", { name: "Ask the pit wall" });
    await expect(async () => {
      await launch.click({ timeout: 2000 });
      await expect(panel).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 20_000 });
    await panel.getByRole("textbox", { name: "Your question" }).fill("Who is favourite?");
    await panel.getByRole("button", { name: "Send" }).click();
    await expect(panel).toContainText(`${fav.name} is the favourite.`);
    await expect(panel.getByRole("list", { name: "Data used" })).toContainText(fav.name);
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
  });

  test("the command palette finds a driver and opens their page", async ({ page, isMobile }) => {
    test.skip(isMobile, "the Search button is in the menu on phones");
    await page.goto("/");
    await hydrated(page);
    await page.getByRole("button", { name: /Search and jump/ }).click();
    const dialog = page.getByRole("dialog", { name: "Search and jump" });
    await expect(dialog).toBeVisible();
    const box = dialog.getByRole("combobox");
    await expect(box).toBeFocused();
    await box.fill(fav.code);
    // The highlighted result is the driver before Enter is pressed.
    await expect(dialog.getByRole("option", { selected: true })).toContainText(fav.name);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/drivers/${race.odds[0].driver_id}`));
  });
});
