# Graph Report - BossListers  (2026-08-24)

## Corpus Check
- 363 files · ~186,149 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2287 nodes · 5024 edges · 135 communities (113 shown, 22 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 139 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Profit Correction UI
- Reseller Demand Modeling
- Analyze API Route
- KDP Book Export Routes
- Boss Brain Dashboard
- Comps Intelligence Engine
- Walmart Route + Barcode Scan
- Card ID & Grading (Gemini)
- Dashboard Components
- Core Analyze Service
- Listing Sync Route
- Client Auth & Session
- Amazon/eBay Market Routes
- Boss Lister Scan Form
- Analysis Type Schemas
- Monetization / Plans
- Scan Record & AI Panels
- Niche Research
- Pricing Intelligence Engine
- Cross-List Engine Types
- Dashboard Pages
- Product Title Building
- OpenAI Vision Analysis
- TS Build Config
- Inventory Repository
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 70
- Community 71
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Community 77
- Community 78
- Community 79
- Community 80
- Community 81
- Community 82
- Community 83
- Community 84
- Community 85
- Community 86
- Community 87
- Community 88
- Community 89
- Community 90
- Community 91
- Community 92
- Community 93
- Community 94
- Community 95
- Community 96
- Community 98
- Community 99
- Community 100
- Community 102
- Community 103
- Community 104
- Community 105
- Community 106
- Community 107
- Community 108
- Community 111
- Community 112
- Community 113
- Community 114
- Community 115
- Community 116
- Community 117
- Community 126

## God Nodes (most connected - your core abstractions)
1. `analyzeFormData()` - 75 edges
2. `calculateResaleMetrics()` - 38 edges
3. `InventoryRecord` - 25 edges
4. `getSupabaseBrowserClient()` - 25 edges
5. `UploadScanner()` - 22 edges
6. `listingTitle()` - 22 edges
7. `CrossListPlatform` - 22 edges
8. `CrossListDraft` - 22 edges
9. `ScanRecord` - 21 edges
10. `ProfitSummaryCard()` - 20 edges

## Surprising Connections (you probably didn't know these)
- `csvRowToInventory()` --calls--> `validateOrRepairNormalizedListing()`  [EXTRACTED]
  app/EbayInventoryImportPanel.tsx → lib/normalizedListingSchema.ts
- `importText()` --calls--> `parseEbayInventoryCsv()`  [EXTRACTED]
  app/EbayInventoryImportPanel.tsx → lib/ebayInventoryImport.ts
- `buildUserVerifiedSale()` --indirect_call--> `costPaid()`  [INFERRED]
  components/dashboard/CorrectionPortal.tsx → app/InventoryWorkflow.tsx
- `saveCorrection()` --indirect_call--> `costPaid()`  [INFERRED]
  components/dashboard/CorrectionPortal.tsx → app/InventoryWorkflow.tsx
- `buildPlatformDraft()` --calls--> `buildCrossListDrafts()`  [EXTRACTED]
  app/InventoryWorkflow.tsx → lib/crossListEngine/adaptListing.ts

## Import Cycles
- None detected.

## Communities (135 total, 22 thin omitted)

### Community 0 - "Profit Correction UI"
Cohesion: 0.05
Nodes (67): costPaid(), estimatedNetProfit(), buildId(), CONDITION_OPTIONS, CONFIDENCE_OPTIONS, CorrectionPortal(), applyFlag(), buildUserVerifiedSale() (+59 more)

### Community 1 - "Reseller Demand Modeling"
Cohesion: 0.07
Nodes (65): CATEGORY_BEHAVIOR_MATRIX, clamp(), collectorDemandIndex(), longTailProbability(), base, baseFacts, ExpectedFixtureOutcome, ResellerEngineFixture (+57 more)

### Community 2 - "Analyze API Route"
Cohesion: 0.06
Nodes (62): buildAnalyzeFailurePayload(), fallbackTitleFromFormData(), GET, POST, runtime, valueFromForm(), withAnalyzeTimeout(), POST() (+54 more)

### Community 3 - "KDP Book Export Routes"
Cohesion: 0.07
Nodes (58): POST(), runtime, POST(), runtime, POST(), runtime, POST(), runtime (+50 more)

### Community 4 - "Boss Brain Dashboard"
Cohesion: 0.07
Nodes (65): BossBrainPanel(), MiniRankList(), money(), percent(), titleOf(), CompsTable(), findInventoryItemId(), loadInventory() (+57 more)

### Community 5 - "Comps Intelligence Engine"
Cohesion: 0.06
Nodes (66): aggregateAcceptedCompScoring(), brandMismatch(), buildGeneratedSearchQueries(), buildIdentityConfidence(), buildQuery(), buildQueryTelemetry(), buildTrustedCompSummary(), categoryMismatch() (+58 more)

### Community 6 - "Walmart Route + Barcode Scan"
Cohesion: 0.07
Nodes (60): GET(), runtime, buildDecisionAnnouncement(), captureVideoFrame(), createBarcodeReader(), detectBarcodeFromFiles(), getBarcodeText(), improveCameraForBarcode() (+52 more)

### Community 7 - "Card ID & Grading (Gemini)"
Cohesion: 0.06
Nodes (49): emptyCardFields(), GRADING_COMPANIES, IDENTIFICATION_STATUS, VALUATION_STATUS, bytesToBase64(), callGeminiVision(), { emptyCardFields, IDENTIFICATION_STATUS }, identifyCard() (+41 more)

### Community 8 - "Dashboard Components"
Cohesion: 0.07
Nodes (51): AgentCommandPanel(), candidateKey(), DashboardSkeleton(), decisionBadgeLabel(), DecisionBanner(), DecisionStatusCard(), formatCompactMoney(), formatMatrixMoney() (+43 more)

### Community 9 - "Core Analyze Service"
Cohesion: 0.07
Nodes (54): ALLOWED_IMAGE_TYPES, analyzeFormData(), applyProductLookup(), applyScannedBarcode(), buildCalibrationTuning(), buildEngineDecisionModel(), buildResellerMarketFacts(), buildTrustExplanation() (+46 more)

### Community 10 - "Listing Sync Route"
Cohesion: 0.09
Nodes (44): draftForPlatform(), firstPrice(), firstText(), missingFields(), numberOrNull(), POST(), runtime, SyncRequestBody (+36 more)

### Community 11 - "Client Auth & Session"
Cohesion: 0.08
Nodes (29): authedFetch(), clearSession(), getSession(), requireSession(), setSession(), Capture(), handleGenerate(), getSessionId() (+21 more)

### Community 12 - "Amazon/eBay Market Routes"
Cohesion: 0.09
Nodes (34): GET(), runtime, fetchEbayActiveListings(), GET(), runtime, safeJsonArray(), GET(), runtime (+26 more)

### Community 13 - "Boss Lister Scan Form"
Cohesion: 0.10
Nodes (31): BossListerForm(), handleAnalyze(), handlePhotoChange(), handleSaveScan(), updateForm(), createScanId(), FormState, initialFormState (+23 more)

### Community 14 - "Analysis Type Schemas"
Cohesion: 0.07
Nodes (35): AnalysisResult, AnalysisResultSchema, AnalyzeDashboardPayload, AnalyzeDashboardPayloadSchema, CrossListDraft, CrossListDraftSchema, DecisionCardData, DecisionCardDataSchema (+27 more)

### Community 15 - "Monetization / Plans"
Cohesion: 0.14
Nodes (30): BossListersPlan, FeatureKey, getFreeTierScanUsage(), SUBSCRIPTION_READY_CONFIG, buildResellerSessionMetrics(), confidence(), consecutivePassCount(), demandLevel() (+22 more)

### Community 16 - "Scan Record & AI Panels"
Cohesion: 0.19
Nodes (23): ScanRecord, AIRecommendationPanel(), InventoryHealthPanel(), OpportunityFeed(), ProfitRadar(), RelistSuggestions(), RiskCenter(), StoreHeatmapPanel() (+15 more)

### Community 17 - "Niche Research"
Cohesion: 0.11
Nodes (25): getSupabaseConfig(), getTopPerformingNiches(), getUserScopedSupabase(), nicheSchema, toTrackedNiche(), trackNicheAction(), columns, competitionClasses() (+17 more)

### Community 18 - "Pricing Intelligence Engine"
Cohesion: 0.09
Nodes (30): buildSearchText(), buildSourceProfitMetrics(), CATEGORY_MULTIPLIERS, collectEbaySoldPrices(), COLLECTIBLE_PATTERNS, COLLECTIBLE_TOY_TAGS, collectSoldPrices(), COMMON_SHELF_WARMER_PATTERNS (+22 more)

### Community 19 - "Cross-List Engine Types"
Cohesion: 0.15
Nodes (18): CrossListDraft, CrossListInput, adapters, adaptListingDrafts(), clamp(), ListingOptimizationScore, scoreListingDraft(), optimizeAdaptedListing() (+10 more)

### Community 20 - "Dashboard Pages"
Cohesion: 0.11
Nodes (14): ExecutionTimeline(), STEPS, loadQueue(), saveQueue(), SourcingTerminal(), queueScan(), updateStatus(), upsertQueue() (+6 more)

### Community 21 - "Product Title Building"
Cohesion: 0.17
Nodes (27): appendUnique(), brandAppearsInEvidence(), buildAnalysis(), buildFallbackTitle(), buildOcrPriorityTitle(), buildProductCandidates(), buildResellerTitle(), candidateTokens() (+19 more)

### Community 22 - "OpenAI Vision Analysis"
Cohesion: 0.14
Nodes (24): analyzeProductImage(), buildVisionProductCandidates(), clampConfidence(), cleanOcrSnippet(), cleanShortArray(), cleanVisionTitle(), emptyVisionPayload(), extractJsonObject() (+16 more)

### Community 23 - "TS Build Config"
Cohesion: 0.07
Nodes (26): dom, dom.iterable, esnext, next-env.d.ts, .next/types/**/*.ts, supabase/functions, **/*.ts, **/*.tsx (+18 more)

### Community 24 - "Inventory Repository"
Cohesion: 0.17
Nodes (25): clampMoney(), dedupeScans(), findInventoryItemIdRepository(), inventoryFromRow(), inventoryStatusToDb(), listingFingerprint(), makeId(), makeSku() (+17 more)

### Community 25 - "Community 25"
Cohesion: 0.15
Nodes (21): buildDescription(), buildKeywords(), buildManualPackage(), buildTitle(), MANUAL_PLATFORMS, packagesToCsv(), PHOTO_CHECKLIST, truncate() (+13 more)

### Community 26 - "Community 26"
Cohesion: 0.14
Nodes (18): createUniversalListing(), PlatformListingState, PlatformPublishStatus, PlatformSyncState, UniversalListing, buildInventorySyncSnapshot(), buildListingRegistry(), ListingRegistryEntry (+10 more)

### Community 27 - "Community 27"
Cohesion: 0.16
Nodes (26): buildConfidenceReasoning(), buildSourcingDecision(), calculateActiveListingDiscount(), calculateCapitalEfficiency(), calculateConfidenceScore(), calculateInventoryBurden(), calculateOperationalScore(), calculateResaleMetrics() (+18 more)

### Community 28 - "Community 28"
Cohesion: 0.13
Nodes (15): buildEvents(), eventNameFromLog(), InventoryEvent, InventoryEventName, InventoryEventsTimeline(), ListingQueue(), loadQueue(), publishingQueueFromInventory() (+7 more)

### Community 29 - "Community 29"
Cohesion: 0.19
Nodes (16): CrossListPlatform, clamp(), scoreInventoryHealth(), canTransitionInventory(), transitionInventory(), transitions, buildInventoryOSSnapshot(), InventoryLifecycleState (+8 more)

### Community 30 - "Community 30"
Cohesion: 0.08
Nodes (23): action, default_popup, default_title, background, service_worker, content_scripts, description, host_permissions (+15 more)

### Community 31 - "Community 31"
Cohesion: 0.22
Nodes (16): repairConfidenceScore(), repairFallbackPayload(), repairOptionalCurrency(), repairOptionalNumber(), repairOptionalPercentage(), RepairTelemetry, normalizeCurrency(), normalizeNumber() (+8 more)

### Community 32 - "Community 32"
Cohesion: 0.14
Nodes (18): researchKeywordAction(), columns, getAccessToken(), KeywordResearchDashboard(), handleResearch(), handleSave(), numberFormatter, SortDirection (+10 more)

### Community 33 - "Community 33"
Cohesion: 0.17
Nodes (13): riskClass, WhyThisScorePanel(), DecisionState, recommendBuy(), weightConfidence(), buildBuyDecision(), BuyDecisionOutput, resolveSellThroughSpeed() (+5 more)

### Community 34 - "Community 34"
Cohesion: 0.25
Nodes (15): loadInventoryState(), persistInventoryState(), ListingHistoryStatus, loadListingHistory(), persistListingHistory(), appendRecord(), listRecords(), buildRecoverySnapshot() (+7 more)

### Community 35 - "Community 35"
Cohesion: 0.18
Nodes (17): ApiRequestContext, GET, modeParam(), numberParam(), POST, runtime, ApiRequestContext, botParam() (+9 more)

### Community 36 - "Community 36"
Cohesion: 0.20
Nodes (17): DELETE(), GET(), POST(), PUT(), runtime, DB_PATH, deleteListing(), ensureInitialized() (+9 more)

### Community 37 - "Community 37"
Cohesion: 0.16
Nodes (13): DashboardPage(), DashboardPageProps, getListing(), CompsTableSkeleton(), ProfitSummarySkeleton(), UploadScannerProps, UploadScannerProps, AnalyzeDashboardResponse (+5 more)

### Community 38 - "Community 38"
Cohesion: 0.22
Nodes (11): LiveActivityFeed(), tone, LiveExecutionStatus(), ScanEventStream(), buildEventStreamSnapshot(), EventStreamSnapshot, buildLiveSyncState(), readUiSignals() (+3 more)

### Community 39 - "Community 39"
Cohesion: 0.18
Nodes (17): assertRequiredPersonas(), buildPlaywrightResponses(), councilOutputSchema, generateCouncilResponses(), getCouncilConsultations(), getSupabaseConfig(), getUserScopedSupabase(), normalizeExpertResponses() (+9 more)

### Community 40 - "Community 40"
Cohesion: 0.24
Nodes (17): candidateFromScan(), candidateKey(), clamp(), clean(), CouncilMonitorCandidate, firstMoney(), firstNumber(), mergeCandidates() (+9 more)

### Community 41 - "Community 41"
Cohesion: 0.18
Nodes (15): assertConfigured(), createTenantForUser(), getMyTenants(), getUserFromToken(), resolveSession(), signIn(), signUp(), connector (+7 more)

### Community 42 - "Community 42"
Cohesion: 0.12
Nodes (17): ai, @ai-sdk/openai, exif-parser, fs-extra, jszip, dependencies, ai, @ai-sdk/openai (+9 more)

### Community 43 - "Community 43"
Cohesion: 0.15
Nodes (13): calculateProductProfit(), calculateStats(), INITIAL_PRODUCTS, INITIAL_SYNC_LOGS, CardCollectiblesAttributes, PlatformName, PricingBreakdown, ProductCategory (+5 more)

### Community 44 - "Community 44"
Cohesion: 0.22
Nodes (14): csvRowToInventory(), EbayInventoryImportPanel(), handleFile(), importText(), makeId(), money(), importInventoryItemsRepository(), EasyPlatform (+6 more)

### Community 45 - "Community 45"
Cohesion: 0.21
Nodes (12): getSavedKeywordsAction(), getSupabaseConfig(), getUserScopedSupabase(), keywordMetricSchema, saveKeywordAction(), toSavedKeyword(), metadata, getAccessToken() (+4 more)

### Community 46 - "Community 46"
Cohesion: 0.16
Nodes (10): BossListersUserSession, SCHEMA_VERSION, USER_SESSION_COLLECTION, cloudStorageAdapter, localStorageAdapter, StorageAdapter, StorageAdapterName, isSupabaseConfigured() (+2 more)

### Community 47 - "Community 47"
Cohesion: 0.30
Nodes (6): InventoryRecord, EbayMarketplaceAdapter, MarketplaceAdapter, MarketplaceAdapterCode, MarketplaceAdapterResult, notImplementedResult()

### Community 48 - "Community 48"
Cohesion: 0.24
Nodes (8): runExecutionAgents(), runInventoryAgent(), runListingAgent(), runOptimizationAgent(), runPricingAgent(), runRiskAgent(), runSourcingAgent(), runVelocityAgent()

### Community 49 - "Community 49"
Cohesion: 0.17
Nodes (14): APPAREL_TOKENS, capWord(), detectHotWheels(), ELECTRONICS_TOKENS, HOT_WHEELS_LINES, HOUSEHOLD_TOKENS, includesTokenSequence(), inferFromFile() (+6 more)

### Community 50 - "Community 50"
Cohesion: 0.46
Nodes (16): asArray(), asNumber(), asString(), clamp(), repairAnalysisResult(), repairConfirmedProductIdentity(), repairCrossListDrafts(), repairDecisionCard() (+8 more)

### Community 51 - "Community 51"
Cohesion: 0.25
Nodes (9): DeadLetterEntry, toDeadLetter(), createPublishJob(), PublishJob, PublishState, buildPublishQueue(), processPublishJob(), processPublishJobs() (+1 more)

### Community 52 - "Community 52"
Cohesion: 0.30
Nodes (15): buildSourcingSessionSummary(), loadInventoryRepository(), loadScanHistoryRepository(), markInventoryItemSoldRepository(), persistInventoryItem(), persistPlatformListingStatuses(), readLocalScans(), saveScanToHistoryRepository() (+7 more)

### Community 53 - "Community 53"
Cohesion: 0.13
Nodes (15): autoprefixer, devDependencies, autoprefixer, @playwright/test, postcss, tailwindcss, @types/node, @types/react (+7 more)

### Community 55 - "Community 55"
Cohesion: 0.23
Nodes (13): computeFees(), computeProfit(), estimateShippingCost(), capWords(), clampChars(), { computeProfit }, estimateShippingText(), generateForAll() (+5 more)

### Community 56 - "Community 56"
Cohesion: 0.14
Nodes (4): CredentialVault, PLATFORMS, TODO: Implement per-platform API test, SUPPORTED_PLATFORMS

### Community 57 - "Community 57"
Cohesion: 0.29
Nodes (10): DashboardShell(), getDecision(), getListingProfit(), getListingRoi(), getMicrocopy(), money(), numeric(), scansPerMinute() (+2 more)

### Community 58 - "Community 58"
Cohesion: 0.22
Nodes (10): buildAnalyticsSnapshot(), confidence(), roi(), AnalyticsSnapshot, PlatformListingStatus, SoldStatus, SyncStatus, displayStatus() (+2 more)

### Community 59 - "Community 59"
Cohesion: 0.24
Nodes (14): buildSourcingAnalytics(), deriveRecognitionTags(), estimateMonthlySalesVelocity(), estimateResaleFromEvidence(), estimateSellThroughRatio(), evidenceText(), getCollectorScore(), getRetailArbitrageDifficulty() (+6 more)

### Community 60 - "Community 60"
Cohesion: 0.15
Nodes (7): { BaseConnector, CONNECTION_STATUS }, EbayListingError, EtsyListingError, FacebookListingError, WooCommerceListingError, CONNECTION_STATUS, UnsupportedOperationError

### Community 61 - "Community 61"
Cohesion: 0.31
Nodes (9): dispatchEvents(), EventHandler, buildInventoryEventFlow(), createEventStore(), EventStoreSnapshot, BossEvent, BossEventType, createEvent() (+1 more)

### Community 62 - "Community 62"
Cohesion: 0.23
Nodes (8): ExpertCard(), personaAccent(), personaIcon(), renderMarkdownText(), metadata, CouncilConsultation, CouncilExpertResponse, CouncilPersonaName

### Community 63 - "Community 63"
Cohesion: 0.19
Nodes (9): API_CONNECTORS, CHANNELS, { CONNECTION_STATUS }, { EbayConnector, EtsyConnector, FacebookConnector, ShopifyConnector, WooCommerceConnector }, getChannelStatuses(), { MANUAL_PLATFORMS }, staticStatus(), handler() (+1 more)

### Community 64 - "Community 64"
Cohesion: 0.36
Nodes (11): buildCrossListDrafts(), bulletsForPlatform(), cleanText(), descriptionForPlatform(), hashtags(), PLATFORMS, titleForPlatform(), truncateAtWord() (+3 more)

### Community 65 - "Community 65"
Cohesion: 0.22
Nodes (10): extractVerifiedSoldCompPrice(), positiveNumber(), VerifiedSoldCompPrice, calculateManualCompOverride(), ManualCompOverrideInput, ManualCompOverrideResult, moneyOrNull(), positiveNumber() (+2 more)

### Community 66 - "Community 66"
Cohesion: 0.26
Nodes (8): detectClearancePattern(), estimateRegionalPricingRisk(), ALIASES, detectRetailer(), RETAILER_PROFILES, RetailerId, RetailerProfile, scoreRetailerOpportunity()

### Community 67 - "Community 67"
Cohesion: 0.39
Nodes (11): exactLocalMatch(), externalIdForPlatform(), inventoryRecords(), linkedChannels(), liveDelistRequirementsMet(), LocalInventoryRecord, MarketplaceWebhookBody, normalizePlatform() (+3 more)

### Community 68 - "Community 68"
Cohesion: 0.18
Nodes (5): EXPORTS, KdpMetadata, PackageResponse, PublishingPage(), useBossListersAuth()

### Community 69 - "Community 69"
Cohesion: 0.30
Nodes (12): buildDecisionSummary(), buildMarketplaceEligibility(), decision(), flagLabels(), buildSourcingTip(), categorySpecificSourcingTip(), getDashboardConfidence(), getMarketConfidence() (+4 more)

### Community 70 - "Community 70"
Cohesion: 0.32
Nodes (6): runComplianceChecks(), scoreImageCompliance(), optimizeListingForPlatform(), buildPlatformReadiness(), optimizePlatformPricing(), scoreTitleQuality()

### Community 71 - "Community 71"
Cohesion: 0.23
Nodes (12): average(), averageEbaySoldPrice(), buildSoldPriceRange(), collectActivePrices(), iqrFiltered(), median(), percentile(), roundCurrency() (+4 more)

### Community 72 - "Community 72"
Cohesion: 0.24
Nodes (8): AuraFitPage(), scanMeal(), CoachMode, CoachResult, formatBytes(), formatNumber(), modeStyles(), ScanResult

### Community 73 - "Community 73"
Cohesion: 0.29
Nodes (10): CompsTable(), formatMatrixMoney(), getConfidenceDisplay(), getEligibilityClass(), getRiskBadgeClass(), getSourceStatusClass(), MarketIntelligenceCard(), ProfitSummaryCard() (+2 more)

### Community 74 - "Community 74"
Cohesion: 0.25
Nodes (8): compactStatus(), InventoryBotItem, InventoryItem(), PostingBotItem, PostingItem(), SpecialistBotsPanel(), SpecialistBotsSnapshot, statusClass()

### Community 76 - "Community 76"
Cohesion: 0.18
Nodes (10): background_color, description, display, icons, name, orientation, scope, short_name (+2 more)

### Community 77 - "Community 77"
Cohesion: 0.20
Nodes (8): assert, fs, Module, path, root, { test }, ts, tsModuleCache

### Community 78 - "Community 78"
Cohesion: 0.22
Nodes (4): fs, header, items, rows

### Community 79 - "Community 79"
Cohesion: 0.36
Nodes (8): asArray(), asRecord(), inspectInventoryRecord(), InventorySyncMonitorOptions, newestFirst(), numberValue(), runInventorySyncMonitorAgent(), InventoryPersistenceRecord

### Community 80 - "Community 80"
Cohesion: 0.36
Nodes (8): asArray(), asRecord(), inspectListingRecord(), MultiPlatformPostingOptions, newestFirst(), platformName(), runMultiPlatformPostingAgent(), ListingHistoryRecord

### Community 81 - "Community 81"
Cohesion: 0.42
Nodes (8): clean(), EbayInventoryImportRow, headerKey(), money(), parseCsvLine(), parseEbayInventoryCsv(), pick(), quantity()

### Community 82 - "Community 82"
Cohesion: 0.39
Nodes (7): makeStorageId(), StoredRecord, collectionPath(), ensureStorageDir(), PersistedCollection, readCollection(), writeCollection()

### Community 83 - "Community 83"
Cohesion: 0.39
Nodes (7): deleteListing(), getListing(), listListings(), { rest }, saveListing(), assertConfigured(), rest()

### Community 84 - "Community 84"
Cohesion: 0.22
Nodes (9): scripts, build, dev, start, start:render, test, test:e2e, test:e2e:ui (+1 more)

### Community 85 - "Community 85"
Cohesion: 0.36
Nodes (7): CalculatorListing, MarketplaceKey, MARKETPLACES, money(), normalizeMarketplace(), parseCurrency(), ResellerCalculator()

### Community 87 - "Community 87"
Cohesion: 0.36
Nodes (7): buckets, checkRateLimit(), clientKey(), enforceRateLimit(), MAX_REQUESTS, sweep(), WINDOW_MS

### Community 88 - "Community 88"
Cohesion: 0.71
Nodes (6): emptyMarketData(), getAmazonCatalogPricing(), getEbaySoldComps(), getMarketplaceSignals(), getTikTokShopPricing(), getWalmartPricing()

### Community 89 - "Community 89"
Cohesion: 0.43
Nodes (6): CacheEntry, cacheId(), getCachedValue(), getOrSetCachedValue(), setCachedValue(), TTL_MS

### Community 90 - "Community 90"
Cohesion: 0.47
Nodes (4): GET(), runtime, estimateShippingRisk(), ShippingProfile

### Community 91 - "Community 91"
Cohesion: 0.33
Nodes (5): compilerOptions, baseUrl, exclude, node_modules, .next

### Community 92 - "Community 92"
Cohesion: 0.40
Nodes (4): ListingHealthStatus, PLATFORM_PROFILES, PlatformListingStyle, PlatformProfile

### Community 96 - "Community 96"
Cohesion: 0.83
Nodes (3): checkBasicAuth(), constantTimeCompare(), parseBasicAuth()

### Community 98 - "Community 98"
Cohesion: 0.67
Nodes (3): config, middleware(), sha256Hex()

### Community 99 - "Community 99"
Cohesion: 0.50
Nodes (3): name, private, version

## Knowledge Gaps
- **425 isolated node(s):** `fs`, `items`, `header`, `rows`, `STATUSES` (+420 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **22 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getSupabaseBrowserClient()` connect `Community 52` to `Community 32`, `Community 68`, `Community 39`, `Community 45`, `Community 46`, `Niche Research`, `Inventory Repository`, `Community 62`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Why does `validateOrRepairNormalizedListing()` connect `Community 37` to `Community 69`, `Core Analyze Service`, `Community 44`, `Analysis Type Schemas`, `Community 50`, `Inventory Repository`, `Community 58`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Why does `NormalizedListing` connect `Community 37` to `Profit Correction UI`, `Boss Brain Dashboard`, `Walmart Route + Barcode Scan`, `Dashboard Components`, `Community 73`, `Listing Sync Route`, `Analysis Type Schemas`, `Scan Record & AI Panels`, `Inventory Repository`, `Community 57`, `Community 58`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **What connects `fs`, `items`, `header` to the rest of the system?**
  _425 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Profit Correction UI` be split into smaller, more focused modules?**
  _Cohesion score 0.053482221569203646 - nodes in this community are weakly interconnected._
- **Should `Reseller Demand Modeling` be split into smaller, more focused modules?**
  _Cohesion score 0.06596035543403965 - nodes in this community are weakly interconnected._
- **Should `Analyze API Route` be split into smaller, more focused modules?**
  _Cohesion score 0.062206572769953054 - nodes in this community are weakly interconnected._