import { createClient } from "@supabase/supabase-js";
import { resolveSession } from "../../../lib/supabaseAuth";

export default async function handler(req, res) {
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

  if (req.method === "GET") {
    return handleGetOrders(session, req, res);
  }

  return res.status(405).json({ ok: false, error: "Method not allowed" });
}

async function handleGetOrders(session, req, res) {
  const { page = 1, limit = 50, status, marketplace, search } = req.query;

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    let query = supabase
      .from("orders")
      .select(
        `
        *,
        order_items(*)
      `,
        { count: "exact" }
      )
      .eq("tenant_id", session.tenantId);

    if (status) query = query.eq("order_status", status);
    if (marketplace) query = query.eq("marketplace", marketplace);

    // Search by buyer name, email, or order ID
    if (search) {
      query = query.or(
        `buyer_name.ilike.%${search}%,buyer_email.ilike.%${search}%,marketplace_order_id.ilike.%${search}%`
      );
    }

    // Pagination
    const offset = (page - 1) * limit;
    query = query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

    const { data: orders, error, count } = await query;

    if (error) throw error;

    return res.status(200).json({
      ok: true,
      orders: orders || [],
      total: count || 0,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil((count || 0) / limit),
    });
  } catch (err) {
    console.error("[api/orders]", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
