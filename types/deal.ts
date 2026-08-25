export type Marketplace = "eBay";

export type DealDecision = "BUY" | "SKIP";

export type SoldCompData = {
  averageSoldPrice: number;
  sellThroughRate: number;
  sampleSales: number;
};

export type DealInput = {
  itemName: string;
  marketplace: Marketplace;
  buyCost: number;
  shippingEstimate: number;
  photoName?: string;
};

export type DealMetrics = {
  soldPrice: number;
  marketplaceFee: number;
  shippingCost: number;
  buyCost: number;
  profit: number;
  margin: number;
  roi: number;
  decision: DealDecision;
};

export type DealAnalysis = {
  id: string;
  createdAt: string;
  input: DealInput;
  comps: SoldCompData;
  metrics: DealMetrics;
};
