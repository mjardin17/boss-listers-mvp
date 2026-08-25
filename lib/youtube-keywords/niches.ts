import type { CompetitionLevel, NicheMetric } from "./types";

const rawNiches: Array<Omit<NicheMetric, "opportunityScore">> = [
  {
    nicheName: "AI Automation Blueprints",
    category: "AI",
    avgCpm: 42.5,
    marketDemandScore: 94,
    competitionLevel: "Medium"
  },
  {
    nicheName: "Faceless TikTok/Shorts Curation",
    category: "Creator Economy",
    avgCpm: 18.75,
    marketDemandScore: 99,
    competitionLevel: "High"
  },
  {
    nicheName: "Personal Finance for Gen Z",
    category: "Finance",
    avgCpm: 36.2,
    marketDemandScore: 91,
    competitionLevel: "High"
  },
  {
    nicheName: "Cybersecurity Home Labs",
    category: "Tech",
    avgCpm: 31.8,
    marketDemandScore: 82,
    competitionLevel: "Medium"
  },
  {
    nicheName: "AI Coding Agent Workflows",
    category: "AI",
    avgCpm: 47.25,
    marketDemandScore: 88,
    competitionLevel: "Medium"
  },
  {
    nicheName: "Micro SaaS Build Logs",
    category: "Tech",
    avgCpm: 39.4,
    marketDemandScore: 79,
    competitionLevel: "Low"
  },
  {
    nicheName: "Longevity Supplements Explained",
    category: "Health",
    avgCpm: 27.65,
    marketDemandScore: 84,
    competitionLevel: "Medium"
  },
  {
    nicheName: "Remote Career Pivot Guides",
    category: "Lifestyle",
    avgCpm: 24.1,
    marketDemandScore: 87,
    competitionLevel: "Medium"
  },
  {
    nicheName: "EV Ownership Cost Breakdowns",
    category: "Automotive",
    avgCpm: 22.45,
    marketDemandScore: 76,
    competitionLevel: "Low"
  },
  {
    nicheName: "Real Estate AI Lead Generation",
    category: "Finance",
    avgCpm: 55.5,
    marketDemandScore: 73,
    competitionLevel: "Medium"
  },
  {
    nicheName: "Home Energy Independence",
    category: "Lifestyle",
    avgCpm: 29.8,
    marketDemandScore: 78,
    competitionLevel: "Low"
  },
  {
    nicheName: "No-Code Internal Tools",
    category: "Tech",
    avgCpm: 34.9,
    marketDemandScore: 81,
    competitionLevel: "Medium"
  },
  {
    nicheName: "B2B Sales Playbooks",
    category: "Business",
    avgCpm: 44.1,
    marketDemandScore: 75,
    competitionLevel: "Low"
  },
  {
    nicheName: "AI-Enhanced Homeschooling",
    category: "Education",
    avgCpm: 21.7,
    marketDemandScore: 86,
    competitionLevel: "Low"
  },
  {
    nicheName: "Luxury Travel Points Systems",
    category: "Travel",
    avgCpm: 33.6,
    marketDemandScore: 72,
    competitionLevel: "Medium"
  }
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function competitionMultiplier(level: CompetitionLevel) {
  if (level === "Low") return 0.96;
  if (level === "Medium") return 0.72;
  return 0.46;
}

export function calculateOpportunityScore(
  avgCpm: number,
  marketDemandScore: number,
  competitionLevel: CompetitionLevel
) {
  const normalizedCpm = clamp(avgCpm / 60, 0, 1);
  const normalizedDemand = clamp(marketDemandScore / 100, 0, 1);
  const monetizationDemandBlend = normalizedCpm * 0.46 + normalizedDemand * 0.54;
  const score = 100 * monetizationDemandBlend * competitionMultiplier(competitionLevel);

  return clamp(Math.round(score), 1, 100);
}

export function generateTopPerformingNiches(): NicheMetric[] {
  return rawNiches
    .map((niche) => ({
      ...niche,
      opportunityScore: calculateOpportunityScore(
        niche.avgCpm,
        niche.marketDemandScore,
        niche.competitionLevel
      )
    }))
    .sort((a, b) => b.opportunityScore - a.opportunityScore);
}
