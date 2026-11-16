/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Empire OS module contract: the hub calls /empire/*, served by pages/api/empire/*.
  async rewrites() {
    return [{ source: "/empire/:path*", destination: "/api/empire/:path*" }];
  },
};

module.exports = nextConfig;
