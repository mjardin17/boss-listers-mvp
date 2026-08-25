import { expect, test, type Locator, type Page } from "@playwright/test";

async function getDataRows(page: Page) {
  await expect(page.getByRole("table")).toBeVisible();
  return page.locator("tbody tr");
}

async function getNumericColumnValues(rows: Locator, columnIndex: number) {
  const count = await rows.count();
  const values: number[] = [];

  for (let index = 0; index < count; index += 1) {
    const rawText = await rows.nth(index).locator("td").nth(columnIndex).innerText();
    const value = Number(rawText.replace(/[^0-9.]/g, ""));
    values.push(value);
  }

  return values;
}

test.describe("Super Test: Niche Explorer", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/keyword-research/niches");
  });

  test("renders the dashboard shell, table, and mock niche data", async ({ page }) => {
    // Verifies the route renders its main heading and mock data table.
    await expect(
      page.getByRole("heading", { name: "Discover monetizable YouTube niches." })
    ).toBeVisible();
    await expect(page.getByText("Top Performing Niches")).toBeVisible();

    const rows = await getDataRows(page);
    await expect(rows).toHaveCount(15);
    await expect(page.getByRole("cell", { name: "AI Automation Blueprints" })).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "Faceless TikTok/Shorts Curation" })
    ).toBeVisible();
  });

  test("sorts by Opportunity Score and places the highest score first", async ({ page }) => {
    // Verifies column sorting by moving away from the default sort, then returning to score-desc.
    const rows = await getDataRows(page);

    await page.getByRole("button", { name: /Niche Name/i }).click();
    await expect(rows.first().locator("td").first()).toContainText(/AI Automation Blueprints/);

    await page.getByRole("button", { name: /Opportunity Score/i }).click();

    const scores = await getNumericColumnValues(rows, 5);
    const maxScore = Math.max(...scores);
    await expect(rows.first().locator("td").nth(5)).toContainText(String(maxScore));
    expect(scores[0]).toBe(maxScore);
  });

  test("tracks the first visible niche and updates button state", async ({ page }) => {
    // Verifies the track interaction updates the UI state after the Server Action resolves.
    const rows = await getDataRows(page);
    const firstRow = rows.first();
    const trackButton = firstRow.getByRole("button", { name: "Track Niche" });

    await trackButton.click();

    await expect(firstRow.getByRole("button", { name: "Tracked" })).toBeVisible();
    await expect(page.getByText("Unable to track niche.")).toHaveCount(0);
  });

  test("renders competition badge color classes for Low, Medium, and High", async ({ page }) => {
    // Verifies Tailwind class intent for each competition badge variant.
    await getDataRows(page);

    const lowBadge = page.locator("tbody tr", { hasText: "Low" }).first().getByText("Low");
    const mediumBadge = page.locator("tbody tr", { hasText: "Medium" }).first().getByText("Medium");
    const highBadge = page.locator("tbody tr", { hasText: "High" }).first().getByText("High");

    await expect(lowBadge).toHaveClass(/bg-emerald-400\/10/);
    await expect(lowBadge).toHaveClass(/text-emerald-200/);
    await expect(mediumBadge).toHaveClass(/bg-yellow-400\/10/);
    await expect(mediumBadge).toHaveClass(/text-yellow-100/);
    await expect(highBadge).toHaveClass(/bg-red-400\/10/);
    await expect(highBadge).toHaveClass(/text-red-200/);
  });
});
