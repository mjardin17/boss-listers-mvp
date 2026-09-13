// PUT /api/inventory/[sku] - Update a product
// DELETE /api/inventory/[sku] - Delete a product

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

export default async function handler(req, res) {
  const { sku } = req.query;

  if (!sku) {
    return res.status(400).json({ ok: false, error: "SKU is required" });
  }

  if (req.method === "PUT") {
    return handlePut(req, res, sku);
  } else if (req.method === "DELETE") {
    return handleDelete(req, res, sku);
  } else {
    res.setHeader("Allow", "PUT, DELETE");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
}

async function handlePut(req, res, sku) {
  try {
    const { title, description, price, quantity } = req.body;

    // Validation
    if (!title?.trim()) {
      return res.status(400).json({ ok: false, error: "Title is required" });
    }
    if (typeof price !== "number" || price < 0) {
      return res.status(400).json({ ok: false, error: "Valid price is required" });
    }
    if (typeof quantity !== "number" || quantity < 0) {
      return res.status(400).json({ ok: false, error: "Valid quantity is required" });
    }

    // Check if product exists
    const { data: existing } = await supabase
      .from("listings")
      .select("sku")
      .eq("sku", sku)
      .single();

    if (!existing) {
      return res.status(404).json({ ok: false, error: "Product not found" });
    }

    // Update product
    const { data: product, error } = await supabase
      .from("listings")
      .update({
        title: title.trim(),
        description: description?.trim() || "",
        price: parseFloat(price),
        quantity: parseInt(quantity),
        updated_at: new Date().toISOString(),
      })
      .eq("sku", sku)
      .select()
      .single();

    if (error) {
      console.error("[api/inventory PUT] Update error:", error.message);
      return res.status(400).json({ ok: false, error: error.message });
    }

    return res.status(200).json({
      ok: true,
      product: {
        sku: product.sku,
        title: product.title,
        description: product.description,
        price: product.price,
        quantity: product.quantity,
        last_updated: product.updated_at,
      },
    });
  } catch (err) {
    console.error("[api/inventory PUT] Error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

async function handleDelete(req, res, sku) {
  try {
    // Check if product exists
    const { data: existing } = await supabase
      .from("listings")
      .select("sku")
      .eq("sku", sku)
      .single();

    if (!existing) {
      return res.status(404).json({ ok: false, error: "Product not found" });
    }

    // Delete product
    const { error } = await supabase
      .from("listings")
      .delete()
      .eq("sku", sku);

    if (error) {
      console.error("[api/inventory DELETE] Delete error:", error.message);
      return res.status(400).json({ ok: false, error: error.message });
    }

    return res.status(200).json({
      ok: true,
      message: `Product "${sku}" deleted successfully`,
    });
  } catch (err) {
    console.error("[api/inventory DELETE] Error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
