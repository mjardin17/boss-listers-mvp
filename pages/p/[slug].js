// pages/p/[slug].js
// PUBLIC landing page for a Business Center campaign (no login).
// middleware.js excludes /p/ from the site gate. The page only renders while
// its campaign is active; otherwise it returns 404. Leads go to /api/lead/[slug].

import { useState } from "react";
import Head from "next/head";

export async function getServerSideProps({ params }) {
  const { getPublicLanding } = require("../../lib/universal-creative/business-center.js");
  const page = getPublicLanding(String(params?.slug || ""));
  if (!page) return { notFound: true };
  return { props: { page } };
}

const styles = {
  page: { minHeight: "100vh", background: "#faf7f2", color: "#1a1a1a", position: "relative" },
  wrap: { maxWidth: 560, margin: "0 auto", padding: "48px 16px", fontFamily: "system-ui, sans-serif", color: "#1a1a1a", background: "transparent" },
  biz: { fontSize: 14, letterSpacing: 1, textTransform: "uppercase", color: "#666" },
  h1: { fontSize: 34, lineHeight: 1.15, margin: "8px 0 16px", color: "#1a1a1a", background: "none", WebkitTextFillColor: "#1a1a1a" },
  text: { whiteSpace: "pre-line", lineHeight: 1.5, color: "#333" },
  offer: { background: "#fff4d6", borderRadius: 8, padding: "10px 14px", fontWeight: 600, margin: "16px 0" },
  label: { display: "block", fontSize: 14, margin: "12px 0 4px", color: "#333" },
  input: { width: "100%", padding: "12px", fontSize: 16, border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box", background: "#fff", color: "#1a1a1a" },
  consent: { display: "flex", flexDirection: "row", justifyContent: "flex-start", textAlign: "left", gap: 10, alignItems: "center", margin: "16px 0 4px", fontSize: 15, color: "#333" },
  check: { width: 20, height: 20, margin: 0, flex: "0 0 auto" },
  btn: { marginTop: 18, width: "100%", padding: 14, fontSize: 17, fontWeight: 700, border: 0, borderRadius: 8, background: "#1a1a1a", color: "#fff", cursor: "pointer" },
  trap: { position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" },
};

export default function LandingPage({ page }) {
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", timeline: "", consent: false, website: "" });
  const [status, setStatus] = useState({ state: "idle", message: "" });
  const [idemKey] = useState(() => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())));

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  async function submit(e) {
    e.preventDefault();
    setStatus({ state: "sending", message: "" });
    try {
      const res = await fetch(`/api/lead/${encodeURIComponent(page.slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idemKey },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "Something went wrong. Please try again.");
      setStatus({ state: "done", message: "Thanks! We'll be in touch soon." });
    } catch (err) {
      setStatus({ state: "error", message: err.message });
    }
  }

  return (
    <div style={styles.page}>
    <main style={styles.wrap}>
      <Head>
        <title>{page.headline}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      {page.business ? <div style={styles.biz}>{page.business}</div> : null}
      <h1 style={styles.h1}>{page.headline}</h1>
      {page.body ? <p style={styles.text}>{page.body}</p> : null}
      {page.offer ? <div style={styles.offer}>{page.offer}</div> : null}

      {status.state === "done" ? (
        <p role="status" style={{ fontSize: 18, fontWeight: 600, color: "#1a6b3a" }}>{status.message}</p>
      ) : (
        <form onSubmit={submit} noValidate>
          <label style={styles.label} htmlFor="firstName">First name</label>
          <input id="firstName" style={styles.input} required autoComplete="given-name" value={form.firstName} onChange={set("firstName")} />
          <label style={styles.label} htmlFor="lastName">Last name</label>
          <input id="lastName" style={styles.input} required autoComplete="family-name" value={form.lastName} onChange={set("lastName")} />
          <label style={styles.label} htmlFor="email">Email</label>
          <input id="email" type="email" style={styles.input} required autoComplete="email" value={form.email} onChange={set("email")} />
          <label style={styles.label} htmlFor="phone">Phone (optional)</label>
          <input id="phone" type="tel" style={styles.input} autoComplete="tel" value={form.phone} onChange={set("phone")} />
          <label style={styles.label} htmlFor="timeline">When are you looking to buy? (optional)</label>
          <input id="timeline" style={styles.input} value={form.timeline} onChange={set("timeline")} />
          <div style={styles.trap} aria-hidden="true">
            <label htmlFor="website">Website</label>
            <input id="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} />
          </div>
          <label style={styles.consent}>
            <input type="checkbox" checked={form.consent} onChange={set("consent")} style={styles.check} />
            <span>I agree to be contacted about this offer.</span>
          </label>
          <button type="submit" style={styles.btn} disabled={status.state === "sending"}>
            {status.state === "sending" ? "Sending…" : page.cta}
          </button>
          {status.state === "error" ? <p role="alert" style={{ color: "#b00020" }}>{status.message}</p> : null}
        </form>
      )}
    </main>
    </div>
  );
}
