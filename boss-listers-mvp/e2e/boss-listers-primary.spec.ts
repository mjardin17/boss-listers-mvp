import { expect, test } from "@playwright/test";

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

test.describe("Boss Listers primary workflow", () => {
  test("collects listing inputs, analyzes an upload, and renders a review decision without fake comps", async ({ page }) => {
    await page.route("**/api/scan", async (route) => {
      const request = route.request();
      const body = request.postData() || "";
      expect(body).toContain("manualSoldCompPrice");
      expect(body).toContain("packagingCost");
      expect(body).toContain("marketplace");

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          scanStatus: {
            usedVision: true,
            visionAttempted: true,
            fallbackActivated: false,
            warning: ""
          },
          listing: {
            itemTitle: "Mattel Demo Action Figure",
            thumbnailUrl: "",
            sellThroughRate: "Unavailable",
            averageSalePrice: 50,
            profitPotential: 14.25,
            demandLevel: "Review",
            sourcingTip: "REVIEW: No authorized sold-comps feed is configured for this scan.",
            confidenceScore: 72,
            brand: "Mattel",
            category: "Toys & Collectibles",
            upc: "887961123456",
            visibleText: "Mattel Demo Action Figure",
            searchQuery: "887961123456 Mattel Demo Action Figure sold",
            estimatedResalePrice: 50,
            averageSoldPrice: 50,
            lowestSold: null,
            highestSold: null,
            soldCount: 0,
            marketData: {
              walmartPrice: null,
              walmartTitle: "",
              soldCount: 0,
              lowestSold: null,
              averageSold: null,
              highestSold: null,
              confidence: 0
            },
            estimatedShippingCost: 6,
            platformFees: 6.5,
            estimatedProfit: 14.25,
            roiPercentage: 57,
            breakEven: 36.5,
            recommendation: "REVIEW",
            recommendationExplanation: "REVIEW: No authorized sold-comps feed is configured for this scan.",
            marketDataUnavailable: true,
            sourceBadges: ["Vision", "Market data unavailable"],
            trustedCompSummary: {
              acceptedComps: 0,
              rejectedComps: 0,
              averageSoldPrice: null,
              soldCount: 0,
              soldCount90d: 0,
              activeCount: 0,
              sellThroughRate: null,
              saturationRatio: 0,
              saturationRisk: "HIGH",
              velocityScore: "DEAD",
              confidenceCollapseReasons: ["market_data_unavailable"]
            },
            engineTelemetry: {
              compCount: 0,
              velocityScore: "DEAD",
              saturationRatio: 0,
              confidenceBreakdown: ["No authorized sold comps available"],
              ocrConfidence: "HIGH",
              isMultipackOrBundle: false
            },
            decisionCard: {
              product: {
                title: "Mattel Demo Action Figure",
                brand: "Mattel",
                category: "Toys & Collectibles",
                upc: "887961123456"
              },
              action: "MANUAL_REVIEW",
              confidenceScore: 72,
              reasoning: "REVIEW: No authorized sold-comps feed is configured for this scan.",
              signals: ["THIN_MARKET"],
              missingDataPoints: ["trustworthy sold comps"],
              telemetry: {
                compCount: 0,
                velocityScore: "DEAD",
                saturationRatio: 0,
                confidenceBreakdown: ["No authorized sold comps available"],
                ocrConfidence: "HIGH",
                isMultipackOrBundle: false
              }
            },
            marketComps: {
              averageResalePrice: undefined,
              recentSalesCount: 0,
              staleComps: true,
              priceVarianceHigh: false
            },
            resellerSignals: ["THIN_MARKET"],
            missingDataPoints: ["trustworthy sold comps"],
            productCandidates: [],
            generatedSearchQueries: [],
            generatedSearchQueryTelemetry: [],
            enrichmentStages: [],
            comps: []
          }
        })
      });
    });

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Boss Listers AI" })).toBeVisible();
    await expect(page.getByLabel("Marketplace")).toHaveValue("ebay");

    await page.getByLabel("Item name").fill("Mattel Demo Action Figure");
    await page.getByLabel("Cost paid").fill("24.99");
    await page.getByLabel("Shipping").fill("6.00");
    await page.getByLabel("Packaging").fill("1.25");
    await page.getByLabel("Manual sold comp").fill("50.00");
    await page.locator('input[type="file"][multiple]').setInputFiles({
      name: "demo-item.png",
      mimeType: "image/png",
      buffer: tinyPng
    });
    await page.getByRole("button", { name: "Analyze photo" }).click();

    await expect(page.getByText("Instant decision")).toBeVisible();
    await expect(page.getByText("REVIEW").first()).toBeVisible();
    await expect(page.getByText("No authorized sold-comps feed is configured").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Scan Another" })).toBeVisible();
  });
});
