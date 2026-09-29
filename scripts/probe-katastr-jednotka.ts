/**
 * Druha sonda katastru: jak se ciselniky filtruji a co vrati skutecna adresa.
 *
 * Prvni pokus ukazal, ze parametr "nazev" ciselniky ignoruji — vraci cely
 * seznam od Abertam dal. Ostatni parametry API jsou psane velkym pismenem
 * (KodCastiObce), takze se zkousi "Nazev". Zaroven se overi, jestli jde cast
 * obce dohledat podle kodu obce.
 */

const KLIC = process.env.KATASTR_API_KEY ?? "";
const ZAKLAD = "https://api-kn.cuzk.gov.cz/api/v1";

async function ptejSe(cesta: string, popis: string) {
  const r = await fetch(ZAKLAD + cesta, { headers: { Accept: "application/json", ApiKey: KLIC } });
  const telo = await r.text();
  console.log(`\n[${r.status}] ${popis}\n  ${cesta}\n  ${telo.slice(0, 1200)}`);
  return telo;
}

async function main() {
  if (!KLIC) { console.log("KATASTR_API_KEY není nastavený."); return; }

  console.log("=== Jak se filtrují číselníky ===");
  await ptejSe("/CiselnikyUzemnichJednotek/Obce?Nazev=Litom%C4%9B%C5%99ice", "Obce, parametr Nazev");
  await ptejSe("/CiselnikyUzemnichJednotek/Obce?nazevObce=Litom%C4%9B%C5%99ice", "Obce, parametr nazevObce");
  await ptejSe("/CiselnikyUzemnichJednotek/CastiObci?Nazev=Litom%C4%9B%C5%99ice", "Části obcí, parametr Nazev");
  await ptejSe("/CiselnikyUzemnichJednotek/CastiObci?KodObce=564567", "Části obcí podle kódu obce Litoměřic");
  await ptejSe("/CiselnikyUzemnichJednotek/KatastralniUzemi?KodObce=564567", "Katastrální území Litoměřic");

  console.log("\n=== Skutečné adresy ===");
  // Litomerice maji kod obce 564567; cast obce se doplni z odpovedi vys.
  // Topolcianska 437/18 je byt v bytovem dome — hleda se stavba i jednotka.
  await ptejSe("/Stavby/Vyhledani?KodObce=564567&CisloDomovni=437&TypStavby=1", "Stavba 437 v Litoměřicích podle kódu obce");
  await ptejSe("/Jednotky/Vyhledani?KodObce=564567&CisloDomovni=437&TypStavby=1", "Jednotky v domě 437");
  // Garaz ma evidencni cislo, ne popisne — jiny typ stavby
  await ptejSe("/Stavby/Vyhledani?KodObce=564567&CisloDomovni=123&TypStavby=2", "Stavba s evidenčním číslem 123");

  await ptejSe("/AplikacniSluzby/StavUctu", "Stav účtu");
}

main();

export {};
