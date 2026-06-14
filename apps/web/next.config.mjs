/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Transpile workspace packages so the web app can import shared code directly.
  transpilePackages: ["@signalguard/config"],
};

export default nextConfig;
