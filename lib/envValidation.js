import { logWarn } from "./serverLog";

let checked = false;

export function validateServerEnvironment() {
  if (checked) return;
  checked = true;

  const warnings = [];
  const openAiKey = String(process.env.OPENAI_API_KEY || "").trim();
  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const supabaseAnonKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();

  if (
    !openAiKey ||
    /^(your_key_here|paste_key_here|PASTE_KEY_HERE|sk-(x+|_+)|sk-placeholder|placeholder|null|undefined)$/i.test(
      openAiKey
    )
  ) {
    warnings.push("OPENAI_API_KEY is missing or placeholder; vision scans will use fallback mode.");
  }

  if (Boolean(supabaseUrl) !== Boolean(supabaseAnonKey)) {
    warnings.push(
      "Supabase env is partially configured; persistence will fall back until URL and anon key are both set."
    );
  }

  if (supabaseUrl && !/^https:\/\/.+\.supabase\.co$/i.test(supabaseUrl)) {
    warnings.push("NEXT_PUBLIC_SUPABASE_URL does not look like a standard Supabase project URL.");
  }

  warnings.forEach((warning) => logWarn("env.validation.warning", { warning }));
}
