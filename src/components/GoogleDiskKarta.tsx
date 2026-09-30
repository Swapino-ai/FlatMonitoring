"use client";

import { useState, useTransition } from "react";
import { odpojDisk, otestujDisk, type DokumentyFormState } from "@/lib/dokumentyActions";
import { dateCz } from "@/lib/format";
import { Hlaska } from "./form";

const HLASKY: Record<string, { error?: string; success?: string }> = {
  ok: { success: "Google Disk je připojený." },
  zamitnuto: { error: "Přístup jsi v Googlu nepovolil, Disk zůstává nepřipojený." },
  stav: { error: "Přihlášení vypršelo nebo neproběhlo z tohoto prohlížeče. Zkus to znovu." },
  chyba: { error: "Připojení se nepovedlo. Zkontroluj údaje OAuth klienta a zkus to znovu." },
  "bez-tokenu": { error: "Google nevrátil trvalý přístup. Odeber aplikaci v účtu Google (Zabezpečení → Přístup třetích stran) a připoj znovu." },
  odebrano: { error: "Google odmítl přístup. Zkontroluj, že je aplikace v režimu „Ve výrobě“." },
  nenastaveno: { error: "Chybí GOOGLE_CLIENT_ID nebo GOOGLE_CLIENT_SECRET v nastavení aplikace." },
};

/** Stav a ovladani propojeni s Google Diskem: pripojit, vyzkouset, odpojit. */
export function GoogleDiskKarta({ nastaveno, pripojeno, redirectUri, vysledek }: {
  nastaveno: boolean;
  pripojeno: { email: string | null; rootUrl: string; kdy: string } | null;
  redirectUri: string;
  /** Hodnota ?google= po navratu z Googlu. */
  vysledek: string | null;
}) {
  const [stav, setStav] = useState<DokumentyFormState>(vysledek ? HLASKY[vysledek] ?? {} : {});
  const [bezi, spust] = useTransition();
  const [potvrdit, setPotvrdit] = useState(false);

  return (
    <div>
      <Hlaska state={stav} />

      {pripojeno ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="inline-flex items-center gap-1.5 font-medium text-good">
              <span className="h-2 w-2 rounded-full bg-good" aria-hidden /> Připojeno
            </span>
            {pripojeno.email && <span className="text-ink-secondary">{pripojeno.email}</span>}
            <span className="text-xs text-ink-muted">od {dateCz(pripojeno.kdy)}</span>
            <a href={pripojeno.rootUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline">
              Otevřít složku na Disku →
            </a>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn text-xs" disabled={bezi}
              onClick={() => spust(async () => setStav(await otestujDisk()))}>
              {bezi ? "Zkouším…" : "Vyzkoušet připojení"}
            </button>
            <a href="/api/google/pripojit" className="btn text-xs">Připojit znovu</a>
            {!potvrdit ? (
              <button type="button" className="btn text-xs text-bad" onClick={() => setPotvrdit(true)}>Odpojit</button>
            ) : (
              <button type="button" className="btn bg-bad/10 text-xs text-bad" disabled={bezi}
                onClick={() => spust(async () => { setStav(await odpojDisk()); setPotvrdit(false); })}>
                Opravdu odpojit? Soubory na Disku zůstanou.
              </button>
            )}
          </div>
        </div>
      ) : nastaveno ? (
        <div className="space-y-2">
          <p className="text-sm text-ink-secondary">
            Disk zatím není připojený. Po připojení se všechny nahrané dokumenty ukládají do složky
            <strong> F(a)latMonitoring</strong> na tvém Google Disku a aplikace vidí jen ty, které sama nahrála.
          </p>
          <a href="/api/google/pripojit" className="btn btn-primary inline-flex">Připojit Google Disk</a>
        </div>
      ) : (
        <div className="space-y-2 text-sm text-ink-secondary">
          <p>Nejdřív je potřeba vytvořit přístup v Google Cloud a vložit ho do nastavení aplikace. Postup je v <code>docs/google-disk.md</code>.</p>
          <p className="text-xs">Do OAuth klienta zadej tuto adresu jako <strong>Authorized redirect URI</strong>:</p>
        </div>
      )}

      <p className="mt-3 break-all rounded-lg bg-surface-sunken px-3 py-2 text-xs text-ink-secondary">
        Redirect URI: <code className="select-all">{redirectUri}</code>
      </p>
    </div>
  );
}
