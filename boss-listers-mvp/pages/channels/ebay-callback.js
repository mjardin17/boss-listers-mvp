import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { requireSession, authedFetch } from "../../lib/clientAuth";

// Must match the key used in pages/channels.js's startEbayConnect().
const EBAY_STATE_STORAGE_KEY = "boss_ebay_oauth_state";

// eBay redirects here after the customer clicks Agree on eBay's consent
// screen (?code=... in the query string). This is a real page, not just an
// API route, specifically so the request carries the customer's own
// Supabase session from localStorage via authedFetch — an API route hit
// directly by eBay's redirect would have no way to know which of our
// customers this connection belongs to.
export default function EbayCallback() {
  const router = useRouter();
  const [status, setStatus] = useState("working"); // working | success | error
  const [message, setMessage] = useState("Connecting your eBay account…");

  useEffect(() => {
    if (!router.isReady) return;
    if (!requireSession()) return;

    const { code, state, error: oauthError } = router.query;

    if (oauthError) {
      setStatus("error");
      setMessage(`eBay declined the connection: ${oauthError}`);
      return;
    }
    if (!code) {
      setStatus("error");
      setMessage("No authorization code came back from eBay.");
      return;
    }

    // Anti-CSRF check: the state must match what THIS browser generated
    // right before redirecting to eBay. A mismatch means this code didn't
    // originate from a connect flow this browser started — refuse rather
    // than let it link an attacker's eBay account to this session's tenant.
    const expectedState = sessionStorage.getItem(EBAY_STATE_STORAGE_KEY);
    sessionStorage.removeItem(EBAY_STATE_STORAGE_KEY); // single-use either way
    if (!expectedState || state !== expectedState) {
      setStatus("error");
      setMessage("This connection request couldn't be verified. Please try connecting again from the Channels page.");
      return;
    }

    authedFetch("/api/channels/ebay/callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "Connection failed");
        setStatus("success");
        setMessage(
          data.accountIdentifier
            ? `Connected to eBay as ${data.accountIdentifier}.`
            : "Connected to eBay."
        );
      })
      .catch((err) => {
        setStatus("error");
        setMessage(err.message);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when router is ready
  }, [router.isReady]);

  return (
    <div className="app-shell" style={{ maxWidth: 480, paddingTop: "4rem", textAlign: "center" }}>
      <h1>eBay Connection</h1>
      <p style={{ marginTop: "1rem", color: status === "error" ? "var(--danger)" : undefined }}>
        {message}
      </p>
      {status !== "working" && (
        <a href="/channels" className="btn-primary" style={{ display: "inline-block", marginTop: "1.5rem" }}>
          Back to Channels
        </a>
      )}
    </div>
  );
}
