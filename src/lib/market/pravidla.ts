/**
 * Pravidla, podle kterych vznika odhad ceny a najmu.
 *
 * Jedine misto, kde jsou cisla popsana slovy. Stranka "Jak vzniká odhad" je
 * cte odsud, takze popis nemuze zestarnout proti kodu — dokud ho nekdo
 * nezmeni na obou mistech, nezmeni se nikde.
 */
import { MAX_OKRUH_KM, VYCHOZI_OKRUH_KM } from "../geo";

/** Kolik nabidek staci, aby se okruh prestal rozsirovat. */
export const CILOVY_VZOREK = 8;

/** Pod tolik nabidek uz odhad nevznikne. */
export const MIN_VZOREK = 3;

/** Plocha srovnatelne nabidky se smi lisit nejvys o tolik. */
export const TOLERANCE_PLOCHY_PCT = 25;

/** Nejmensi tolerance v m², aby u malych jednotek nebyla nesmyslne uzka. */
export const MIN_TOLERANCE_M2 = 10;

/** Jak stare nabidky se jeste pocitaji. */
export const STARI_DNU = { SALE: 60, RENT: 30 } as const;

/** O kolik se musi odhad zmenit, aby vznikl novy zaznam v historii. */
export const TOLERANCE_ZMENY_PCT = { SALE: 0.5, RENT: 1 } as const;

export interface Krok {
  nadpis: string;
  popis: string;
  /** Co na tenhle krok muze uzivatel u jednotky nastavit. */
  nastaveni?: string;
}

/** Postup od stazeni nabidek po zapis do historie, jak ho dela sken. */
export const POSTUP: Krok[] = [
  {
    nadpis: "1. Stáhnou se nabídky",
    popis: `Každou noc se pro každou nemovitost stáhnou prodejní i nájemní nabídky ze Sreality — `
      + `podle obce a druhu nemovitosti. Když obec vlastní výpis nemá (malé obce ho nemají), `
      + `stáhne se celý kraj a zúží se až podle vzdálenosti.`,
  },
  {
    nadpis: "2. Vyřadí se nesrovnatelné",
    popis: `Zůstanou nabídky s plochou do ±${TOLERANCE_PLOCHY_PCT} % tvojí (nejméně ±${MIN_TOLERANCE_M2} m²) `
      + `a se stejnou dispozicí. Když se stejnou dispozicí nezbydou aspoň ${MIN_VZOREK}, `
      + `dispozice se pustí a porovnává se jen podle plochy — je to znát na spolehlivosti.`,
    nastaveni: "Obce, ze kterých se nabídky nepřičítají.",
  },
  {
    nadpis: "3. Určí se okruh",
    popis: `Hledá se od nejužšího okruhu pro daný druh a zdvojnásobuje se, dokud není `
      + `${CILOVY_VZOREK} nabídek — nejvýš do ${MAX_OKRUH_KM} km. Dál už je to jiný trh. `
      + `Hlásí se nejužší okruh, ve kterém vybrané nabídky opravdu leží.`,
    nastaveni: "Pevný okruh v km. Zadaný okruh se nerozšiřuje.",
  },
  {
    nadpis: "4. Spočítá se medián",
    popis: `Z cen za m² se vezme medián a vynásobí tvojí plochou. Medián, ne průměr — `
      + `jedna přemrštěná nabídka by průměr utáhla, medián ne. `
      + `Pod ${MIN_VZOREK} nabídky odhad nevznikne vůbec.`,
  },
  {
    nadpis: "5. Označí se spolehlivost",
    popis: `Odhad jen z nabídek v téže obci je kvalifikovaný. Široký okruh nebo puštěná `
      + `dispozice spolehlivost snižují. Ruční zásah má přednost před vším.`,
  },
  {
    nadpis: "6. Zapíše se jen změna",
    popis: `Do historie se zapíše, až když se odhad pohne o víc než `
      + `${TOLERANCE_ZMENY_PCT.SALE} % u ceny a ${TOLERANCE_ZMENY_PCT.RENT} % u nájmu. `
      + `Denní sken by jinak za rok vyrobil 365 skoro shodných řádků.`,
  },
];

/** Vychozi okruhy podle druhu, pro vypis v prehledu. */
export const OKRUHY_PREHLED = Object.entries(VYCHOZI_OKRUH_KM)
  .map(([klic, km]) => ({ klic, km }))
  .sort((a, b) => a.km - b.km);
