// Shared plain layout for public legal pages (terms, privacy).
export default function LegalPage({ title, updated, children }) {
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 20px", fontFamily: "system-ui, sans-serif", lineHeight: 1.6, color: "#1a1a1a", background: "#fff" }}>
      <a href="/" style={{ color: "#555", textDecoration: "none" }}>← Boss Listers</a>
      <h1 style={{ marginTop: 24 }}>{title}</h1>
      <p style={{ color: "#666" }}>Last updated {updated}</p>
      {children}
    </main>
  );
}
