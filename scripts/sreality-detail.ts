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
    return { stav: "NENI", text, fotky: [] };
  }
  if (!naDetailu || !estate) return { stav: "NEVIM", text, fotky: [] };

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
  return { stav: "OK", text, fotky: [...new Set(fotky)] };
}

/**
 * Zavre vyskakovaci okna (nabidka Premium, aplikace, newsletter) a skryje prekryvy,
 * aby screenshot ukazoval inzerat. Reklamni ramecky Seznamu taky schova.
 */
export async function uklidStranku(stranka: Page): Promise<void> {
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
