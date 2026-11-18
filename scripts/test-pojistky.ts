/** Kontrola plateb pojistneho: splatnosti podle frekvence, zmena ceny, ukonceni. */
import { castkaKDatu, platiKDatu, rocniPojistne, splatnosti } from "../src/lib/pojistky";

let chyby = 0;
const over = (popis: string, ok: boolean, detail = "") => { console.log(`${ok ? "✓" : "✗"} ${popis}${detail ? ` (${detail})` : ""}`); if (!ok) chyby++; };

const p = { id: "p", pojistovna: "Kooperativa", od: "2025-03-31", do: null, frekvence: "CTVRTLETNE", castka: 1200, zmeny: [{ validFrom: "2025-03-31", castka: 1000 }, { validFrom: "2026-01-01", castka: 1200 }] };
const s = splatnosti(p, "2026-06-30");
over("čtvrtletně od 31. 3., konec měsíce zarovnán", JSON.stringify(s) === JSON.stringify(["2025-03-31", "2025-06-30", "2025-09-30", "2025-12-31", "2026-03-31", "2026-06-30"]), s.join(","));
over("cena před změnou", castkaKDatu(p, "2025-12-31") === 1000);
over("cena po změně", castkaKDatu(p, "2026-03-31") === 1200);
over("roční pojistné 4 × 1200", rocniPojistne(p, "2026-06-01") === 4800);
const u = { ...p, frekvence: "ROCNE", do: "2026-02-28" };
over("ukončená: jen do konce", JSON.stringify(splatnosti(u, "2027-12-31")) === JSON.stringify(["2025-03-31"]));
over("platí k datu / po konci ne", platiKDatu(u, "2026-01-15") && !platiKDatu(u, "2026-03-01"));
console.log(chyby ? `${chyby} chyb` : "vše v pořádku");
process.exit(chyby ? 1 : 0);
