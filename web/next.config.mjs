/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Deploy target is a Phase 8 decision. If it lands on a static CDN, add
  // `output: 'export'` here — every image on the site is already pre-derived to
  // AVIF/WebP by scripts/build-web-images.mjs, so nothing depends on the
  // Image Optimization API.
  images: { formats: ['image/avif', 'image/webp'] },
};
export default nextConfig;
