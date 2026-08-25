import { NextResponse } from "next/server";
import { z } from "zod";
import { buildKdpPackage } from "../../../lib/kdp/metadata";
import { persistKdpExport, persistKdpPackage } from "../../../lib/kdp/repository";
import type { ExportResult, KdpPackage, KdpPackageInput } from "../../../lib/kdp/types";

const packageSchema = z.object({
  userId: z.string().optional(),
  author: z.object({
    id: z.string().optional(),
    penName: z.string().min(1),
    legalName: z.string().optional(),
    bio: z.string().optional(),
    brandVoice: z.string().optional(),
    websiteUrl: z.string().optional(),
    socialLinks: z.record(z.string(), z.string()).optional()
  }),
  series: z.object({
    id: z.string().optional(),
    title: z.string().optional(),
    subtitle: z.string().optional(),
    description: z.string().optional(),
    genre: z.string().optional(),
    targetReader: z.string().optional(),
    seriesNumber: z.coerce.number().optional()
  }).optional(),
  book: z.object({
    id: z.string().optional(),
    title: z.string().min(1),
    subtitle: z.string().optional(),
    language: z.string().optional(),
    genre: z.string().optional(),
    audience: z.string().optional(),
    manuscript: z.string().min(1),
    trimSize: z.enum(["5x8", "5.5x8.5", "6x9"]).optional()
  })
});

export async function parseKdpRequest(request: Request): Promise<{
  userId?: string;
  packageData: KdpPackage;
  persisted?: Awaited<ReturnType<typeof persistKdpPackage>>;
}> {
  const json = await request.json();
  const parsed = packageSchema.parse(json);
  const input: KdpPackageInput = {
    author: parsed.author,
    series: parsed.series,
    book: parsed.book
  };
  const packageData = buildKdpPackage(input);
  const persisted = await persistKdpPackage(parsed.userId, packageData);
  return { userId: parsed.userId, packageData, persisted };
}

export async function exportResponse({
  userId,
  packageData,
  persisted,
  exportType,
  exportResult
}: {
  userId?: string;
  packageData: KdpPackage;
  persisted?: Awaited<ReturnType<typeof persistKdpPackage>>;
  exportType: "pdf" | "epub" | "docx" | "metadata";
  exportResult: ExportResult;
}) {
  await persistKdpExport({
    userId,
    bookId: persisted?.bookId || packageData.input.book.id,
    packageId: persisted?.packageId,
    exportType,
    exportResult
  });

  return new NextResponse(new Uint8Array(exportResult.buffer), {
    headers: {
      "Content-Type": exportResult.mimeType,
      "Content-Disposition": `attachment; filename="${exportResult.fileName}"`,
      "Content-Length": String(exportResult.buffer.byteLength),
      "Cache-Control": "no-store"
    }
  });
}

export function kdpErrorResponse(error: unknown) {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { ok: false, error: "Invalid KDP package input.", issues: error.issues },
      { status: 400 }
    );
  }
  const message = error instanceof Error ? error.message : "KDP publishing request failed.";
  return NextResponse.json({ ok: false, error: message }, { status: 500 });
}
