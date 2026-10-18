/**
 * Nacteni detailu inzeratu na Sreality v prohlizeci (Playwright).
 *
 * Fotky se berou z dat stranky (__NEXT_DATA__ → dotaz "estate" → images): tam je cela
 * galerie v poradi inzerenta. V HTML je jich nactenych jen par a mezi nimi fotka makléře,
 * loga a ikony.
 *
 * Stav: OK = detail inzeratu; NENI = Sreality hlasi, ze inzerat neexistuje (smazany,
 * prodany); NEVIM = neco jineho (souhlas s cookies, chyba site) — pak se nic nemeni.
 */
import type { Page } from "playwright";

export interface DetailInzeratu {
  stav: "OK" | "NENI" | "NEVIM";
  /** Cely text stranky (pro AI) */
  text: string;
  /** Fotky galerie v plnem rozliseni */
  fotky: string[];
  /** Tlacitka, ktera se kvuli celemu popisu rozklikla (pro kontrolu v logu) */
  rozbaleno: string[];
}

/**
 * Obrazkovy server Sreality vyda fotku jen s parametrem "fl" v presne podobe, jakou pouziva
 * stranka (jinak 400). Bere se proto nejvetsi varianta, kterou stranka u fotek galerie
 * pouzila; tahle je overena jako zaloha.
 */
const ZALOZNI_FORMAT = "?fl=res,800,800,1|shr,,20|webp,60";

const NEEXISTUJE = /inzerát (již |už )?neexistuje|inzerát nebyl nalezen|inzerát byl (smazán|odstraněn|stažen)|stránka nebyla nalezena|tato nabídka již není/i;

export async function nactiDetail(stranka: Page, url: string, externalId: string): Promise<DetailInzeratu> {
  const odpoved = await stranka.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  // Souhlas s cookies (Seznam CMP) by jinak prekryl celou stranku
  await stranka.getByRole("button", { name: /souhlasím|přijmout vše|rozumím/i }).first().click({ timeout: 4000 }).catch(() => undefined);
  await stranka.waitForTimeout(2500);
  await uklidStranku(stranka);
  // Cely popis i pro AI, ne jen zacatek pred "Zobrazit vice"
  const rozbaleno = await rozbalStranku(stranka);

  const text: string = await stranka.evaluate(() => document.body?.innerText ?? "").catch(() => "");
  const data = await stranka.evaluate(() => document.getElementById("__NEXT_DATA__")?.textContent ?? "").catch(() => "");
  let estate: { images?: { url?: string; order?: number }[] } | null | undefined;
  let maDotaz = false;
  try {
    const queries = JSON.parse(data)?.props?.pageProps?.dehydratedState?.queries;
    const q = Array.isArray(queries) ? queries.find((x: { queryKey?: unknown[] }) => x.queryKey?.[0] === "estate") : undefined;
    maDotaz = !!q;
    estate = q?.state?.data;
  } catch { /* stranka bez dat — rozhodne text nize */ }

  const naDetailu = stranka.url().includes(externalId);
  if (odpoved?.status() === 404 || odpoved?.status() === 410 || (naDetailu && maDotaz && !estate) || NEEXISTUJE.test(text.slice(0, 5000))) {
    return { stav: "NENI", text, fotky: [], rozbaleno };
  }
  if (!naDetailu || !estate) return { stav: "NEVIM", text, fotky: [], rozbaleno };

  const galerie = (estate.images ?? [])
    .filter((im) => typeof im.url === "string" && im.url.includes("sdn.cz"))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((im) => `${im.url!.startsWith("//") ? "https:" : ""}${im.url!.split("?")[0]}`);
  // Formaty, se kterymi stranka fotky galerie nacetla; vybere se ten s nejvetsim rozlisenim
  const vDom: string[] = await stranka.evaluate(() => Array.from(document.querySelectorAll("img"))
    // srcset se nerozklada: parametr fl sam obsahuje carky
    .flatMap((im) => [(im as HTMLImageElement).currentSrc, (im as HTMLImageElement).src])
    .filter(Boolean)).catch(() => []);
  const cesty = new Set(galerie.map((u) => u.replace(/^https:/, "")));
  const formaty = vDom
    .filter((u) => cesty.has(u.split("?")[0].replace(/^https:/, "")) && u.includes("?fl="))
    .map((u) => u.slice(u.indexOf("?")))
    .map((f) => ({ f, res: Number(/res,(\d+)/.exec(f)?.[1] ?? 0) }))
    .sort((a, b) => b.res - a.res);
  const format = formaty[0] && formaty[0].res >= 800 ? formaty[0].f : ZALOZNI_FORMAT;
  const fotky = galerie.map((u) => u + format);
  return { stav: "OK", text, fotky: [...new Set(fotky)], rozbaleno };
}

/**
 * Zavre vyskakovaci okna (nabidka Premium, aplikace, newsletter) a skryje prekryvy,
 * aby screenshot ukazoval inzerat. Reklamni ramecky Seznamu taky schova.
 */
export async function uklidStranku(stranka: Page): Promise<void> {
  // Trvale: okna (MUI dialogy) se casto otevrou az se zpozdenim, styl je skryje i pak
  await stranka.addStyleTag({ content: `
    .MuiDialog-root, .MuiModal-root[role="presentation"], .MuiBackdrop-root, [role="dialog"], [aria-modal="true"],
    iframe[src*="ssp.seznam"], iframe[src*="sklik"], [id^="ssp-"] { display: none !important; }
    html, body { overflow: auto !important; }
  ` }).catch(() => undefined);
  for (let k = 0; k < 3; k++) {
    const tlacitko = stranka.getByRole("button", { name: /^(pokračovat|zavřít|ne,? děkuji|teď ne|později|rozumím)$/i }).first();
    if (!(await tlacitko.isVisible({ timeout: 800 }).catch(() => false))) break;
    await tlacitko.click({ timeout: 1500 }).catch(() => undefined);
    await stranka.waitForTimeout(400);
  }
  await stranka.keyboard.press("Escape").catch(() => undefined);
  await stranka.evaluate(() => {
    const plocha = window.innerWidth * window.innerHeight;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const st = getComputedStyle(el);
      const dialog = el.getAttribute("role") === "dialog" || el.getAttribute("aria-modal") === "true";
      const r = el.getBoundingClientRect();
      // Prekryv pres velkou cast obrazovky (okno + ztmaveni), nebo dialog
      const prekryv = (st.position === "fixed" || st.position === "sticky") && r.width * r.height > plocha * 0.3 && Number(st.zIndex || 0) > 0;
      if (dialog || prekryv) el.style.setProperty("display", "none", "important");
    }
    // Reklamni ramecky a bannery
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('iframe[src*="ssp.seznam"], iframe[src*="sklik"], [id^="ssp-"], [class*="adFull"], [class*="advert"]'))) {
      el.style.setProperty("display", "none", "important");
    }
    document.documentElement.style.overflow = "auto";
    document.body.style.overflow = "auto";
  }).catch(() => undefined);
  await stranka.waitForTimeout(300);
}

/** Tlacitka typu "Zobrazit celý popis"; ne dalsi nabidky, telefon ani fotky. */
const ROZBALIT = /^(zobrazit|číst|ukázat|rozbalit)\s+(celý|celou|více|vše|další)|^(více|celý popis|číst dál|zobrazit více)$/i;
const NEROZBALOVAT = /nabíd|inzerát|fotk|telefon|kontakt|e-?mail|hypot|mapu|podobn/i;

/**
 * Rozbali zkraceny popis (tlacitko "Zobrazit celý popis", zkraceni na par radku) a projede
 * stranku az dolu, aby se nacetlo vse, co se nacita az pri posunu. Vraci popisky
 * rozkliknutych tlacitek.
 */
export async function rozbalStranku(stranka: Page): Promise<string[]> {
  const rozbaleno: string[] = [];
  const tlacitka = stranka.locator("button, a[role=button], [role=button]").filter({ hasText: /\S/ });
  const pocet = Math.min(await tlacitka.count().catch(() => 0), 200);
  for (let k = 0; k < pocet && rozbaleno.length < 4; k++) {
    const t = tlacitka.nth(k);
    const popisek = ((await t.innerText({ timeout: 500 }).catch(() => "")) || "").trim().replace(/\s+/g, " ");
    if (!popisek || popisek.length > 40 || !ROZBALIT.test(popisek) || NEROZBALOVAT.test(popisek)) continue;
    if (!(await t.isVisible().catch(() => false))) continue;
    await t.click({ timeout: 1500 }).then(() => rozbaleno.push(popisek)).catch(() => undefined);
    await stranka.waitForTimeout(300);
  }
  // Zkraceni jen stylem (line-clamp, pevna vyska) — u dlouhych textu zrusit
  await stranka.evaluate(`(() => {
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      const st = getComputedStyle(el);
      const clamp = st.webkitLineClamp && st.webkitLineClamp !== "none";
      const oriznute = st.overflow === "hidden" && el.scrollHeight > el.clientHeight + 20 && st.maxHeight !== "none";
      if ((clamp || oriznute) && (el.innerText || "").length > 150 && !el.querySelector("img")) {
        el.style.setProperty("-webkit-line-clamp", "unset", "important");
        el.style.setProperty("max-height", "none", "important");
        el.style.setProperty("overflow", "visible", "important");
      }
    }
  })()`).catch(() => undefined);
  // Postupne dolu (obrazky a mapa se nacitaji az pri zobrazeni) a zpet nahoru
  const vyska = await stranka.evaluate("document.documentElement.scrollHeight").catch(() => 0) as number;
  for (let y = 0; y < Math.min(vyska, MAX_VYSKA_SNIMKU); y += 1200) {
    await stranka.evaluate(`window.scrollTo(0, ${y})`).catch(() => undefined);
    await stranka.waitForTimeout(250);
  }
  await stranka.evaluate("window.scrollTo(0, 0)").catch(() => undefined);
  return rozbaleno;
}

/** Nejvyssi screenshot v px — pod tim uz jsou jen podobne nabidky a paticka. */
export const MAX_VYSKA_SNIMKU = 12000;

/** Screenshot cele stranky (od hlavicky po konec), nejvys MAX_VYSKA_SNIMKU. */
export async function snimekStranky(stranka: Page): Promise<Buffer> {
  const vyska = await stranka.evaluate("document.documentElement.scrollHeight").catch(() => 0) as number;
  const sirka = stranka.viewportSize()?.width ?? 1280;
  return stranka.screenshot({
    type: "jpeg", quality: 65, fullPage: true,
    ...(vyska > MAX_VYSKA_SNIMKU ? { clip: { x: 0, y: 0, width: sirka, height: MAX_VYSKA_SNIMKU } } : {}),
  });
}
