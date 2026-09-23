import type { MarketSource, ScanQuery, ScrapedListing } from "./types";
import { filtrujSrovnatelne, nactiStranku, odkazyZVypisu, plochaZNazvu, slugMesta, sleep } from "./util";
import { NEMOVITOST_MAP } from "../catalogs";

/**
 * Sreality zrusily verejne JSON API (/api/cs/v2/estates vraci 404).
 * Data proto bereme ze stranky vypisu, kde je Next.js vklada do __NEXT_DATA__.
 *
 * Cesta k inzeratum: props.pageProps.dehydratedState.queries[].state.data.results
 * Kazdy zaznam nese primo priceCzk i priceCzkPerSqM, takze cenu za m² nedopocitavame.
 */

interface SrealityZaznam {
  id?: number;
  name?: string;
  priceCzk?: number;
  priceCzkPerSqM?: number;
  categorySubCb?: { name?: string };
  locality?: {
    city?: string; citySeoName?: string; cityPart?: string; quarter?: string;
    latitude?: number; longitude?: number;
  };
}

export const srealitySource: MarketSource = {
  name: "SREALITY",

  async fetchListings(query: ScanQuery): Promise<ScrapedListing[]> {
    const out: ScrapedListing[] = [];
    // Po odfiltrovani dispozice a velikosti zbyde z jedne stranky jen par nabidek,
    // takze nacitame dal, dokud nemame dost vzorku nebo nedojdou stranky.
    const cilovyVzorek = query.targetSample ?? 15;
    const maxPages = query.maxPages ?? 10;
    const typ = query.dealType === "SALE" ? "prodej" : "pronajem";
    const mesto = slugMesta(query.city);
    const kategorie = query.category ?? "BYT";
    const druh = NEMOVITOST_MAP.get(kategorie);
    // Bez overene cesty nemovitost neskenujeme — hadat tvar adresy se nevyplaci
    if (!druh?.srealityCesta) return [];
    const cesta = druh.srealityCesta;
    const podkategorie = druh.srealityPodkategorie;

    for (let strana = 1; strana <= maxPages; strana++) {
      // Dispozici ve filtru adresy Sreality neprijimaji (vraci 404),
      // takze si ji odfiltrujeme az z vysledku.
      const url = `https://www.sreality.cz/hledani/${typ}/${cesta}/${mesto}${strana > 1 ? `?strana=${strana}` : ""}`;

      // V malem meste je garazi par a druha stranka vubec neexistuje — portal
      // na ni vraci 404. To neni porucha: jen uz nic dalsiho neni. Chybu proto
      // propoustime jen z prvni stranky, jinak by se zahodily i nabidky, ktere
      // uz mame nactene.
      let stranka: { data: unknown; html: string };
      try {
        stranka = await nactiStranku(url);
      } catch (e) {
        if (strana === 1) throw e;
        break;
      }
      const { data, html } = stranka;
      // Odkaz na detail se z dat stranky poskladat neda — v ceste je slug ulice,
      // ktery v nich neni. Bereme ho tedy primo z odkazu ve vypisu.
      const odkazy = odkazyZVypisu(html);
      const zaznamy = najdiVysledky(data);
      if (zaznamy.length === 0) break;

      for (const z of zaznamy) {
        // priceCzk === 0 znamena "cena na vyzadani" — do medianu takovou nabidku nepustime
        const cena = Number(z.priceCzk ?? 0);
        if (!cena || cena <= 0) continue;

        // Cesta "ostatni" michá garáže, garážová stání i půdní prostory
        if (podkategorie && z.categorySubCb?.name !== podkategorie) continue;

        const zaM2 = Number(z.priceCzkPerSqM ?? 0) || undefined;
        // Plochu dopocitame z ceny, kde to jde — je presnejsi nez zaokrouhleny udaj v nazvu
        const plocha = zaM2 ? Math.round((cena / zaM2) * 10) / 10 : plochaZNazvu(z.name);

        out.push({
          source: "SREALITY",
          externalId: z.id ? String(z.id) : undefined,
          dealType: query.dealType,
          category: kategorie,
          city: z.locality?.city ?? query.city,
          district: z.locality?.cityPart ?? z.locality?.quarter ?? query.district,
          disposition: z.categorySubCb?.name,
          areaM2: plocha,
          price: cena,
          pricePerM2: zaM2 ?? (plocha ? cena / plocha : undefined),
          url: z.id ? odkazy.get(String(z.id)) : undefined,
          // Podle souradnic pak hledame srovnani v okruhu, ne podle nazvu ctvrti
          latitude: z.locality?.latitude,
          longitude: z.locality?.longitude,
        });
      }

      // Dost srovnatelnych nabidek? Dal uz portal zbytecne nezatezujeme.
      if (filtrujSrovnatelne(out, query).length >= cilovyVzorek) break;

      if (strana < maxPages) await sleep(1500); // ohleduplne tempo
    }

    return filtrujSrovnatelne(out, query);
  },
};

/** Inzeraty jsou v dehydratovanem stavu React Query, index dotazu se meni. */
function najdiVysledky(data: unknown): SrealityZaznam[] {
  const queries = (data as any)?.props?.pageProps?.dehydratedState?.queries;
  if (!Array.isArray(queries)) return [];

  for (const q of queries) {
    const results = q?.state?.data?.results;
    if (Array.isArray(results) && results.length > 0 && "priceCzk" in results[0]) {
      return results as SrealityZaznam[];
    }
  }
  return [];
}
