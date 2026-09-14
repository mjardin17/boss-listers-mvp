import { useState } from "react";
import { setSession, getSession } from "../lib/clientAuth";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function supabaseAuthCall(path, body) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.msg || data.error_description || "Request failed");
  return data;
}

async function createTenant(accessToken, tenantName) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_tenant_for_user`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_name: tenantName }),
  });
  if (!res.ok) throw new Error(`Couldn't set up your workspace (${res.status})`);
}

// create_tenant_for_user always INSERTs a new tenant — calling it on every
// sign-in would create a duplicate workspace per login. Check membership
// first (RLS-scoped to the caller's own rows) and only create one if truly
// missing — the real gap when Supabase requires email confirmation: signup
// never got to call createTenant() because it only had an access_token on
// auto-confirm, so the user is left permanently "authenticated but no
// tenant" until sign-in backfills it here.
async function hasTenant(accessToken) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/tenant_members?select=tenant_id&limit=1`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Couldn't check your workspace (${res.status})`);
  const rows = await res.json();
  return rows.length > 0;
}

export default function Login() {
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");

    try {
      if (mode === "signup") {
        const auth = await supabaseAuthCall("/auth/v1/signup", { email, password });
        if (!auth.access_token) {
          setError("Check your email to confirm your account, then sign in.");
          setMode("signin");
          setBusy(false);
          return;
        }
        await createTenant(auth.access_token, businessName || `${email}'s workspace`);
        setSession({ accessToken: auth.access_token, refreshToken: auth.refresh_token, email });
      } else {
        const auth = await supabaseAuthCall("/auth/v1/token?grant_type=password", { email, password });
        if (!(await hasTenant(auth.access_token))) {
          await createTenant(auth.access_token, `${email}'s workspace`);
        }
        setSession({ accessToken: auth.access_token, refreshToken: auth.refresh_token, email });
      }
      window.location.href = "/capture";
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell" style={{ maxWidth: 420, paddingTop: "4rem" }}>
      <h1 style={{ marginBottom: "0.25rem" }}>Boss Listers</h1>
      <p className="muted" style={{ marginBottom: "2rem" }}>
        {mode === "signup" ? "Create your workspace" : "Sign in to your workspace"}
      </p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {mode === "signup" && (
          <input
            type="text"
            placeholder="Business or store name"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
          />
        )}
        <input
          type="email"
          placeholder="Email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Working..." : mode === "signup" ? "Create workspace" : "Sign in"}
        </button>
      </form>

      <p style={{ marginTop: "1.5rem" }}>
        {mode === "signup" ? "Already have a workspace?" : "New here?"}{" "}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setMode(mode === "signup" ? "signin" : "signup");
            setError("");
          }}
        >
          {mode === "signup" ? "Sign in" : "Create one"}
        </a>
      </p>
    </div>
  );
}
