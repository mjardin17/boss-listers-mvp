import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { requireSession, authedFetch } from "../../lib/clientAuth";

// Must match the keys used in pages/channels.js's startEtsyConnect().
const ETSY_STATE_STORAGE_KEY = "boss_etsy_oauth_state";
const ETSY_VERIFIER_STORAGE_KEY = "boss_etsy_code_verifier";

// Etsy redirects here after the customer clicks "Allow Access" on Etsy's
// consent screen (?code=...&state=... in the query string). Real page, not
// an API route, for the same reason as ebay-callback.js: it needs the
// customer's own Supabase session from localStorage before forwarding to
// the backend, since Etsy's redirect has no way to carry that on its own.
//
// PKCE difference from eBay: the code_verifier generated client-side in
// startEtsyConnect() never left this browser, so it has to be read back out
// of sessionStorage here and sent to the backend alongside the code — the
// backend has no other way to reconstruct it.
export default function EtsyCallback() {
  const router = useRouter();
  const [status, setStatus] = useState("working"); // working | success | error
  const [message, setMessage] = useState("Connecting your Etsy shop…");

  useEffect(() => {
    if (!router.isReady) return;
    if (!requireSession()) return;

    const { code, state, error: oauthError } = router.query;

    if (oauthError) {
      setStatus("error");
      setMessage(`Etsy declined the connection: ${oauthError}`);
      return;
    }
    if (!code) {
      setStatus("error");
      setMessage("No authorization code came back from Etsy.");
      return;
    }

    const expectedState = sessionStorage.getItem(ETSY_STATE_STORAGE_KEY);
    const codeVerifier = sessionStorage.getItem(ETSY_VERIFIER_STORAGE_KEY);
    sessionStorage.removeItem(ETSY_STATE_STORAGE_KEY); // single-use either way
    sessionStorage.removeItem(ETSY_VERIFIER_STORAGE_KEY);

    if (!expectedState || state !== expectedState) {
      setStatus("error");
      setMessage("This connection request couldn't be verified. Please try connecting again from the Channels page.");
      return;
    }
    if (!codeVerifier) {
      setStatus("error");
      setMessage("Missing PKCE verifier for this session — please try connecting again from the Channels page.");
      return;
    }

    authedFetch("/api/channels/etsy/callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, codeVerifier }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "Connection failed");
        setStatus("success");
        setMessage(
          data.shopIdMissing
            ? "Connected to Etsy, but we couldn't confirm your shop ID automatically. Listing may not work until this is fixed — contact support if it persists."
            : data.accountIdentifier
              ? `Connected to Etsy as ${data.accountIdentifier}.`
              : "Connected to Etsy."
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
      <h1>Etsy Connection</h1>
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
