/**
 * Sonda (jen cte): nacte detail zarazenych inzeratu stejne jako nocni sken a overi,
 * ze po uklidu stranky nezustal pres inzerat vyskakovaci okno, a jaky format fotek se vzal.
 */
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";
import { HLAVICKY_PROHLIZECE } from "../src/lib/market/util";
import { nactiDetail } from "./sreality-detail";

const prisma = new PrismaClient();

async function main() {
  const inz = await prisma.inzerat.findMany({ where: { zarazeni: { some: { stav: "ZARAZENO" } }, zmizelAt: null, url: { not: null } }, take: 5 });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 2000 }, locale: "cs-CZ", userAgent: HLAVICKY_PROHLIZECE["User-Agent"] });
  for (const i of inz) {
    const p = await ctx.newPage();
    const d = await nactiDetail(p, i.url!, i.externalId);
    const zbytek = await p.evaluate(() => {
      const plocha = window.innerWidth * window.innerHeight;
      const vid = (el: Element) => { const r = el.getBoundingClientRect(); const st = getComputedStyle(el); return st.display !== "none" && st.visibility !== "hidden" && r.width * r.height > 0; };
      const prekryvy = Array.from(document.querySelectorAll<HTMLElement>("body *")).filter((el) => {
        const st = getComputedStyle(el); const r = el.getBoundingClientRect();
        return vid(el) && st.position === "fixed" && r.width * r.height > plocha * 0.2;
      }).map((el) => `${el.tagName}.${String(el.className).slice(0, 40)}`);
      const premium = /Premium je tu/.test(document.body.innerText);
      return { prekryvy: prekryvy.slice(0, 5), premium };
    });
    const fotka = d.fotky[0] ? await p.request.get(d.fotky[0]).then(async (r) => `${r.status()} ${r.headers()["content-type"]} ${(await r.body()).length} B`).catch((e) => String(e)) : "—";
    console.log(`${i.externalId}: stav ${d.stav}, fotek ${d.fotky.length}, formát ${d.fotky[0]?.split("?")[1] ?? "—"}, první fotka ${fotka}; text Premium viditelný: ${zbytek.premium}; velké fixní prvky: ${zbytek.prekryvy.join(", ") || "žádné"}`);
    await p.close();
  }
  await b.close();
}
main().finally(() => prisma.$disconnect());
