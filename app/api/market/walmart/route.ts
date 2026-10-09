import { NextResponse } from "next/server";
import { withSession } from "../../../../lib/requireSessionApp";
import { lookupProductByBarcode } from "../../../../lib/productLookupService";

export const runtime = "nodejs";

async function GET_handler(req: Request) {
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

export const GET = withSession(GET_handler);
