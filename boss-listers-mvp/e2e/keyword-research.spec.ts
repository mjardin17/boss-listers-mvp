import { expect, test } from "@playwright/test";

test.describe("Super Test: Keyword Research Dashboard", () => {
  test("researches a seed keyword and renders mock keyword metrics", async ({ page }) => {
    // Verifies the complete keyword research flow from seed input to populated result table.
    await page.goto("/keyword-research");

    await expect(
      page.getByRole("heading", { name: "Find low-competition video ideas." })
    ).toBeVisible();

    await page
      .getByPlaceholder("Enter a seed keyword, e.g. pickleball drills")
      .fill("ai automation");
    await page.getByRole("button", { name: "Research" }).click();

    const researchButton = page.getByRole("button", { name: "Research" });
    await expect(researchButton).not.toBeDisabled();

    const rows = page.locator("tbody tr");
    await expect(rows.first()).toBeVisible();
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThanOrEqual(10);
    expect(rowCount).toBeLessThanOrEqual(15);

    await expect(page.getByRole("columnheader", { name: /Magic Score/i })).toBeVisible();
    await expect(rows.first().locator("td").nth(0)).toContainText("ai automation");

    const magicScoreText = await rows.first().locator("td").nth(3).innerText();
    const magicScore = Number(magicScoreText.replace(/[^0-9]/g, ""));
    expect(magicScore).toBeGreaterThanOrEqual(1);
    expect(magicScore).toBeLessThanOrEqual(100);
  });
});
