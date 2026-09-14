import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { requireSession, authedFetch } from "../../lib/clientAuth";

// Must match the key used in pages/channels.js's startAmazonConnect().
const AMAZON_STATE_STORAGE_KEY = "boss_amazon_oauth_state";

// Amazon redirects here after the seller clicks Authorize on Seller
// Central's consent screen (?code=...&state=... in the query string). This
// is a real page, not just an API route — mirrors pages/channels/ebay-callback.js
// exactly, for the same reason: it needs the customer's own Supabase
// session from localStorage via authedFetch.
export default function AmazonCallback() {
  const router = useRouter();
  const [status, setStatus] = useState("working"); // working | success | error
  const [message, setMessage] = useState("Connecting your Amazon account…");

  useEffect(() => {
    if (!router.isReady) return;
    if (!requireSession()) return;

    const { code, state, error: oauthError } = router.query;

    if (oauthError) {
      setStatus("error");
      setMessage(`Amazon declined the connection: ${oauthError}`);
      return;
    }
    if (!code) {
      setStatus("error");
      setMessage("No authorization code came back from Amazon.");
      return;
    }

    const expectedState = sessionStorage.getItem(AMAZON_STATE_STORAGE_KEY);
    sessionStorage.removeItem(AMAZON_STATE_STORAGE_KEY);
    if (!expectedState || state !== expectedState) {
      setStatus("error");
      setMessage("This connection request couldn't be verified. Please try connecting again from the Channels page.");
      return;
    }

    authedFetch("/api/channels/amazon/callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "Connection failed");
        setStatus("success");
        setMessage("Connected to Amazon Seller Central.");
      })
      .catch((err) => {
        setStatus("error");
        setMessage(err.message);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when router is ready
  }, [router.isReady]);

  return (
    <div className="app-shell" style={{ maxWidth: 480, paddingTop: "4rem", textAlign: "center" }}>
      <h1>Amazon Connection</h1>
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
