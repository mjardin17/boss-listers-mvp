import { resolveSession } from "../../../lib/supabaseAuth";
import { MultiPlatformPoster } from "../../../lib/multiPlatformPoster";
import { createClient } from "@supabase/supabase-js";

const poster = new MultiPlatformPoster();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization || "";
  const userAccessToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  const session = userAccessToken
    ? await resolveSession(process.env, userAccessToken)
    : null;

  if (!session) {
    return res.status(401).json({ ok: false, error: "Not authenticated" });
  }

  const { productSKU, platforms = ["ebay"] } = req.body || {};

  if (!productSKU) {
    return res
      .status(400)
      .json({ ok: false, error: "productSKU is required" });
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: product, error: fetchError } = await supabase
      .from("products")
      .select("*")
      .eq("sku", productSKU)
      .eq("tenant_id", session.tenantId)
      .single();

    if (fetchError || !product) {
      return res.status(404).json({ ok: false, error: "Product not found" });
    }

    const results = await poster.postToAllPlatforms(
      session.tenantId,
      product,
      platforms
    );

    const successCount = Object.values(results).filter((r) => r.success).length;

    return res.status(200).json({
      ok: true,
      results,
      successCount,
      totalPlatforms: platforms.length,
    });
  } catch (err) {
    console.error("[api/inventory/post-to-platforms]", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
