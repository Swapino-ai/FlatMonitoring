import type { MarketSource, ScanQuery, ScrapedListing } from "./types";
import { filtrujSrovnatelne, nactiStranku, odkazyZVypisu, plochaZNazvu, slugMesta, sleep } from "./util";

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
  locality?: { city?: string; citySeoName?: string; cityPart?: string; quarter?: string };
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

    for (let strana = 1; strana <= maxPages; strana++) {
      // Dispozici ve filtru adresy Sreality neprijimaji (vraci 404),
      // takze si ji odfiltrujeme az z vysledku.
      const url = `https://www.sreality.cz/hledani/${typ}/byty/${mesto}${strana > 1 ? `?strana=${strana}` : ""}`;

      const { data, html } = await nactiStranku(url);
      // Odkaz na detail se z dat stranky poskladat neda — v ceste je slug ulice,
      // ktery v nich neni. Bereme ho tedy primo z odkazu ve vypisu.
      const odkazy = odkazyZVypisu(html);
      const zaznamy = najdiVysledky(data);
      if (zaznamy.length === 0) break;

      for (const z of zaznamy) {
        // priceCzk === 0 znamena "cena na vyzadani" — do medianu takovou nabidku nepustime
        const cena = Number(z.priceCzk ?? 0);
        if (!cena || cena <= 0) continue;

        const zaM2 = Number(z.priceCzkPerSqM ?? 0) || undefined;
        // Plochu dopocitame z ceny, kde to jde — je presnejsi nez zaokrouhleny udaj v nazvu
        const plocha = zaM2 ? Math.round((cena / zaM2) * 10) / 10 : plochaZNazvu(z.name);

        out.push({
          source: "SREALITY",
          externalId: z.id ? String(z.id) : undefined,
          dealType: query.dealType,
          city: z.locality?.city ?? query.city,
          district: z.locality?.cityPart ?? z.locality?.quarter ?? query.district,
          disposition: z.categorySubCb?.name,
          areaM2: plocha,
          price: cena,
          pricePerM2: zaM2 ?? (plocha ? cena / plocha : undefined),
          url: z.id ? odkazy.get(String(z.id)) : undefined,
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
