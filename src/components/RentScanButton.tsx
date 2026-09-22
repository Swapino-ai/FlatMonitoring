"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Rucni sken najmu pro jeden byt — nez se v noci spusti ten automaticky.
 * Hodi se, kdyz zrovna resis, za kolik pronajmout, a nechces cekat do rana.
 */
export function RentScanButton({ propertyId }: { propertyId: string }) {
  const [bezi, setBezi] = useState(false);
  const [zprava, setZprava] = useState("");
  const [chyba, setChyba] = useState("");
  const router = useRouter();

  async function run() {
    setBezi(true);
    setChyba("");
    setZprava("");
    try {
      const r = await fetch("/api/market/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, dealType: "RENT" }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Sken selhal");

      const vysledky: { count: number; status: string; message?: string }[] = d.results ?? [];
      const pocet = vysledky.reduce((a: number, x) => a + x.count, 0);
      const selhalo = vysledky.filter((x) => x.status === "FAILED");

      // Porucha portalu musi vypadat jinak nez prazdny trh
      if (selhalo.length && pocet === 0) {
        setChyba(selhalo[0].message ?? "portál neodpověděl");
      } else if (!d.rent) {
        setZprava(`${pocet} nabídek — na odhad je jich málo, hodnota beze změny.`);
      } else {
        const castka = `${Math.round(d.rent.monthlyRent).toLocaleString("cs-CZ")} Kč/měs`;
        setZprava(d.rent.zapsano
          ? `${castka} z ${pocet} nabídek — zapsáno do historie.`
          : `${castka} z ${pocet} nabídek — beze změny (${d.rent.duvod}).`);
      }
      router.refresh();
    } catch (e) {
      setChyba(e instanceof Error ? e.message : "Neznámá chyba");
    } finally {
      setBezi(false);
    }
  }

  return (
    <div className="no-print mt-3 border-t border-line pt-3">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={run} disabled={bezi} className="btn">
          {bezi ? "Skenuji nájmy…" : "Skenovat nájmy teď"}
        </button>
        {zprava && <span className="text-sm text-ink-secondary">{zprava}</span>}
        {chyba && <span className="text-sm text-bad">{chyba}</span>}
      </div>
      {bezi && (
        <p className="mt-1.5 text-xs text-ink-muted">
          Trvá 15–20 sekund, prochází se víc stránek výpisu. Nezavírej stránku.
        </p>
      )}
      {!bezi && !zprava && !chyba && (
        <p className="mt-1.5 text-xs text-ink-muted">
          Sken běží sám každou noc — tohle je, když nechceš čekat do rána.
        </p>
      )}
    </div>
  );
}
