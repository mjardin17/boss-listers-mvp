"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "../lib/clientAuth";

function Badge({ ok }) {
  return <span className={ok ? "text-green-700" : "text-gray-500"}>{ok ? "Connected" : "Not connected"}</span>;
}

function Section({ title, children }) {
  return (
    <section className="mb-8 rounded-lg border p-4">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function ListingRows({ items, empty }) {
  if (!items || items.length === 0) return <p className="text-sm text-gray-500">{empty}</p>;
  return (
    <ul className="space-y-2">
      {items.map((o) => (
        <li key={o.offerId || o.orderId} className="flex flex-wrap justify-between gap-2 text-sm">
          <span>{o.sku} — ${o.price} — {o.status}</span>
          {o.url && <a className="underline" href={o.url} target="_blank" rel="noreferrer">View on eBay</a>}
        </li>
      ))}
    </ul>
  );
}

export default function StorefrontsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    authedFetch("/api/storefronts")
      .then((r) => r.json())
      .then((j) => (j.ok ? setData(j.storefronts) : setError(j.error || "Could not load storefronts")))
      .catch(() => setError("Could not load storefronts"));
  }, []);

  if (error) return <main className="p-6 text-red-700">{error}</main>;
  if (!data) return <main className="p-6">Loading storefronts…</main>;

  const { ebay, facebook, instagram, shopify, site, etsy, amazon } = data;

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-6 text-2xl font-bold">My storefronts</h1>

      <Section title="eBay">
        <p className="mb-3"><Badge ok={ebay.connected} /> {ebay.connected ? "" : ebay.error}</p>
        {ebay.connected && (
          <>
            <h3 className="mt-2 font-medium">Active ({ebay.active.length})</h3>
            <ListingRows items={ebay.active} empty="Nothing active." />
            <h3 className="mt-4 font-medium">Drafts ({ebay.drafts.length})</h3>
            <ListingRows items={ebay.drafts} empty="No drafts." />
            <h3 className="mt-4 font-medium">Sold</h3>
            {ebay.sold.available
              ? <ListingRows items={ebay.sold.orders} empty="No sold orders yet." />
              : <p className="text-sm text-gray-500">{ebay.sold.note}</p>}
          </>
        )}
      </Section>

      <Section title="Instagram">
        <p><Badge ok={instagram.connected} /> {instagram.connected ? `@${instagram.username}` : ""}</p>
      </Section>

      <Section title="Facebook Page">
        <p><Badge ok={facebook.connected} /> {facebook.connected ? facebook.name : ""}</p>
      </Section>

      <Section title="Website">
        <p><Badge ok={site.connected} /> <a className="underline" href={site.url} target="_blank" rel="noreferrer">{site.url}</a></p>
        <p className="text-sm text-gray-600">{site.note}</p>
      </Section>

      <Section title="Shopify">
        <p><Badge ok={shopify.connected} /> <a className="underline" href={shopify.url} target="_blank" rel="noreferrer">{shopify.url}</a></p>
        <p className="text-sm text-gray-600">{shopify.note}</p>
      </Section>

      <Section title="Etsy and Amazon">
        <p><Badge ok={etsy.connected} /> Etsy: {etsy.note}</p>
        <p><Badge ok={amazon.connected} /> Amazon: {amazon.note}</p>
      </Section>
    </main>
  );
}
