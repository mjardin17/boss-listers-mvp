import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) {
    return res.status(401).json({ ok: false, error: "No bearer token" });
  }

  let tenantId;
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user?.id) throw new Error("Invalid token");
    tenantId = data.user.id;
  } catch {
    return res.status(401).json({ ok: false, error: "Invalid authentication" });
  }

  try {
    const { data, error } = await supabase.rpc("get_marketplace_connection_status", {
      p_tenant_id: tenantId,
      p_marketplace: "shopify",
    });

    if (error) throw error;

    return res.status(200).json({
      ok: true,
      connected: data?.connected || false,
      account_identifier: data?.account_identifier || null,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
