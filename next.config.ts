import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
  // Uctenky (fotky zmensene v prohlizeci, PDF do 2,5 MB) jdou do server action jako base64
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  // Na Vercelu se PDF na serveru nevykresluje (canRenderPdfOnServer) — Playwright do funkce
  // nebalit, zbytecne zabira misto ve Function Storage (kazde nasazeni nese svou kopii)
  outputFileTracingExcludes: { "/api/report": ["node_modules/playwright-core/**", "node_modules/playwright/**"] },
};

export default config;
