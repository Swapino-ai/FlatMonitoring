/**
 * Sonda (jen cte): kde ma detail inzeratu na Sreality seznam fotek. Vypise cesty
 * v __NEXT_DATA__ k polim s odkazy na sdn.cz a obrazky v DOM.
 */
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";
import { HLAVICKY_PROHLIZECE } from "../src/lib/market/util";

const prisma = new PrismaClient();

function projdi(x: unknown, cesta: string, ven: string[]) {
  if (Array.isArray(x)) {
    const sdn = x.filter((e) => JSON.stringify(e ?? "").includes("sdn.cz"));
    if (sdn.length >= 2) ven.push(`${cesta} [${x.length}] ${JSON.stringify(x[0]).slice(0, 300)}`);
    x.slice(0, 2).forEach((e, k) => projdi(e, `${cesta}[${k}]`, ven));
  } else if (x && typeof x === "object") {
    for (const [k, v] of Object.entries(x)) projdi(v, `${cesta}.${k}`, ven);
  }
}

async function main() {
  const inz = await prisma.inzerat.findMany({ where: { zarazeni: { some: { stav: "ZARAZENO" } }, zmizelAt: null, url: { not: null } }, take: 2 });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 2000 }, locale: "cs-CZ", userAgent: HLAVICKY_PROHLIZECE["User-Agent"] });
  for (const i of inz) {
    const p = await ctx.newPage();
    await p.goto(i.url!, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await p.getByRole("button", { name: /souhlasím|přijmout vše|rozumím/i }).first().click({ timeout: 4000 }).catch(() => undefined);
    await p.waitForTimeout(3000);
    console.log(`\n=== ${i.externalId} ${p.url()}`);
    const nd = await p.evaluate(() => document.getElementById("__NEXT_DATA__")?.textContent ?? "");
    console.log(`__NEXT_DATA__ ${nd.length} znaků`);
    if (nd) {
      const data = JSON.parse(nd);
      const qs = data?.props?.pageProps?.dehydratedState?.queries ?? [];
      for (const [k, q] of (qs as any[]).entries()) console.log(`query[${k}] key=${JSON.stringify(q.queryKey).slice(0, 150)}`);
      const ven: string[] = [];
      const est = (qs as any[]).find((q) => q.queryKey?.[0] === "estate")?.state?.data;
      console.log("estate klíče:", est ? Object.keys(est).join(", ") : "—");
      projdi(est, "estate", ven);
      const prvni = est?.images?.[0]?.url as string | undefined;
      if (prvni) {
        const zaklad = (prvni.startsWith("//") ? "https:" : "") + prvni.split("?")[0];
        for (const fl of ["", "?fl=res,1600,1600,1|jpg,85", "?fl=res,1200,1200,1|jpg,80", "?fl=res,1200,1200,1|wrm,/watermark/sreality.png,10", "?fl=res,2200,2200,1|wrm,/watermark/sreality.png,10", "?fl=res,800,800,1|shr,,20|webp,60"]) {
          const r = await p.request.get(zaklad + fl).catch((e) => ({ status: () => String(e).slice(0, 60), headers: () => ({} as Record<string, string>), body: async () => Buffer.alloc(0) }));
          const t = await r.body().catch(() => Buffer.alloc(0));
          console.log(`  varianta ${fl || "(bez fl)"} -> ${r.status()} ${r.headers()["content-type"] ?? ""} ${t.length} B`);
        }
      }
      ven.slice(0, 25).forEach((r) => console.log("  ", r));
    }
    const img = await p.evaluate(() => Array.from(document.querySelectorAll("img")).map((im) => `${(im as HTMLImageElement).naturalWidth}x${(im as HTMLImageElement).naturalHeight} alt="${im.alt.slice(0, 40)}" ${(im.currentSrc || im.src).slice(0, 120)}`));
    console.log(`DOM img ${img.length}:`); img.slice(0, 40).forEach((r) => console.log("  ", r));
    await p.close();
  }
  await b.close();
}
main().finally(() => prisma.$disconnect());
