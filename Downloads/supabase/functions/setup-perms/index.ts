import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  const authHeader = req.headers.get("Authorization")
  if (!authHeader) {
    return new Response("Unauthorized", { status: 401 })
  }

  try {
    const { data, error } = await globalThis.sql`
      GRANT SELECT ON public.products TO service_role;
      GRANT UPDATE ON public.products TO service_role;
    `

    if (error) throw error

    return new Response(
      JSON.stringify({ ok: true, message: "Permissions granted" }),
      { headers: { "Content-Type": "application/json" } },
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
})
