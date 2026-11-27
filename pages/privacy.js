// Public Privacy Policy — required by marketplace and TikTok app review.
import Head from "next/head";
import LegalPage from "../components/LegalPage";

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="November 24, 2026">
      <Head><title>Privacy Policy — Boss Listers</title></Head>
      <p>This policy explains what Boss Listers (run by Joshua Jardin / Jardins Outpost, New Bedford, Massachusetts, USA) collects and how it is used.</p>
      <h2>What we collect</h2>
      <ul>
        <li>Your Boss Listers login email.</li>
        <li>Photos, listing details and videos you create in Boss Listers.</li>
        <li>Access tokens for accounts you connect (for example TikTok, eBay). From TikTok we receive your basic profile (display name, avatar, open ID) and permission to upload and publish videos you choose to post.</li>
      </ul>
      <h2>How we use it</h2>
      <p>Only to provide the service: to show which account is connected and to publish the listings and videos you ask us to publish. We do not sell your data, use it for advertising, or share it with anyone except the platform you are posting to.</p>
      <h2>Storage and security</h2>
      <p>Access tokens are stored encrypted. Data is kept while your account is active.</p>
      <h2>Your choices</h2>
      <p>You can disconnect any account in Boss Listers at any time, or revoke access from the platform itself (for TikTok: Settings, Security, Manage app permissions). To delete your data, email us and we will delete it within 30 days.</p>
      <h2>Contact</h2>
      <p>jardinsoutpost@gmail.com</p>
    </LegalPage>
  );
}
