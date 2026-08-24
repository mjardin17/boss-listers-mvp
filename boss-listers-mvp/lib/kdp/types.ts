export type KdpAuthorInput = {
  id?: string;
  penName: string;
  legalName?: string;
  bio?: string;
  brandVoice?: string;
  websiteUrl?: string;
  socialLinks?: Record<string, string>;
};

export type KdpSeriesInput = {
  id?: string;
  title?: string;
  subtitle?: string;
  description?: string;
  genre?: string;
  targetReader?: string;
  seriesNumber?: number;
};

export type KdpBookInput = {
  id?: string;
  title: string;
  subtitle?: string;
  language?: string;
  genre?: string;
  audience?: string;
  manuscript: string;
  trimSize?: "5x8" | "5.5x8.5" | "6x9";
};

export type KdpPackageInput = {
  author: KdpAuthorInput;
  book: KdpBookInput;
  series?: KdpSeriesInput;
};

export type KdpCategory = {
  path: string;
  rationale: string;
};

export type KdpSeriesPage = {
  title: string;
  subtitle: string;
  description: string;
  readingOrder: Array<{
    title: string;
    position: number;
  }>;
};

export type KdpMetadataPackage = {
  title: string;
  subtitle: string;
  authorName: string;
  language: string;
  genre: string;
  audience: string;
  descriptionPlain: string;
  descriptionHtml: string;
  authorBio: string;
  categories: KdpCategory[];
  keywords: string[];
  series?: KdpSeriesPage;
  trimSize: string;
  exportReadiness: {
    ebook: boolean;
    paperback: boolean;
    docx: boolean;
  };
  complianceWarnings: string[];
  generatedAt: string;
};

export type KdpPackage = {
  input: KdpPackageInput;
  metadata: KdpMetadataPackage;
};

export type ExportResult = {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
};
