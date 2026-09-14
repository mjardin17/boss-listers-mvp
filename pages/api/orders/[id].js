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

  const { id } = req.query;

  if (req.method === "GET") {
    return handleGetOrder(session, id, res);
  }

  if (req.method === "PATCH") {
    return handleUpdateOrder(session, id, req, res);
  }

  return res.status(405).json({ ok: false, error: "Method not allowed" });
}

async function handleGetOrder(session, orderId, res) {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: order, error } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("id", orderId)
      .eq("tenant_id", session.tenantId)
      .single();

    if (error) throw error;
    if (!order) {
      return res.status(404).json({ ok: false, error: "Order not found" });
    }

    return res.status(200).json({ ok: true, order });
  } catch (err) {
    console.error("[api/orders/[id]]", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

async function handleUpdateOrder(session, orderId, req, res) {
  const { order_status, tracking_number, carrier, notes } = req.body || {};

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Verify order belongs to tenant
    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .eq("tenant_id", session.tenantId)
      .single();

    if (fetchError || !order) {
      return res.status(404).json({ ok: false, error: "Order not found" });
    }

    // Prepare update
    const updateData = { updated_at: new Date().toISOString() };

    if (order_status) updateData.order_status = order_status;
    if (tracking_number) updateData.tracking_number = tracking_number;
    if (carrier) updateData.carrier = carrier;
    if (notes !== undefined) updateData.notes = notes;

    // If marking as shipped, set shipped_at
    if (order_status === "shipped" && !order.shipped_at) {
      updateData.shipped_at = new Date().toISOString();
    }

    // Update order
    const { data: updatedOrder, error: updateError } = await supabase
      .from("orders")
      .update(updateData)
      .eq("id", orderId)
      .eq("tenant_id", session.tenantId)
      .select("*, order_items(*)")
      .single();

    if (updateError) throw updateError;

    // TODO: Sync status update back to marketplace
    // For now, just update locally

    return res.status(200).json({ ok: true, order: updatedOrder });
  } catch (err) {
    console.error("[api/orders/[id] PATCH]", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
