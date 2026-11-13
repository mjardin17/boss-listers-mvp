import { resolveSession } from "../../../lib/supabaseAuth";
import { MultiPlatformPoster } from "../../../lib/multiPlatformPoster";
import { createClient } from "@supabase/supabase-js";
import { postSavedProduct } from "../../../lib/postSavedProduct";

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

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ ok: false, error: "Supabase not configured" });
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Dry run unless the body carries confirmLive: "PUBLISH_LIVE" (see lib/postSavedProduct).
    const { status, json } = await postSavedProduct({
      tenantId: session.tenantId,
      body: req.body,
      poster,
      loadProduct: async (sku) => {
        const { data, error } = await supabase
          .from("products")
          .select("*")
          .eq("sku", sku)
          .eq("tenant_id", session.tenantId)
          .single();
        return error ? null : data;
      },
    });
    return res.status(status).json(json);
  } catch (err) {
    console.error("[api/inventory/post-to-platforms]", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
