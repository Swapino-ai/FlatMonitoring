"use client";

import { useState } from "react";
import { Card } from "./Stat";

export function DataTransfer() {
  const [stav, setStav] = useState("");
  const [chyba, setChyba] = useState("");
  const [bezi, setBezi] = useState(false);

  async function stahni() {
    setChyba(""); setStav("Připravuji zálohu…");
    try {
      const res = await fetch("/api/data/export");
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `flatmonitoring-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStav(`Staženo (${(blob.size / 1024).toFixed(0)} kB).`);
    } catch (e) {
      setChyba(e instanceof Error ? e.message : "Stažení selhalo.");
      setStav("");
    }
  }

  async function obnov(soubor: File) {
    if (!confirm(
      `Obnova ze souboru ${soubor.name} SMAŽE všechna současná data včetně účtů ` +
      `a nahradí je obsahem zálohy. Pokračovat?`,
    )) return;

    setChyba(""); setBezi(true); setStav("Obnovuji…");
    try {
      const text = await soubor.text();
      const res = await fetch("/api/data/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: text,
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);

      const souhrn = Object.entries(d.obnoveno as Record<string, number>)
        .map(([k, v]) => `${k}: ${v}`).join(", ");
      setStav(`Obnoveno — ${souhrn}. Za chvíli tě odhlásím, přihlas se údaji ze zálohy.`);
      setTimeout(() => { window.location.href = "/api/logout"; }, 4000);
    } catch (e) {
      setChyba(e instanceof Error ? e.message : "Obnova selhala.");
      setStav("");
    } finally {
      setBezi(false);
    }
  }

  return (
    <Card title="Záloha a přenos dat">
      <p className="mb-4 text-sm text-ink-secondary">
        Celá evidence v jednom souboru JSON. Slouží k záloze i k přestěhování
        do jiné databáze — třeba do bližšího regionu.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={stahni} disabled={bezi} className="btn btn-primary">Stáhnout zálohu</button>

        <label className="btn cursor-pointer">
          Obnovit ze zálohy
          <input type="file" accept="application/json,.json" className="hidden" disabled={bezi}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) obnov(f); e.target.value = ""; }} />
        </label>

        {stav && <span className="text-sm text-good">{stav}</span>}
        {chyba && <span className="text-sm text-bad">{chyba}</span>}
      </div>

      <p className="mt-4 rounded-lg bg-warn/10 px-3 py-2.5 text-xs text-warn">
        Obnova přepíše <strong>všechno</strong> včetně uživatelských účtů — po ní se
        přihlašuješ heslem ze zálohy. Před obnovou si stáhni aktuální stav, ať máš kam ustoupit.
      </p>
    </Card>
  );
}
