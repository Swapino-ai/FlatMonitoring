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
// Splatnost ze smlouvy: rocne k 15. 3., pojisteni od 1. 1. 2025 — prvni platba 15. 3. 2025
const s2 = splatnosti({ id: "x", pojistovna: "A", od: "2025-01-01", do: null, frekvence: "ROCNE", castka: 5000, splatnost: "2026-03-15" }, "2026-12-31");
over("splatnost ze smlouvy k 15. 3.", JSON.stringify(s2) === JSON.stringify(["2025-03-15", "2026-03-15"]), s2.join(","));
const s3 = splatnosti({ id: "x", pojistovna: "A", od: "2025-01-10", do: null, frekvence: "POLOLETNE", castka: 5000, splatnost: "2025-01-01" }, "2026-01-31");
over("kotva před začátkem: první splatnost až v době pojištění", JSON.stringify(s3) === JSON.stringify(["2025-07-01", "2026-01-01"]), s3.join(","));
console.log(chyby ? `${chyby} chyb` : "vše v pořádku");
process.exit(chyby ? 1 : 0);
