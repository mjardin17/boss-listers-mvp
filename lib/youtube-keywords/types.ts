export type KeywordMetric = {
  seedKeyword: string;
  relatedKeyword: string;
  searchVolume: number;
  competitionIndex: number;
  magicScore: number;
};

export type SavedKeyword = KeywordMetric & {
  id: string;
  userId: string;
  createdAt: string;
};

export type CompetitionLevel = "Low" | "Medium" | "High";

export type NicheMetric = {
  nicheName: string;
  category: string;
  avgCpm: number;
  marketDemandScore: number;
  competitionLevel: CompetitionLevel;
  opportunityScore: number;
};

export type TrackedNiche = NicheMetric & {
  id: string;
  userId: string;
  createdAt: string;
};

export type CouncilPersonaName =
  | "The Strategist"
  | "The Financial Analyst"
  | "The Architect";

export type CouncilExpertResponse = {
  personaName: CouncilPersonaName;
  title: string;
  feedback: string;
  actionabilityScore: number;
};

export type CouncilConsultation = {
  id: string;
  userId: string;
  userPrompt: string;
  expertResponses: CouncilExpertResponse[];
  createdAt: string;
};

export type SortKey = "relatedKeyword" | "searchVolume" | "competitionIndex" | "magicScore";

export type NicheSortKey =
  | "nicheName"
  | "category"
  | "avgCpm"
  | "marketDemandScore"
  | "competitionLevel"
  | "opportunityScore";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };
