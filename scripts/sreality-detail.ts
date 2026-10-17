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

/** Velikost fotek, ktere se ukladaji a ukazuji v aplikaci */
const FORMAT_FOTKY = "?fl=res,1600,1600,1|jpg,85";

const NEEXISTUJE = /inzerát (již |už )?neexistuje|inzerát nebyl nalezen|inzerát byl (smazán|odstraněn|stažen)|stránka nebyla nalezena|tato nabídka již není/i;

export async function nactiDetail(stranka: Page, url: string, externalId: string): Promise<DetailInzeratu> {
  const odpoved = await stranka.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  // Souhlas s cookies (Seznam CMP) by jinak prekryl celou stranku
  await stranka.getByRole("button", { name: /souhlasím|přijmout vše|rozumím/i }).first().click({ timeout: 4000 }).catch(() => undefined);
  await stranka.waitForTimeout(2500);

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

  const fotky = (estate.images ?? [])
    .filter((im) => typeof im.url === "string" && im.url.includes("sdn.cz"))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((im) => `${im.url!.startsWith("//") ? "https:" : ""}${im.url!.split("?")[0]}${FORMAT_FOTKY}`);
  return { stav: "OK", text, fotky: [...new Set(fotky)] };
}
