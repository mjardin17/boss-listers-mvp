import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    let product = body;

    // If a productId is passed, fetch fresh record from database
    if (body.productId && supabase) {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", body.productId)
        .single();
      if (!error && data) {
        product = { ...data, ...body };
      }
    }

    // STRICT PRICE RULE: Use record price. If none set, STOP and fail loudly — never invent one.
    const price = product.price;
    if (price === undefined || price === null || price === "" || Number(price) <= 0) {
      return res.status(400).json({
        ok: false,
        error: "CRITICAL: Product record has no price set. STOPPING — never invent one.",
      });
    }

    const title = product.title || product.name || "Product";
    const brand = product.brand || "";
    const condition = product.condition || "new";
    const freeShipping = product.freeShipping !== undefined ? Boolean(product.freeShipping) : true;
    const slug = product.slug || (title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)) || "commercial";

    // Gather stills & turntable clip
    let stills = [];
    if (Array.isArray(product.stills) && product.stills.length > 0) {
      stills = product.stills;
    } else if (Array.isArray(product.keyframes) && product.keyframes.length > 0) {
      stills = product.keyframes.map((k) => (typeof k === "string" ? k : k.url)).filter(Boolean);
    } else {
      // Default fallbacks in public if available
      const defaults = [
        path.join(process.cwd(), "public/styleframes/wc-shorts/styleframe_amazon_white_front_0deg.png"),
        path.join(process.cwd(), "public/styleframes/wc-shorts/styleframe_amazon_white_angle_45deg.png"),
        path.join(process.cwd(), "public/styleframes/wc-shorts/styleframe_amazon_white_profile_90deg.png"),
      ];
      stills = defaults.filter((p) => fs.existsSync(p));
    }

    // Map stills to absolute disk paths if relative
    const resolvedStills = stills.map((s) => {
      if (typeof s === "string" && s.startsWith("/")) {
        return path.join(process.cwd(), "public", s);
      }
      return s;
    });

    let turntableClip = product.turntable_clip || product.styleframe_video || null;
    if (turntableClip && turntableClip.startsWith("/")) {
      turntableClip = path.join(process.cwd(), "public", turntableClip);
    }

    const payload = {
      title,
      brand,
      condition,
      price: Number(price),
      freeShipping,
      slug,
      stills: resolvedStills,
      turntable_clip: turntableClip,
    };

    // Call Python Commercial Cutter script
    const scriptPath = path.join(process.cwd(), "scripts", "commercial_cutter.py");
    const pyProcess = spawn("python", [scriptPath, "--json", JSON.stringify(payload)], {
      cwd: process.cwd(),
    });

    let stdoutData = "";
    let stderrData = "";

    pyProcess.stdout.on("data", (d) => {
      stdoutData += d.toString();
    });
    pyProcess.stderr.on("data", (d) => {
      stderrData += d.toString();
    });

    pyProcess.on("close", async (code) => {
      if (code !== 0) {
        return res.status(500).json({
          ok: false,
          error: `Commercial cutter failed with code ${code}`,
          details: stderrData || stdoutData,
        });
      }

      try {
        const jsonMatch = stdoutData.match(/SUMMARY_JSON:\s*(\{[\s\S]*\})/);
        if (!jsonMatch) {
          return res.status(500).json({
            ok: false,
            error: "Failed to parse cutter output summary",
            raw: stdoutData,
          });
        }

        const results = JSON.parse(jsonMatch[1]);

        // If productId is available and Supabase configured, update product record
        if (product.id && supabase) {
          const mediaObj = {
            commercial_tiktok_url: results.tiktok?.url || null,
            commercial_instagram_url: results.instagram?.url || null,
            commercial_facebook_url: results.facebook?.url || null,
          };

          // Merge into existing STYLEFRAME_MEDIA if present
          let currentDesc = product.description || "";
          let mergedMedia = { ...mediaObj };
          const match = currentDesc.match(/<!-- STYLEFRAME_MEDIA:\s*(\{.*?\})\s*-->/);
          if (match) {
            try {
              const existing = JSON.parse(match[1]);
              mergedMedia = { ...existing, ...mediaObj };
            } catch {}
            currentDesc = currentDesc.replace(
              /<!-- STYLEFRAME_MEDIA:\s*\{.*?\}\s*-->/,
              `<!-- STYLEFRAME_MEDIA: ${JSON.stringify(mergedMedia)} -->`
            );
          } else {
            currentDesc = `${currentDesc}\n\n<!-- STYLEFRAME_MEDIA: ${JSON.stringify(mergedMedia)} -->`;
          }

          await supabase
            .from("products")
            .update({ description: currentDesc })
            .eq("id", product.id);
        }

        return res.status(200).json({
          ok: true,
          commercials: results,
        });
      } catch (parseErr) {
        return res.status(500).json({
          ok: false,
          error: "Error processing cutter results",
          message: parseErr.message,
        });
      }
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
