import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  // Uctenky (fotky zmensene v prohlizeci, PDF do 2,5 MB) jdou do server action jako base64
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};

export default config;
