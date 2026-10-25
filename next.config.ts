import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // self-contained server for the Docker image
  serverExternalPackages: ["nodemailer"],
};

export default nextConfig;
