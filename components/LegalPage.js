// Shared layout for the public legal pages (terms, privacy).
// Matches the app's operator look: deep slate ground, cream ink, green brand,
// amber for the one action. Title held large on the left, the text on the right.
export default function LegalPage({ title, updated, children }) {
  return (
    <div className="lp">
      <header className="lp-bar">
        <a href="/" className="lp-mark">Boss Listers</a>
        <nav className="lp-nav" aria-label="Legal">
          <a href="/terms">Terms</a>
          <a href="/privacy">Privacy</a>
          <a className="lp-act" href="mailto:jardinsoutpost@gmail.com">Contact</a>
        </nav>
      </header>

      <main className="lp-main">
        <div className="lp-head">
          <h1>{title}</h1>
          <p className="lp-date">Updated {updated}</p>
        </div>
        <article className="lp-body">{children}</article>
      </main>

      <footer className="lp-foot">
        <p className="lp-foot-name">Boss Listers</p>
        <p>A listing tool for resellers, run by Jardins Outpost in New Bedford, Massachusetts.</p>
      </footer>

      <style jsx global>{`
        .lp {
          --lp-ground: #0b111b;
          --lp-field: #141c2a;
          --lp-ink: #f1e9d6;
          --lp-soft: #b9b2a2;
          --lp-brand: #34d399;
          --lp-act: #e0a84a;
          --lp-edge: clamp(16px, 4vw, 56px);
          min-height: 100vh;
          background: var(--lp-ground);
          color: var(--lp-ink);
          font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
        }
        .lp a { color: inherit; }
        .lp-bar {
          display: flex; align-items: center; justify-content: space-between;
          padding: 24px var(--lp-edge);
        }
        .lp-mark { font-weight: 700; font-size: 20px; text-decoration: none; color: var(--lp-brand) !important; }
        .lp-nav { display: flex; gap: 28px; align-items: center; font-size: 16px; }
        .lp-nav a { text-decoration: none; }
        .lp-nav a:hover, .lp-nav a:focus-visible { color: var(--lp-brand); }
        .lp-act {
          background: var(--lp-act); color: #0b111b !important; padding: 10px 18px;
          border-radius: 999px; font-weight: 600; transition: transform .15s ease;
        }
        .lp-act:hover { transform: translateY(-1px); }
        .lp-act:active { transform: translateY(1px); }
        .lp-main {
          display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
          gap: clamp(32px, 6vw, 120px); padding: clamp(48px, 9vw, 140px) var(--lp-edge);
        }
        .lp-head { align-self: start; }
        .lp-head h1 {
          font-size: clamp(44px, 6.4vw, 104px); line-height: .95; letter-spacing: -0.035em;
          margin: 0; font-weight: 700;
        }
        .lp-date { margin: 24px 0 0; font-size: 18px; color: var(--lp-soft); }
        .lp-body { font-size: 18px; line-height: 1.6; }
        .lp-body > * { max-width: 68ch; }
        .lp-head h1, .lp-date, .lp-body > *, .lp-foot > * { animation: lp-rise .6s cubic-bezier(.16,1,.3,1) both; }
        .lp-date { animation-delay: .08s; }
        .lp-body > *:nth-child(1) { animation-delay: .14s; } .lp-body > *:nth-child(2) { animation-delay: .2s; } .lp-body > *:nth-child(3) { animation-delay: .26s; } .lp-body > *:nth-child(4) { animation-delay: .32s; } .lp-body > *:nth-child(5) { animation-delay: .38s; } .lp-body > *:nth-child(n+6) { animation-delay: .44s; }
        @keyframes lp-rise { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .lp * { animation: none !important; transition: none !important; } }
        .lp-body > p:first-child { font-size: 24px; line-height: 1.45; margin-top: 0; }
        .lp-body h2 {
          font-size: 28px; line-height: 1.15; letter-spacing: -0.02em; margin: 64px 0 12px;
          color: var(--lp-brand);
        }
        .lp-body ul { padding-left: 1.2em; }
        .lp-body li { margin: 8px 0; }
        .lp-foot { background: var(--lp-field); padding: 64px var(--lp-edge) 48px; }
        .lp-foot-name {
          font-size: clamp(48px, 12vw, 200px); line-height: .9; letter-spacing: -0.045em;
          font-weight: 700; margin: 0 0 24px; color: var(--lp-brand);
        }
        .lp-foot p:last-child { font-size: 18px; margin: 0; }
        @media (max-width: 760px) {
          .lp-main { grid-template-columns: 1fr; }
          .lp-head { position: static; }
          .lp-nav { gap: 16px; font-size: 15px; }
        }
      `}</style>
    </div>
  );
}
