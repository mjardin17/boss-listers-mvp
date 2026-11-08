"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "../lib/clientAuth";

const STATE_COLOR = { "waiting on you": "#e0a84a", "needs check": "#e8917f", building: "#6fbf8e" };

// Joshua's main screen: the status of every project and what waits on him. Owner only.
export default function HomePage() {
  const [home, setHome] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    authedFetch("/api/home")
      .then((r) => r.json())
      .then((j) => (j.ok ? setHome(j.home) : setError(j.error || "Could not load")))
      .catch(() => setError("Could not load"));
  }, []);

  const background = "linear-gradient(rgba(12,18,28,0.82), rgba(12,18,28,0.9)), url(/home-bg.jpg) center top / cover fixed no-repeat, #0c121c";

  return (
    <main style={{ minHeight: "100vh", background, color: "#f1e9d6", padding: "28px 18px", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <h1 style={{ fontSize: 26, margin: "0 0 4px" }}>Joshua's Outpost</h1>
        <p style={{ margin: "0 0 14px", fontSize: 13 }}><a href="https://jardinsoutpost.com" target="_blank" rel="noreferrer" style={{ color: "#8e9db3" }}>jardinsoutpost.com</a></p>
        <p style={{ color: "#8e9db3", margin: "0 0 22px", fontSize: 14 }}>
          {home ? `Updated ${home.updated}. ${home.projects.filter((p) => p.state === "waiting on you").length} things wait on you.` : "Loading…"}
        </p>
        {error && <p style={{ color: "#e8917f" }}>{error}</p>}
        {home && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
            {home.projects.map((p) => (
              <section key={p.name} style={{ background: "rgba(21,30,45,0.85)", border: "1px solid #1f2a3b", borderRadius: 14, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                  <h2 style={{ fontSize: 16, margin: 0 }}>{p.name}</h2>
                  <span style={{ fontSize: 12, color: STATE_COLOR[p.state] || "#8e9db3", whiteSpace: "nowrap" }}>● {p.state}</span>
                </div>
                <p style={{ color: "#c9d2e0", fontSize: 14, margin: "10px 0 8px" }}>{p.status}</p>
                <p style={{ color: "#8e9db3", fontSize: 12, margin: 0 }}>Where: {p.where}</p>
                <p style={{ color: "#e0a84a", fontSize: 13, margin: "8px 0 0" }}>Waiting: {p.waiting}</p>
              </section>
            ))}
          </div>
        )}
        <p style={{ color: "#4a5a72", fontSize: 12, marginTop: 26 }}>Private. Visible only to the owner account.</p>
      </div>
    </main>
  );
}
