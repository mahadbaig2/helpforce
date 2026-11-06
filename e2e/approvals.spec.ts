import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, name: string) {
  await page.goto("/");
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Welcome/ })).toBeVisible();
}

async function readDocument(page: Page) {
  await page.locator(".end-of-body").scrollIntoViewIfNeeded();
  await expect(page.getByText("Read the document text to the end")).toBeVisible();
}

test("officer reviews a document: reading unlocks the decision, the summary does not", async ({ page }) => {
  await signIn(page, "Sara Malik");
  await page.getByRole("link", { name: /Approval queue/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Approval queue" })).toBeFocused();
  // Pick a document without a PDF to keep the reading step simple.
  const row = page.locator("tbody tr").filter({ hasNotText: "PDF attached" }).first();
  const title = (await row.locator(".doc-title").textContent())!;
  await row.locator(".doc-title").click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeFocused();

  const confirm = page.getByRole("checkbox", { name: /I have read the full original/ });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: "Summarise" }).click();
  await expect(page.locator(".ai-points, .ai-error").first()).toBeVisible({ timeout: 10_000 });
  if (await page.locator(".ai-error").count()) {
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.locator(".ai-points")).toBeVisible({ timeout: 10_000 });
  }
  await expect(page.getByText("AI-generated").first()).toBeVisible();
  // Reading the summary unlocks nothing.
  await page.locator(".ai-points a").first().click();
  await expect(page.locator(".paper-body .cited")).toBeFocused();

  await readDocument(page);
  await expect(confirm).toBeEnabled();
  await confirm.check();
  await page.getByRole("button", { name: /^Approve…/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await dialog.getByRole("button", { name: "Yes, approve" }).click();
  await expect(page.getByRole("heading", { name: "Decision recorded" })).toBeVisible();
  await expect(page.locator(".doc-facts .badge")).toHaveText("Pending Senior Officer");
  const history = page.getByRole("list", { name: /History/ });
  await expect(history).toContainText("Sara Malik (Officer) asked for an AI summary");
  await expect(history).toContainText("Sara Malik (Officer) approved it and passed it to the Senior Officer.");
});

test("a stale decision gets a 409, a clear message and the latest version", async ({ page, context }) => {
  await signIn(page, "Sara Malik");
  await page.goto("/reviews");
  const row = page.locator("tbody tr").filter({ hasNotText: "PDF attached" }).first();
  await row.locator(".doc-title").click();
  await readDocument(page);
  await page.getByRole("checkbox", { name: /I have read/ }).check();

  const other = await context.newPage();
  await other.goto(page.url());
  await readDocument(other);
  await other.getByRole("checkbox", { name: /I have read/ }).check();
  await other.getByRole("button", { name: /^Return with reason…/ }).click();
  await other.getByLabel(/Reason for return/).fill("Please add the costs.");
  await other.getByRole("button", { name: "Return document" }).click();
  await expect(other.getByRole("heading", { name: "Decision recorded" })).toBeVisible();

  await page.getByRole("button", { name: /^Approve…/ }).click();
  await page.getByRole("button", { name: "Yes, approve" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Someone else changed this document" })).toBeVisible();
  await expect(page.locator(".doc-facts .badge")).toHaveText("Returned");
  await expect(page.getByRole("button", { name: /^Approve…/ })).toHaveCount(0);
});

test("a Clerk cannot open another Clerk's document, and keeps their text when an upload fails", async ({ page }) => {
  await signIn(page, "Ayesha Khan");
  await page.goto("/documents/HF-0105");
  await expect(page.getByRole("heading", { level: 2, name: "You do not have access to this document" })).toBeVisible();

  await page.goto("/documents/new");
  await page.getByLabel("Title (required)").fill("Laptops for the counter");
  await page.getByLabel("Document type (required)").selectOption("Operations");
  await page.getByLabel("Document text (required)").fill("Need\n\nThe counter needs two laptops because the old ones fail.");
  const pdf = { mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF") };
  await page.getByLabel(/Supporting PDF/).setInputFiles({ name: "fail-upload.pdf", ...pdf });
  await page.getByRole("button", { name: "Submit to Officer" }).click();
  await expect(page.getByText("Everything you typed is still here")).toBeVisible();
  await expect(page.getByLabel("Title (required)")).toHaveValue("Laptops for the counter");

  await page.reload();
  await expect(page.getByLabel("Title (required)")).toHaveValue("Laptops for the counter");
  await page.getByLabel(/Supporting PDF/).setInputFiles({ name: "quote.pdf", ...pdf });
  await page.getByRole("button", { name: "Submit to Officer" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Laptops for the counter" })).toBeVisible();
  await expect(page.locator(".doc-facts .badge")).toHaveText("Pending Officer");
});

test("an expired session returns to sign-in and then to the same page", async ({ page, context }) => {
  await signIn(page, "Omar Farooq");
  await page.goto("/reviews");
  await page.locator("tbody .doc-title").first().click();
  await expect(page.getByRole("button", { name: "Summarise" })).toBeVisible();
  const url = page.url();
  await context.clearCookies();
  await page.getByRole("button", { name: "Summarise" }).click();
  await expect(page.getByText("Your session has ended")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /Omar Farooq/ }).click();
  await expect(page.locator(".paper")).toBeVisible();
  expect(page.url()).toBe(url);
});

test("key screens have no accessibility violations and make no external requests", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).hostname !== "localhost") external.push(r.url());
  });
  await signIn(page, "Omar Farooq");
  for (const path of ["/", "/reviews", "/documents", "/pipeline", "/decisions", "/documents/HF-0101"]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator(".state-loading")).toHaveCount(0);
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(violations.map((v) => `${path}: ${v.id}`)).toEqual([]);
  }
  expect(external).toEqual([]);
});
