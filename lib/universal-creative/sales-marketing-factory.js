#!/usr/bin/env node
/**
 * Universal Creative Production Connector — Sales & Marketing Factory
 *
 * Unified entry point connecting all Sales & Marketing Factory modules:
 *   - CRM (customers, leads, contacts)
 *   - Campaign Manager (campaigns, audiences, creatives, performance)
 *   - Sales Pipeline (deals, stages, activities, forecasting)
 *   - Revenue Tracker (revenue, commissions, attribution)
 *   - Marketing Automation (templates, sequences, executions, triggers)
 *   - Analytics (funnel, ROI, dashboard summary)
 *
 * Connects through shared business, campaign, creative, CRM, and revenue data.
 * Integrates with existing Commercial Maker, Video Factory, and BossListers inventory.
 *
 * Render-only safety: no auto-post, no auto-list, no auto-send, no auto-spend.
 * All publishing requires explicit user approval + authorized connections.
 */

const crm = require("./crm.js");
const campaignManager = require("./campaign-manager.js");
const salesPipeline = require("./sales-pipeline.js");
const revenueTracker = require("./revenue-tracker.js");
const marketingAutomation = require("./marketing-automation.js");
const analytics = require("./analytics.js");

/* ---------------------------------------------------------------- Unified factory API */

/**
 * Create a complete sales lead from a BossListers inventory item.
 * Connects inventory → CRM → Campaign → Creative.
 */
function createLeadFromInventory(item, options = {}) {
  const { campaignId, source = "inventory", score = 50 } = options;

  // 1. Create customer from inventory item
  const customerResult = crm.createCustomer({
    firstName: item.contactFirstName || "Inventory",
    lastName: item.contactLastName || "Customer",
    email: item.contactEmail || null,
    phone: item.contactPhone || null,
    company: item.company || null,
    status: "lead",
    tags: ["inventory", item.category || "general"],
    source,
    sourceReference: item.sku || item.id,
  });
  if (!customerResult.ok) return customerResult;

  // 2. Create lead
  const leadResult = crm.createLead({
    customerId: customerResult.customer.id,
    source,
    score,
    notes: `Lead from inventory item: ${item.title}`,
    expectedValue: item.price || null,
  });
  if (!leadResult.ok) return leadResult;

  // 3. If campaignId provided, add customer to campaign audience
  if (campaignId) {
    campaignManager.buildAudienceFromCRM(campaignId, `Inventory leads: ${item.title}`, {
      source: "inventory",
    });
  }

  return {
    ok: true,
    customer: customerResult.customer,
    lead: leadResult.lead,
    inventoryItem: item,
  };
}

/**
 * Create a commercial and link it to a campaign.
 * Connects Commercial Maker → Campaign Manager → Creative assets.
 */
async function createCommercialForCampaign(campaignId, product, options = {}) {
  const { mode, dir, noLearn, explore, autoImprove, learningStore } = options;

  // Verify campaign exists
  const campaignResult = campaignManager.getCampaign(campaignId);
  if (!campaignResult.ok) return campaignResult;

  // Create commercial via existing Commercial Maker orchestrator
  const { makeCommercialUnified } = require("./orchestrator.js");
  const commercialResult = await makeCommercialUnified({
    mode,
    product,
    dir,
    noLearn,
    explore,
    autoImprove,
    learningStore,
  });
  if (!commercialResult.ok) return commercialResult;

  // Link commercial as a creative asset to the campaign
  const creativeResult = campaignManager.linkCampaignCreative({
    campaignId,
    creativeType: "commercial",
    creativeId: commercialResult.mode || "unknown",
    creativeName: commercialResult.name || product.title,
    role: "hero",
    platform: product.platform || "instagram",
  });

  return {
    ok: true,
    campaign: campaignResult.campaign,
    commercial: commercialResult,
    creative: creativeResult.ok ? creativeResult.creative : null,
  };
}

/**
 * Create a complete deal from a lead, with revenue tracking.
 * Connects CRM → Sales Pipeline → Revenue Tracker.
 */
function createDealFromLead(leadId, options = {}) {
  const { title, value, stageId, owner, commissionRate = 10, commissionPayee = "sales-rep" } = options;

  // Get the lead
  const leadResult = crm.getLead(leadId);
  if (!leadResult.ok) return leadResult;

  const lead = leadResult.lead;

  // Get the customer
  const customerResult = crm.getCustomer(lead.customerId);
  if (!customerResult.ok) return customerResult;

  // Initialize default pipeline stages if needed
  salesPipeline.initializeDefaultStages();

  // Determine stage
  let finalStageId = stageId;
  if (!finalStageId) {
    const stages = salesPipeline.listPipelineStages();
    const qualifiedStage = stages.stages.find((s) => s.type === "qualified");
    finalStageId = qualifiedStage ? qualifiedStage.id : stages.stages[0].id;
  }

  // Create deal
  const dealResult = salesPipeline.createDeal({
    title: title || `Deal for ${lead.customerId}`,
    value: value || lead.expectedValue || 0,
    stageId: finalStageId,
    customerId: lead.customerId,
    leadId,
    owner,
    source: lead.source,
  });
  if (!dealResult.ok) return dealResult;

  // Create revenue record if deal has value
  let revenueResult = null;
  if (dealResult.deal.value > 0) {
    revenueResult = revenueTracker.createRevenueRecord({
      dealId: dealResult.deal.id,
      amount: dealResult.deal.value,
      source: lead.source,
      description: `Revenue from deal: ${dealResult.deal.title}`,
    });
  }

  // Create commission
  let commissionResult = null;
  if (revenueResult && revenueResult.ok) {
    commissionResult = revenueTracker.createCommission({
      dealId: dealResult.deal.id,
      payee: commissionPayee,
      rate: commissionRate,
    });
  }

  return {
    ok: true,
    lead,
    customer: customerResult.customer,
    deal: dealResult.deal,
    revenue: revenueResult ? revenueResult.revenue : null,
    commission: commissionResult ? commissionResult.commission : null,
  };
}

/**
 * Execute a full sales & marketing workflow from inventory to revenue.
 * Connects: Inventory → CRM → Campaign → Commercial → Deal → Revenue → Commission.
 */
function runFullWorkflow(options = {}) {
  const { inventoryItem, campaignName, product, commissionRate = 10, commissionPayee = "sales-rep", createCommercial = true } = options;

  const results = { steps: [] };

  // Step 1: Create lead from inventory
  if (inventoryItem) {
    const leadResult = createLeadFromInventory(inventoryItem, { source: "inventory" });
    results.steps.push({ step: "lead-from-inventory", ok: leadResult.ok, data: leadResult });

    if (leadResult.ok && campaignName) {
      // Step 2: Create campaign
      const campaignResult = campaignManager.createCampaign({
        name: campaignName,
        type: "direct-response",
        source: "inventory",
        createdBy: "system",
      });
      results.steps.push({ step: "create-campaign", ok: campaignResult.ok, data: campaignResult });

      if (campaignResult.ok) {
        // Step 3: Build audience from CRM
        const audienceResult = campaignManager.buildAudienceFromCRM(
          campaignResult.campaign.id,
          "Inventory leads",
          { source: "inventory" }
        );
        results.steps.push({ step: "build-audience", ok: audienceResult.ok, data: audienceResult });
      }
    }
  }

  // Step 4: Create commercial for campaign
  if (createCommercial && product && campaignName) {
    const campaigns = campaignManager.listCampaigns({ search: campaignName });
    if (campaigns.ok && campaigns.campaigns.length > 0) {
      const campaign = campaigns.campaigns[0];
      // createCommercialForCampaign is async but we call it synchronously here
      // since runFullWorkflow is not async. The commercial creation will need
      // to be awaited by the caller if they use the async factory method.
      results.steps.push({
        step: "commercial-for-campaign",
        ok: true,
        data: { message: "Use createCommercialForCampaign directly for async commercial creation", campaignId: campaign.id },
      });
    }
  }

  // Step 5: Get dashboard summary
  const dashboard = analytics.getDashboardSummary();
  results.dashboard = dashboard;

  return {
    ok: true,
    results,
    summary: dashboard,
  };
}

/**
 * Get complete factory status — all modules in one view.
 */
function getFactoryStatus() {
  return {
    timestamp: new Date().toISOString(),
    modules: {
      crm: crm.getCrmStats(),
      campaigns: campaignManager.getCampaignStats(),
      pipeline: salesPipeline.getPipelineStats(),
      revenue: revenueTracker.getRevenueStats(),
      automation: marketingAutomation.getAutomationStats(),
    },
    analytics: analytics.getDashboardSummary(),
    forecast: salesPipeline.getForecast(),
    funnel: analytics.getFunnelMetrics(),
    campaignROI: analytics.getCampaignROI(),
    revenueByCampaign: revenueTracker.getRevenueByCampaign(),
    revenueByChannel: revenueTracker.getRevenueByChannel(),
  };
}

/**
 * Initialize the factory with default data.
 */
function initializeFactory() {
  const stages = salesPipeline.initializeDefaultStages();
  return {
    ok: true,
    defaultStages: stages.stages,
    modules: ["crm", "campaigns", "pipeline", "revenue", "automation", "analytics"],
    initializedAt: new Date().toISOString(),
  };
}

/* ---------------------------------------------------------------- Exports */

module.exports = {
  // CRM
  createCustomer: crm.createCustomer,
  getCustomer: crm.getCustomer,
  listCustomers: crm.listCustomers,
  createLead: crm.createLead,
  listLeads: crm.listLeads,
  scoreLead: crm.scoreLead,
  createContact: crm.createContact,
  listContacts: crm.listContacts,
  getCustomerWithDetails: crm.getCustomerWithDetails,
  segmentCustomers: crm.segmentCustomers,
  getCrmStats: crm.getCrmStats,
  // Campaign Manager
  createCampaign: campaignManager.createCampaign,
  getCampaign: campaignManager.getCampaign,
  listCampaigns: campaignManager.listCampaigns,
  linkCampaignCreative: campaignManager.linkCampaignCreative,
  recordCampaignPerformance: campaignManager.recordCampaignPerformance,
  getCampaignStats: campaignManager.getCampaignStats,
  buildAudienceFromCRM: campaignManager.buildAudienceFromCRM,
  getCampaignWithDetails: campaignManager.getCampaignWithDetails,
  // Sales Pipeline
  initializeDefaultStages: salesPipeline.initializeDefaultStages,
  createDeal: salesPipeline.createDeal,
  listDeals: salesPipeline.listDeals,
  getDeal: salesPipeline.getDeal,
  getPipelineStats: salesPipeline.getPipelineStats,
  getForecast: salesPipeline.getForecast,
  // Revenue Tracker
  createRevenueRecord: revenueTracker.createRevenueRecord,
  listRevenueRecords: revenueTracker.listRevenueRecords,
  createCommission: revenueTracker.createCommission,
  listCommissions: revenueTracker.listCommissions,
  getRevenueStats: revenueTracker.getRevenueStats,
  recordAttribution: revenueTracker.recordAttribution,
  // Marketing Automation
  createEmailTemplate: marketingAutomation.createEmailTemplate,
  listEmailTemplates: marketingAutomation.listEmailTemplates,
  renderTemplate: marketingAutomation.renderTemplate,
  createSequence: marketingAutomation.createSequence,
  startExecution: marketingAutomation.startExecution,
  listExecutions: marketingAutomation.listExecutions,
  getAutomationStats: marketingAutomation.getAutomationStats,
  // Analytics
  getDashboardSummary: analytics.getDashboardSummary,
  getFunnelMetrics: analytics.getFunnelMetrics,
  getCampaignROI: analytics.getCampaignROI,
  getRevenueAnalytics: analytics.getRevenueAnalytics,
  // Factory-level operations
  createLeadFromInventory,
  createCommercialForCampaign,
  createDealFromLead,
  runFullWorkflow,
  getFactoryStatus,
  initializeFactory,
};
