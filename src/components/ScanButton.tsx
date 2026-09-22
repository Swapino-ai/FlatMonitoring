"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Krok { propertyId: string; dealType: "SALE" | "RENT"; popis: string }

export function ScanButton({ disabled }: { disabled?: boolean }) {
  const [bezi, setBezi] = useState(false);
  const [postup, setPostup] = useState("");
  const [hotovo, setHotovo] = useState<string[]>([]);
  const [chyba, setChyba] = useState("");
  const router = useRouter();

  async function run() {
    setBezi(true);
    setChyba("");
    setHotovo([]);
    setPostup("Zjišťuji, co skenovat…");

    try {
      const res = await fetch("/api/market/scan", { method: "POST", body: "{}" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sken selhal");

      const kroky: Krok[] = data.kroky ?? [];
      if (kroky.length === 0) {
        setPostup("Není co skenovat — nejdřív přidej nemovitost.");
        return;
      }

      const zpravy: string[] = [];

      // Kroky jdou po jednom, aby se každý požadavek vešel do limitu funkce
      for (let i = 0; i < kroky.length; i++) {
        const k = kroky[i];
        setPostup(`${i + 1}/${kroky.length} · ${k.popis}…`);

        const r = await fetch("/api/market/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ propertyId: k.propertyId, dealType: k.dealType }),
        });
        const d = await r.json();

        if (!r.ok) {
          zpravy.push(`${k.popis}: ${d.error ?? "chyba"}`);
          continue;
        }

        const vysledky: { count: number; status: string; message?: string }[] = d.results ?? [];
        const pocet = vysledky.reduce((a, x) => a + x.count, 0);
        const selhalo = vysledky.filter((x) => x.status === "FAILED");

        // Selhani se musi poznat od "nic se nenaslo" — jinak vypada porucha jako prazdny trh
        if (selhalo.length && pocet === 0) {
          zpravy.push(`${k.popis}: nezdařilo se — ${selhalo[0].message ?? "portál neodpověděl"}`);
        } else {
          if (d.valuation) {
            zpravy.push(`${k.popis}: ${pocet} nabídek → nová hodnota ${Math.round(d.valuation.value).toLocaleString("cs-CZ")} Kč`);
          } else if (d.rent) {
            const castka = `${Math.round(d.rent.monthlyRent).toLocaleString("cs-CZ")} Kč/měs`;
            zpravy.push(`${k.popis}: ${pocet} nabídek → ${castka}${d.rent.zapsano ? " (zapsáno)" : ` (beze změny — ${d.rent.duvod})`}`);
          } else {
            zpravy.push(`${k.popis}: ${pocet} nabídek`);
          }
        }
        setHotovo([...zpravy]);
      }

      setPostup("Hotovo.");
      router.refresh();
    } catch (e) {
      setChyba(e instanceof Error ? e.message : "Neznámá chyba");
    } finally {
      setBezi(false);
    }
  }

  return (
    <div className="no-print space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={run} disabled={disabled || bezi} className="btn btn-primary">
          {bezi ? "Skenuji trh…" : "Spustit sken trhu"}
        </button>
        {postup && <span className="text-sm text-ink-secondary">{postup}</span>}
        {chyba && <span className="text-sm text-bad">{chyba}</span>}
      </div>

      {hotovo.length > 0 && (
        <ul className="space-y-0.5 text-xs">
          {hotovo.map((z, i) => (
            <li key={i} className={z.includes("nezdařilo se") ? "text-warn" : "text-ink-muted"}>{z}</li>
          ))}
        </ul>
      )}

      {bezi && (
        <p className="text-xs text-ink-muted">
          Jeden dotaz trvá 15–20 sekund, protože se prochází víc stránek výpisu. Nezavírej stránku.
        </p>
      )}
    </div>
  );
}
