import { NextResponse } from "next/server";
import { lookupProductByBarcode } from "../../../../lib/productLookupService";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const upc = searchParams.get("upc") || searchParams.get("barcode") || "";
  const product = upc ? await lookupProductByBarcode(upc) : null;
  return NextResponse.json({
    ok: true,
    platform: "walmart",
    upc,
    product,
    sourceCostOnly: product?.walmartPrice ?? null,
    resaleAuthority: "Sold comps only",
    unavailable: !product?.title,
    reason: product?.title ? "" : "Walmart UPC enrichment unavailable."
  });
}
