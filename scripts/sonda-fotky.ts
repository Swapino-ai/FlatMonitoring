/**
 * Sonda (jen cte): nacte detail zarazenych inzeratu stejne jako nocni sken a overi,
 * ze po uklidu stranky nezustal pres inzerat vyskakovaci okno, a jaky format fotek se vzal.
 */
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";
import { HLAVICKY_PROHLIZECE } from "../src/lib/market/util";
import { writeFileSync, mkdirSync } from "node:fs";
import { nactiDetail, snimekStranky, uklidStranku } from "./sreality-detail";

const prisma = new PrismaClient();

async function main() {
  const inz = await prisma.inzerat.findMany({ where: { zarazeni: { some: { stav: "ZARAZENO" } }, zmizelAt: null, url: { not: null } }, take: 5 });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 2000 }, locale: "cs-CZ", userAgent: HLAVICKY_PROHLIZECE["User-Agent"] });
  for (const i of inz) {
    const p = await ctx.newPage();
    const d = await nactiDetail(p, i.url!, i.externalId);
    await p.waitForTimeout(1500);
    await uklidStranku(p);
    // Jako retezec: tsx by do funkce vlozil pomocnou __name, kterou prohlizec nezna
    const zbytek = await p.evaluate(`(() => {
      const plocha = window.innerWidth * window.innerHeight;
      const prekryvy = Array.from(document.querySelectorAll("body *")).filter((el) => {
        const st = getComputedStyle(el); const r = el.getBoundingClientRect();
        return el.offsetParent !== null && st.display !== "none" && st.visibility !== "hidden" && st.position === "fixed" && r.width * r.height > plocha * 0.2;
      }).map((el) => el.tagName + "." + String(el.className).slice(0, 40));
      return { prekryvy: prekryvy.slice(0, 5), premium: /Premium je tu/.test(document.body.innerText) };
    })()`) as { prekryvy: string[]; premium: boolean };
    const fotka = d.fotky[0] ? await p.request.get(d.fotky[0]).then(async (r) => `${r.status()} ${r.headers()["content-type"]} ${(await r.body()).length} B`).catch((e) => String(e)) : "—";
    // Je v textu stranky cely popis? (porovnani s popisem v datech stranky)
    const kontrola = await p.evaluate(`(() => {
      const najdi = (o, d) => { if (!o || typeof o !== "object" || d > 8) return null;
        for (const [k, v] of Object.entries(o)) {
          if (/^(description|popis|text)$/i.test(k) && typeof v === "string" && v.length > 200) return v;
          const r = najdi(v, d + 1); if (r) return r; }
        return null; };
      let popis = null;
      try { popis = najdi(JSON.parse(document.getElementById("__NEXT_DATA__").textContent), 0); } catch {}
      const t = document.body.innerText.replace(/\\s+/g, " ");
      const konec = popis ? popis.replace(/\\s+/g, " ").trim().slice(-60) : "";
      const tlacitka = Array.from(document.querySelectorAll("button, [role=button], a")).map((b) => (b.innerText || "").trim().replace(/\\s+/g, " ")).filter((x) => x && x.length < 40 && /zobraz|více|celý|číst|rozbal|méně/i.test(x));
      return { delkaPopisu: popis ? popis.length : 0, konecVidet: popis ? t.includes(konec) : null, konec, tlacitka: [...new Set(tlacitka)].slice(0, 12) };
    })()`) as { delkaPopisu: number; konecVidet: boolean | null; konec: string; tlacitka: string[] };
    console.log(`${i.externalId}: popis ${kontrola.delkaPopisu} znaků, konec popisu na stránce viditelný: ${kontrola.konecVidet} („…${kontrola.konec}“); tlačítka: ${kontrola.tlacitka.join(" | ")}`);
    mkdirSync("sonda", { recursive: true });
    const snimek = await snimekStranky(p);
    writeFileSync(`sonda/${i.externalId}.jpg`, snimek);
    const vyska = await p.evaluate("document.documentElement.scrollHeight");
    console.log(`${i.externalId}: rozbaleno [${d.rozbaleno.join(" | ")}], výška stránky ${vyska} px, snímek ${Math.round(snimek.length / 1024)} kB, text ${d.text.length} znaků`);
    console.log(`${i.externalId}: stav ${d.stav}, fotek ${d.fotky.length}, formát ${d.fotky[0]?.split("?")[1] ?? "—"}, první fotka ${fotka}; text Premium viditelný: ${zbytek.premium}; velké fixní prvky: ${zbytek.prekryvy.join(", ") || "žádné"}`);
    await p.close();
  }
  await b.close();
}
main().finally(() => prisma.$disconnect());
