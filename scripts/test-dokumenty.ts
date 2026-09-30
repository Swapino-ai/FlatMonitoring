import { bezpecneJmeno, cestaSlozek, chybaKontextu, chybaSouboru, plnyKlic, type KontextPopisky } from "../src/lib/dokumenty";

let chyb = 0;
const over = (n: string, ok: boolean, d?: unknown) => { if (!ok) { chyb++; console.error("CHYBA:", n, d ?? ""); } };
const nazvy = (k: KontextPopisky) => cestaSlozek(k).map((s) => s.nazev).join("/");

const zaklad = { propertyId: "p1", propertyNazev: "Vinohrady 2+kk", tenantId: "t1", tenantPopisek: "N-0001 Milena Svobodová",
  sluzbaKlic: "ELECTRICITY", sluzbaNazev: "Elektřina", rok: 2025 };

over("smlouva najemce", nazvy({ ...zaklad, kategorie: "NAJEMNI_SMLOUVA" }) === "Nemovitosti/Vinohrady 2+kk/02 Nájemní smlouvy/N-0001 Milena Svobodová");
over("vyuctovani", nazvy({ ...zaklad, kategorie: "SLUZBA_VYUCTOVANI" }) === "Nemovitosti/Vinohrady 2+kk/04 Vyúčtování/2025/Elektřina");
over("dane", nazvy({ ...zaklad, kategorie: "DANE" }) === "Nemovitosti/Vinohrady 2+kk/06 Daně/2025");
over("doklad najemce mimo nemovitost", nazvy({ ...zaklad, kategorie: "NAJEMCE_DOKLAD" }) === "Nájemníci/N-0001 Milena Svobodová");
over("ostatni", nazvy({ kategorie: "OSTATNI" }) === "Ostatní");
over("kupni smlouva bez najemce", nazvy({ kategorie: "KUPNI_SMLOUVA", propertyId: "p1", propertyNazev: "X" }) === "Nemovitosti/X/01 Nabytí a katastr".replace("Nabytí", "Nabytí"));

// Chybejici povinne udaje
over("bez nemovitosti", chybaKontextu({ kategorie: "UVER" }) === "Chybí nemovitost.");
over("bez roku", chybaKontextu({ kategorie: "DANE", propertyId: "p1" }) === "Chybí rok.");
over("hloupy rok", chybaKontextu({ kategorie: "DANE", propertyId: "p1", rok: 1800 }) === "Chybí rok.");
over("vyhodi vyjimku", (() => { try { cestaSlozek({ kategorie: "UVER" }); return false; } catch { return true; } })());

// Klice jsou stabilni a nezavisi na nazvu
const a = cestaSlozek({ ...zaklad, kategorie: "NAJEMNI_SMLOUVA" });
const b = cestaSlozek({ ...zaklad, propertyNazev: "Prejmenovano", kategorie: "NAJEMNI_SMLOUVA" });
over("klic bez ohledu na prejmenovani", plnyKlic(a, a.length - 1) === plnyKlic(b, b.length - 1), plnyKlic(a, a.length - 1));
over("klic je hierarchicky", plnyKlic(a, 1) === "NEM/P:p1");

// Nazvy
over("lomitka", bezpecneJmeno("a/b\\c:d") === "a-b-c-d");
over("prazdne", bezpecneJmeno("   ") === "Bez názvu");
over("tecka na zacatku", bezpecneJmeno("..skryte") === "skryte");
over("dlouhe", bezpecneJmeno("x".repeat(500)).length === 100);
over("ridici znaky", bezpecneJmeno("a\u0000b\nc") === "a b c");

// Soubory
over("ok pdf", chybaSouboru("smlouva.pdf", 1000) === null);
over("exe", chybaSouboru("virus.exe", 1000) != null);
over("prazdny", chybaSouboru("a.pdf", 0) != null);
over("obri", chybaSouboru("a.pdf", 200 * 1024 * 1024) != null);
over("bez nazvu", chybaSouboru(" ", 10) != null);

console.log(chyb ? `${chyb} chyb` : "vše v pořádku");
process.exit(chyb ? 1 : 0);
