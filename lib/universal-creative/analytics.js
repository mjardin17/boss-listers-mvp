#!/usr/bin/env node
/**
 * Universal Creative Production Connector — Analytics
 *
 * Sales and marketing analytics for Sales & Marketing Factory.
 * Provides conversion tracking, ROI measurement, funnel analytics,
 * and performance dashboards by connecting CRM, Campaign Manager,
 * Sales Pipeline, Revenue Tracker, and Marketing Automation data.
 *
 * Rules:
 *   - Single source of truth (Zod schemas) — no duplicated schemas
 *   - All data read from existing modules — no separate storage
 *   - Never invents data — all metrics computed from actual records
 *   - Read-only: no writes to any data store
 *   - Depends on CRM, Campaign Manager, Sales Pipeline, Revenue Tracker,
 *     Marketing Automation for source data
 */

const z = require("zod");

// Import all dependent modules
const {
  getCrmStats,
  listCustomers,
  listLeads,
  segmentCustomers,
} = require("./crm.js");

const {
  getCampaignStats,
  listCampaigns,
  listCampaignPerformance,
} = require("./campaign-manager.js");

const {
  getPipelineStats,
  getForecast,
  listDeals,
} = require("./sales-pipeline.js");

const {
  getRevenueStats,
  getRevenueByCampaign,
  getRevenueByChannel,
  listRevenueRecords,
} = require("./revenue-tracker.js");

const { getAutomationStats } = require("./marketing-automation.js");

/* ---------------------------------------------------------------- Zod schemas */

const DateRangeSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

const FunnelMetricsSchema = z.object({
  totalLeads: z.number().nonnegative(),
  qualifiedLeads: z.number().nonnegative(),
  proposals: z.number().nonnegative(),
  negotiations: z.number().nonnegative(),
  closedWon: z.number().nonnegative(),
  closedLost: z.number().nonnegative(),
  conversionRate: z.number().nonnegative(), // %
  averageDealValue: z.number().nonnegative(),
});

const CampaignROISchema = z.object({
  campaignId: z.string().min(1),
  campaignName: z.string().min(1),
  totalCost: z.number().nonnegative(),
  totalRevenue: z.number().nonnegative(),
  roas: z.number().nonnegative(), // return on ad spend
  profit: z.number(), // can be negative
  profitMargin: z.number(), // %
  conversions: z.number().nonnegative(),
});

/* ---------------------------------------------------------------- Funnel Analytics */

function getFunnelMetrics() {
  const leadsResult = listLeads();
  const customersResult = listCustomers();
  const pipelineStats = getPipelineStats();

  const totalLeads = leadsResult.ok ? leadsResult.total : 0;
  const totalCustomers = customersResult.ok ? customersResult.total : 0;

  // Count leads by status
  let qualifiedLeads = 0;
  let proposals = 0;
  let negotiations = 0;
  let closedWon = 0;
  let closedLost = 0;

  if (leadsResult.ok) {
    for (const lead of leadsResult.leads) {
      switch (lead.status) {
        case "qualified": qualifiedLeads++; break;
        case "proposal": proposals++; break;
        case "negotiation": negotiations++; break;
        case "closed-won": closedWon++; break;
        case "closed-lost": closedLost++; break;
      }
    }
  }

  // Also count from pipeline deals
  if (pipelineStats.ok) {
    // Pipeline deals complement lead data
  }

  const conversionRate = totalLeads > 0 ? Math.round((closedWon / totalLeads) * 10000) / 100 : 0;
  const averageDealValue = pipelineStats.ok ? pipelineStats.averageDealSize : 0;

  return {
    totalLeads,
    qualifiedLeads,
    proposals,
    negotiations,
    closedWon,
    closedLost,
    conversionRate,
    averageDealValue,
    totalCustomers,
  };
}

/* ---------------------------------------------------------------- Campaign ROI */

function getCampaignROI() {
  const campaignsResult = listCampaigns();
  const performanceResult = listCampaignPerformance();
  const revenueByCampaign = getRevenueByCampaign();

  const campaigns = campaignsResult.ok ? campaignsResult.campaigns : [];
  const performance = performanceResult.ok ? performanceResult.performance : [];

  const results = [];

  for (const campaign of campaigns) {
    const campaignPerf = performance.filter((p) => p.campaignId === campaign.id);
    const totalCost = campaignPerf.reduce((sum, p) => sum + (p.cost || 0), 0);
    const totalConversions = campaignPerf.reduce((sum, p) => sum + (p.conversions || 0), 0);

    // Get revenue attributed to this campaign
    const campaignRevenueEntry = revenueByCampaign.find((r) => r.campaignId === campaign.id);
    const totalRevenue = campaignRevenueEntry ? campaignRevenueEntry.revenue : 0;

    const roas = totalCost > 0 ? Math.round((totalRevenue / totalCost) * 100) / 100 : 0;
    const profit = totalRevenue - totalCost;
    const profitMargin = totalRevenue > 0 ? Math.round((profit / totalRevenue) * 10000) / 100 : 0;

    results.push({
      campaignId: campaign.id,
      campaignName: campaign.name,
      campaignType: campaign.type,
      status: campaign.status,
      totalCost,
      totalRevenue,
      roas,
      profit,
      profitMargin,
      conversions: totalConversions,
      impressions: campaignPerf.reduce((sum, p) => sum + (p.impressions || 0), 0),
      clicks: campaignPerf.reduce((sum, p) => sum + (p.clicks || 0), 0),
    });
  }

  // Sort by ROAS descending
  results.sort((a, b) => b.roas - a.roas);

  return results;
}

/* ---------------------------------------------------------------- Revenue Analytics */

function getRevenueAnalytics() {
  const revenueStats = getRevenueStats();
  const revenueByCampaign = getRevenueByCampaign();
  const revenueByChannel = getRevenueByChannel();

  return {
    ...revenueStats,
    byCampaign: revenueByCampaign,
    byChannel: revenueByChannel,
  };
}

/* ---------------------------------------------------------------- Dashboard Summary */

function getDashboardSummary() {
  const crmStats = getCrmStats();
  const campaignStats = getCampaignStats();
  const pipelineStats = getPipelineStats();
  const revenueStats = getRevenueStats();
  const automationStats = getAutomationStats();
  const funnel = getFunnelMetrics();
  const campaignROI = getCampaignROI();

  return {
    timestamp: new Date().toISOString(),
    crm: {
      totalCustomers: crmStats.totalCustomers,
      totalLeads: crmStats.totalLeads,
      totalContacts: crmStats.totalContacts,
      conversionRate: crmStats.conversionRate,
      totalLifetimeValue: crmStats.totalLifetimeValue,
    },
    campaigns: {
      totalCampaigns: campaignStats.totalCampaigns,
      activeCampaigns: campaignStats.activeCampaigns,
      totalImpressions: campaignStats.totalImpressions,
      totalClicks: campaignStats.totalClicks,
      totalConversions: campaignStats.totalConversions,
      totalCost: campaignStats.totalCost,
      totalRevenue: campaignStats.totalRevenue,
      ctr: campaignStats.ctr,
      conversionRate: campaignStats.conversionRate,
      roas: campaignStats.roas,
    },
    pipeline: {
      totalDeals: pipelineStats.totalDeals,
      totalValue: pipelineStats.totalValue,
      weightedPipeline: pipelineStats.weightedPipeline,
      openValue: pipelineStats.openValue,
      wonValue: pipelineStats.wonValue,
      lostValue: pipelineStats.lostValue,
      averageDealSize: pipelineStats.averageDealSize,
    },
    revenue: {
      totalRevenue: revenueStats.totalRevenue,
      receivedRevenue: revenueStats.receivedRevenue,
      pendingRevenue: revenueStats.pendingRevenue,
      totalCommission: revenueStats.totalCommission,
      paidCommission: revenueStats.paidCommission,
      pendingCommission: revenueStats.pendingCommission,
    },
    automation: {
      totalTemplates: automationStats.totalTemplates,
      totalSequences: automationStats.totalSequences,
      totalExecutions: automationStats.totalExecutions,
      activeExecutions: automationStats.activeExecutions,
      completedExecutions: automationStats.completedExecutions,
    },
    funnel,
    topCampaignsByROI: campaignROI.slice(0, 5),
  };
}

/* ---------------------------------------------------------------- Export */

module.exports = {
  getFunnelMetrics,
  getCampaignROI,
  getRevenueAnalytics,
  getDashboardSummary,
  DateRangeSchema,
  FunnelMetricsSchema,
  CampaignROISchema,
};
