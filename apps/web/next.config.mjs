/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: true
  },
  transpilePackages: ["@acme/core", "@acme/ai"],
};

export default nextConfig;

