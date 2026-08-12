// wrangler.toml's [vars] only feeds the deployed Workers runtime — it has
// NO effect on this build step. These must be real shell env vars (or in
// .env.local) when `next build` runs, or login.js silently ships pointed
// at "undefined/auth/v1/...". Fail loudly instead of shipping that.
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  throw new Error(
    'Build failed: SUPABASE_URL and SUPABASE_ANON_KEY must be set in the ' +
      'environment running `next build` (see .env.example). These are ' +
      'separate from wrangler.toml — that file only configures the ' +
      'deployed Workers runtime, not this build step.'
  );
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
  env: {
    // Inlined into the client bundle at build time. The anon key is safe
    // to expose — RLS is what actually protects data, not secrecy of this
    // key (see supabase/migrations/0007_multi_tenant.sql).
    NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  },
};

module.exports = nextConfig;
