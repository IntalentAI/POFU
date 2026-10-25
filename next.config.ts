import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // Let wrangler resolve Prisma's workerd (WebAssembly) build instead of bundling the Node one.
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
};

export default nextConfig;

// Makes Cloudflare bindings (the local D1 database) available to `next dev`.
initOpenNextCloudflareForDev();
