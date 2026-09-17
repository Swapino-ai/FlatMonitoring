import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
};

export default config;
