import { createHash, randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import type { ExportResult, KdpPackage } from "./types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

export function canPersistKdp(userId?: string) {
  return Boolean(userId && UUID_PATTERN.test(userId) && getServerSupabase());
}

export async function persistKdpPackage(userId: string | undefined, packageData: KdpPackage) {
  if (!canPersistKdp(userId)) return null;
  const supabase = getServerSupabase();
  if (!supabase || !userId) return null;

  const now = new Date().toISOString();
  const authorId = packageData.input.author.id || randomUUID();
  const bookId = packageData.input.book.id || randomUUID();
  const seriesId = packageData.input.series?.title ? packageData.input.series.id || randomUUID() : null;

  const { error: authorError } = await supabase.from("authors").upsert(
    {
      id: authorId,
      user_id: userId,
      pen_name: packageData.input.author.penName,
      legal_name: packageData.input.author.legalName || null,
      bio: packageData.metadata.authorBio,
      brand_voice: packageData.input.author.brandVoice || "",
      website_url: packageData.input.author.websiteUrl || null,
      social_links: packageData.input.author.socialLinks || {},
      updated_at: now
    },
    { onConflict: "id" }
  );
  if (authorError) throw authorError;

  if (seriesId && packageData.input.series) {
    const { error: seriesError } = await supabase.from("series").upsert(
      {
        id: seriesId,
        user_id: userId,
        author_id: authorId,
        title: packageData.input.series.title,
        subtitle: packageData.input.series.subtitle || null,
        description: packageData.metadata.series?.description || packageData.input.series.description || "",
        genre: packageData.input.series.genre || packageData.metadata.genre,
        target_reader: packageData.input.series.targetReader || packageData.metadata.audience,
        reading_order: packageData.metadata.series?.readingOrder || [],
        metadata: packageData.metadata.series || {},
        updated_at: now
      },
      { onConflict: "id" }
    );
    if (seriesError) throw seriesError;
  }

  const { error: bookError } = await supabase.from("books").upsert(
    {
      id: bookId,
      user_id: userId,
      author_id: authorId,
      series_id: seriesId,
      series_number: packageData.input.series?.seriesNumber || null,
      title: packageData.metadata.title,
      subtitle: packageData.metadata.subtitle || null,
      language: packageData.metadata.language,
      genre: packageData.metadata.genre,
      audience: packageData.metadata.audience,
      manuscript: packageData.input.book.manuscript,
      trim_size: packageData.metadata.trimSize,
      publication_status: "packaged",
      metadata: packageData.metadata,
      updated_at: now
    },
    { onConflict: "id" }
  );
  if (bookError) throw bookError;

  const { data, error: packageError } = await supabase
    .from("kdp_packages")
    .insert({
      user_id: userId,
      book_id: bookId,
      package_status: "generated",
      description_html: packageData.metadata.descriptionHtml,
      description_plain: packageData.metadata.descriptionPlain,
      author_bio: packageData.metadata.authorBio,
      categories: packageData.metadata.categories,
      keywords: packageData.metadata.keywords,
      series_page: packageData.metadata.series || {},
      metadata_package: packageData.metadata,
      compliance_warnings: packageData.metadata.complianceWarnings
    })
    .select("id")
    .single();
  if (packageError) throw packageError;

  return {
    authorId,
    seriesId,
    bookId,
    packageId: data.id as string
  };
}

export async function persistKdpExport({
  userId,
  bookId,
  packageId,
  exportType,
  exportResult
}: {
  userId?: string;
  bookId?: string;
  packageId?: string;
  exportType: "pdf" | "epub" | "docx" | "metadata";
  exportResult: ExportResult;
}) {
  if (!canPersistKdp(userId)) return null;
  const supabase = getServerSupabase();
  if (!supabase || !userId) return null;
  const checksum = createHash("sha256").update(exportResult.buffer).digest("hex");
  const { data, error } = await supabase
    .from("exports")
    .insert({
      user_id: userId,
      book_id: bookId || null,
      kdp_package_id: packageId || null,
      export_type: exportType,
      file_name: exportResult.fileName,
      mime_type: exportResult.mimeType,
      byte_size: exportResult.buffer.byteLength,
      checksum,
      status: "generated",
      metadata: { checksumAlgorithm: "sha256" }
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}
