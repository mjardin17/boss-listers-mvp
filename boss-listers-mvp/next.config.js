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
