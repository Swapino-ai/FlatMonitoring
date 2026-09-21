/**
 * Vysvetlivky ukazatelu. Vedle definice vzdy rikaji, jak cislo cist —
 * samotny vzorec bez vykladu nikomu nepomuze.
 */

export interface Vysvetlivka {
  nazev: string;
  popis: string;
  /** Jak hodnotu cist — kdy je dobra, kdy varuje. */
  vyklad?: string;
  vzorec?: string;
}

export const TERMS: Record<string, Vysvetlivka> = {
  // --- Výnosnost ---
  hrubyVynos: {
    nazev: "Hrubý výnos",
    popis: "Roční nájemné vydělené celkovou pořizovací cenou. Neodečítá žádné náklady, takže je vždy vyšší než skutečnost.",
    vzorec: "roční nájemné ÷ (kupní cena + vedlejší náklady + rekonstrukce)",
    vyklad: "Slouží k rychlému porovnání bytů mezi sebou, ne k rozhodování. U českých bytů bývá 3–5 %.",
  },
  cistyVynos: {
    nazev: "Čistý výnos",
    popis: "Nájemné po odečtení provozních nákladů, vydělené pořizovací cenou. Splátky úvěru se sem nepočítají.",
    vzorec: "(roční nájemné − provozní náklady) ÷ celková investice",
    vyklad: "Tohle je skutečná výnosnost bytu bez ohledu na to, jak je financovaný. Pod 2 % se investice sotva vyplatí proti spořicímu účtu.",
  },
  capRate: {
    nazev: "Cap rate",
    popis: "Totéž co čistý výnos, ale dělí se aktuální tržní hodnotou místo pořizovací cenou.",
    vzorec: "(roční nájemné − provozní náklady) ÷ tržní hodnota",
    vyklad: "Ukazuje, co byt vynáší dnes. Když je výrazně nižší než čistý výnos, byt hodně zdražil — kapitál v něm vázaný vynáší málo a stojí za úvahu prodej.",
  },
  cashOnCash: {
    nazev: "Cash-on-cash",
    popis: "Kolik ročně vyděláš na každou korunu vlastních peněz, které jsi do bytu vložil. Počítá s tím, že zbytek zaplatila banka.",
    vzorec: "roční cash flow po splátkách ÷ vlastní vložený kapitál",
    vyklad: "Tohle je jediný výnos, který skutečně vidíš na účtu. Může být záporný, i když je byt ziskový — splátka totiž umořuje i jistinu, což je tvůj majetek, ne náklad.",
  },
  irr: {
    nazev: "IRR — vnitřní výnosové procento",
    popis: "Roční zhodnocení vložených peněz se započtením času. Zahrnuje nájem, splátky i nárůst hodnoty, jako bys dnes prodával.",
    vyklad: "Nejpoctivější jediné číslo o investici. Porovnávej ho s alternativou — akciovým indexem kolem 7 % ročně. Roky bez zaúčtovaných pohybů se modelují ze smluvního nájmu, takže je to odhad.",
  },
  noi: {
    nazev: "NOI — provozní zisk",
    popis: "Nájemné minus provozní náklady, tedy před splátkami úvěru a daní.",
    vyklad: "Říká, kolik byt vydělá sám o sobě. Záměrně ignoruje financování, aby šly porovnat byty s hypotékou i bez ní.",
  },

  // --- Dluh ---
  ltv: {
    nazev: "LTV — poměr úvěru k hodnotě",
    popis: "Jakou část tržní hodnoty bytu dluží bance.",
    vzorec: "zbývající jistina ÷ tržní hodnota",
    vyklad: "Pod 80 % banky refinancují ochotně, pod 60 % dávají lepší sazby. Vysoké LTV znamená velkou páku: zhodnocení i propad se ti násobí.",
  },
  dscr: {
    nazev: "DSCR — krytí dluhové služby",
    popis: "Kolikrát provozní zisk pokryje roční splátky úvěru.",
    vzorec: "provozní zisk (NOI) ÷ roční splátky",
    vyklad: "Banky chtějí aspoň 1,2. Pod 1,0 nájem na splátku nestačí a rozdíl doplácíš ze svého — což nemusí vadit, pokud je to záměr, ale musíš to vědět.",
  },
  fixace: {
    nazev: "Konec fixace",
    popis: "Do kdy platí sjednaná úroková sazba. Pak se stanoví nová podle trhu.",
    vyklad: "Refinancování řeš zhruba šest měsíců předem. Na poslední chvíli nemáš vyjednávací pozici a banka to ví.",
  },
  jistinaUroky: {
    nazev: "Jistina a úroky",
    popis: "Splátka se dělí na úrok (cena za půjčení) a jistinu (umořování dluhu).",
    vyklad: "Daňově uznatelné jsou jen úroky. Jistina je převod peněz do vlastního majetku, ne náklad — proto zhoršuje cash flow, ale ne bohatství.",
  },
  vlastniKapital: {
    nazev: "Vlastní vložený kapitál",
    popis: "Kolik vlastních peněz je v bytě — pořizovací cena minus to, co půjčila banka.",
    vyklad: "Základ pro cash-on-cash. Čím menší akontace, tím vyšší výnos z vlastních peněz, ale i vyšší riziko.",
  },
  equity: {
    nazev: "Vlastní kapitál v nemovitosti",
    popis: "Tržní hodnota minus zbývající dluh — co by ti zbylo po prodeji a splacení úvěru.",
  },

  // --- Provoz ---
  breakeven: {
    nazev: "Breakeven nájem",
    popis: "Nájem, při kterém je cash flow přesně nulový.",
    vzorec: "(provozní náklady + splátky) ÷ 12",
    vyklad: "Spodní hranice, pod kterou na byt doplácíš. Užitečné při vyjednávání s nájemníkem i při rozhodování, jestli snížit nájem kvůli rychlejšímu obsazení.",
  },
  nakladovost: {
    nazev: "Nákladovost",
    popis: "Jakou část nájmu spolknou provozní náklady.",
    vyklad: "U bytu bývá 25–35 %. Výrazně víc znamená buď podhodnocený nájem, nebo drahý provoz — a v sekci Úspory se dá hledat kde.",
  },
  pruchozi: {
    nazev: "Průchozí položka",
    popis: "Zálohy na energie a služby, které vybereš od nájemníka a pošleš dodavatelům.",
    vyklad: "Nejsou tvůj příjem ani výdaj, jen procházejí. Do daňového přiznání nevstupují, pokud je řádně vyúčtuješ.",
  },

  // --- Daně ---
  pausal: {
    nazev: "Paušální výdaje 30 %",
    popis: "Místo dokládání skutečných výdajů odečteš 30 % z příjmů, nejvýš 600 000 Kč ročně.",
    vyklad: "Jednodušší, ale při hypotéce a odpisech obvykle nevýhodné — ty dohromady bývají víc než 30 %. Aplikace obě varianty spočítá a doporučí lepší.",
  },
  odpisy: {
    nazev: "Odpisy",
    popis: "Postupné rozpouštění pořizovací ceny budovy do daňových výdajů. U bytů 30 let.",
    vyklad: "Výdaj, který nestojí žádné peníze — proto snižuje daň, ale ne cash flow. Uplatní se jen při skutečných výdajích, ne při paušálu.",
  },
  vstupniCena: {
    nazev: "Vstupní cena pro odpisy",
    popis: "Kupní cena plus vedlejší náklady a technické zhodnocení, minus podíl na pozemku.",
    vyklad: "Pozemek se neodepisuje, protože se neopotřebovává. Když jeho hodnotu neodečteš, odepisuješ víc, než smíš.",
  },
  odpisovaSkupina: {
    nazev: "Odpisová skupina",
    popis: "Zákon řadí majetek do skupin podle doby odpisování. Zděné a panelové bytové domy patří do 5. skupiny, tedy 30 let.",
  },
  zakladDane: {
    nazev: "Dílčí základ daně dle § 9",
    popis: "Příjmy z nájmu minus uplatněné výdaje. Sčítá se s ostatními dílčími základy do celkového základu daně.",
    vyklad: "Máš-li i příjem ze zaměstnání, slevu na poplatníka uplatníš jen jednou za všechny dohromady.",
  },
  progresivniSazba: {
    nazev: "Progresivní sazba",
    popis: "Do zákonné hranice se daní 15 %, nad ní 23 %.",
    vyklad: "Hranice je 36násobek průměrné mzdy a každý rok se mění — aplikace ji má v tabulce, kterou je dobré jednou za rok zkontrolovat.",
  },
  casovyTest: {
    nazev: "Časový test",
    popis: "Doba držby, po které je příjem z prodeje osvobozen od daně. 10 let, u nemovitostí nabytých do konce roku 2020 pět let.",
    vyklad: "Osvobození lze získat i dřív, když peníze použiješ na vlastní bytovou potřebu — to je ale nutné oznámit správci daně.",
  },

  // --- Trh ---
  medianTrhu: {
    nazev: "Medián trhu",
    popis: "Prostřední cena za m² ze srovnatelných nabídek — stejné město, dispozice a plocha ±25 %.",
    vyklad: "Medián se používá místo průměru, protože ho neutáhne jeden luxusní byt. Jde o nabídkové ceny; realizované bývají o 5–10 % nižší.",
  },
  vzorekNabidek: {
    nazev: "Velikost vzorku",
    popis: "Z kolika nabídek medián vznikl.",
    vyklad: "Pod tři nabídky se odhad vůbec nepočítá. Do sedmi ho ber jako orientační, nad patnáct je už docela spolehlivý.",
  },

  // --- Úspory ---
  objemovaSleva: {
    nazev: "Objemová sleva",
    popis: "Odhad, o kolik jde srazit cenu, když stejnou službu poptáš pro všechny byty jako jeden kontrakt.",
    vyklad: "Je to vyjednávací výchozí bod, ne příslib. Výsledek si zapiš zpět do evidence služeb.",
  },
  sjednoceni: {
    nazev: "Sjednocení na nejlepší cenu",
    popis: "Kolik ušetříš, když všechny byty dostanou tu nejlepší cenu, kterou už u některého z nich máš.",
    vyklad: "Nejjistější úspora ze všech — tu cenu ti někdo už jednou dal, takže se o ní nedá říct, že je nereálná.",
  },
};
