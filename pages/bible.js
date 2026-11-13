"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "../lib/clientAuth";

// Joshua's Bible, shown only on the signed-in owner side.
export default function BiblePage() {
  const [files, setFiles] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    authedFetch("/api/bible")
      .then((r) => r.json())
      .then((j) => (j.ok ? setFiles(j.files) : setError(j.error || "Could not load the Bible")))
      .catch(() => setError("Could not load the Bible"));
  }, []);

  if (error) return <main style={{ padding: 28, color: "#e8917f" }}>{error}</main>;
  if (!files) return <main style={{ padding: 28, color: "#8e9db3" }}>Loading the Bible…</main>;

  return (
    <main style={{ padding: 28, maxWidth: 960, margin: "0 auto", color: "#f1e9d6", background: "#0c121c", minHeight: "100vh", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 20, marginTop: 0 }}>Joshua's Bible</h1>
      <p style={{ color: "#8e9db3", fontSize: 13 }}>Private. Visible only to the owner account.</p>
      {Object.entries(files).map(([name, text]) => (
        <section key={name} style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 15, color: "#e0a84a" }}>{name}</h2>
          <pre style={{ whiteSpace: "pre-wrap", background: "#151e2d", padding: 16, borderRadius: 10, fontSize: 13, lineHeight: 1.5 }}>{text}</pre>
        </section>
      ))}
    </main>
  );
}
