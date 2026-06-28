/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { typedRoutes: true },
  i18n: undefined, // App Router uses route-segment locales; structure-ready for hi / te / en
};
module.exports = nextConfig;
