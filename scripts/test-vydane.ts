import { dalsiCislo, doporucenaZaloha, kolize, lhutaDoruceni, stavLhuty, textZpravy, variabilniSymbol, vychoziSplatnost, type SnapshotVyuctovani } from "../src/lib/vyuctovaniVydane";
let chyb = 0;
const over = (n: string, ok: boolean, d?: unknown) => { if (!ok) { chyb++; console.error("CHYBA:", n, d ?? ""); } };

over("prvni cislo", dalsiCislo(2026, []) === "VN-2026-0001");
over("dalsi cislo", dalsiCislo(2026, ["VN-2026-0001", "VN-2026-0007", "VN-2025-0099"]) === "VN-2026-0008");
over("novy rok", dalsiCislo(2027, ["VN-2026-0007"]) === "VN-2027-0001");
over("vs", variabilniSymbol("VN-2026-0008") === "20260008");
over("lhuta 4 mesice", lhutaDoruceni("2025-12-31") === "2026-05-01", lhutaDoruceni("2025-12-31"));
over("splatnost 30 dni", vychoziSplatnost("2026-01-15") === "2026-02-14");

// Doporucena zaloha: rocni naklady 36 500 za 365 dni -> ~3042/mes -> 3050
over("doporucena zaloha", doporucenaZaloha(36500, "2025-01-01", "2025-12-31", 2500) === 3050, doporucenaZaloha(36500, "2025-01-01", "2025-12-31", 2500));
over("sedi -> null", doporucenaZaloha(36500, "2025-01-01", "2025-12-31", 3040) === null);
over("kratke obdobi -> null", doporucenaZaloha(5000, "2025-01-01", "2025-02-28", 100) === null);
over("zadne naklady -> null", doporucenaZaloha(0, "2025-01-01", "2025-12-31", 100) === null);

// Kolize
const ex = [{ cislo: "VN-1", od: "2025-01-01", do: "2025-06-30", status: "VYDANO" }, { cislo: "VN-2", od: "2025-07-01", do: "2025-12-31", status: "STORNO" }];
over("kolize ano", kolize(ex, "2025-06-01", "2025-07-31")?.cislo === "VN-1");
over("storno nekoliduje", kolize(ex, "2025-08-01", "2025-09-30") === null);
over("bez kolize", kolize(ex, "2026-01-01", "2026-03-31") === null);

// Lhuty
over("po splatnosti", stavLhuty({ status: "ODESLANO", dueDate: "2026-01-10" }, "2026-01-15").poSplatnosti);
over("dni do splatnosti", stavLhuty({ status: "VYDANO", dueDate: "2026-01-20" }, "2026-01-15").dni === 5);
over("vyporadano nema lhutu", stavLhuty({ status: "VYPORADANO", dueDate: "2026-01-10" }, "2026-01-15").dni === null);

// Text zpravy
const s: SnapshotVyuctovani = {
  verze: 1, nemovitost: { nazev: "Byt 11", adresa: "Terezínská 343" },
  najemce: { cislo: "N-0001", name: "Milena Svobodová", adresa: "", email: "m@x.cz", phone: null, ucet: "19-2000145399/0800" },
  pronajimatel: { name: "Olga Nebeská", adresa: "", ucet: "123456789/0800" },
  od: "2025-01-01", do: "2025-12-31", radky: [], naklady: 40000, zalohy: 36000, rozdil: -4000,
  nepokryto: [], aktualniZaloha: 3000, doporucenaZaloha: 3400,
};
const t = textZpravy(s, "VN-2026-0001", "2026-02-14");
over("predmet", t.predmet.includes("1. 1. 2025 – 31. 12. 2025") && t.predmet.includes("Byt 11"), t.predmet);
over("nedoplatek v textu", t.telo.includes("Nedoplatek: 4 000 Kč") && t.telo.includes("Variabilní symbol: 20260001") && t.telo.includes("14. 2. 2026"), t.telo);
over("zalohy v textu", t.telo.includes("z 3 000 Kč na 3 400 Kč"), t.telo);
const p = textZpravy({ ...s, rozdil: 1500, doporucenaZaloha: null }, "VN-2026-0002", "2026-02-14");
over("preplatek s uctem najemce", p.telo.includes("Přeplatek: 1 500 Kč") && p.telo.includes("19-2000145399/0800"), p.telo);
over("sedi", textZpravy({ ...s, rozdil: 0.2 }, "X", null).telo.includes("nic se nedoplácí"));
console.log(chyb ? `${chyb} chyb` : "vše v pořádku");
process.exit(chyb ? 1 : 0);
