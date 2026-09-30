import { Ikona } from "./Ikony";
import { Badge } from "./Stat";
import { czk } from "@/lib/format";
import { TOLERANCE_KC, TOLERANCE_PCT, nazevMesice, type MesicPorovnani, type OsaNajmu, type RokPorovnani } from "@/lib/zalohy";

/**
 * Zalohy a naklady na sluzby v case: za kazdou smlouvu, i ukoncenou, po letech
 * a po mesicich. Odpovida na otazku, kterou banner "ted nesedi" nezodpovi:
 * od kdy, jak dlouho a kolik to za rok dela k vyuctovani.
 *
 * Naklady jsou odhad z ceny sluzeb, ne skutecne odecty — vyuctovani nahrazuje
 * jen jako predstava, kam se to blizi.
 */

const BARVA: Record<MesicPorovnani["stav"], string> = {
  sedi: "bg-good/70",
  nedoplaci: "bg-warn",
  preplaci: "bg-accent/70",
  neoznaceno: "bg-ink-muted/40",
};

const POPIS: Record<MesicPorovnani["stav"], string> = {
  sedi: "sedí",
  nedoplaci: "nedoplatek",
  preplaci: "přeplatek",
  neoznaceno: "nelze ověřit",
};

function vysledekRoku(r: RokPorovnani): { text: string; tone: "good" | "warn" | "neutral" } {
  const tolerance = Math.max(TOLERANCE_KC, (r.naklady * TOLERANCE_PCT) / 100);
  if (Math.abs(r.rozdil) <= tolerance) return { text: "sedí", tone: "good" };
  return r.rozdil < 0
    ? { text: `nedoplatek ${czk(-r.rozdil)}`, tone: "warn" }
    : { text: `přeplatek ${czk(r.rozdil)}`, tone: "neutral" };
}

function Prouzek({ rok }: { rok: RokPorovnani }) {
  const podleMesice = new Map(rok.mesice.map((m) => [m.mesic, m]));
  return (
    <div className="flex gap-0.5" role="img" aria-label={`Rok ${rok.rok}, měsíce podle shody záloh se službami`}>
      {Array.from({ length: 12 }, (_, i) => {
        const m = podleMesice.get(i + 1);
        return (
          <span
            key={i}
            className={`h-3 w-3 rounded-[3px] ${m ? BARVA[m.stav] : "bg-surface-sunken"}`}
            title={m ? `${nazevMesice(i + 1)} ${rok.rok}: ${POPIS[m.stav]}${m.rozdil ? `, ${m.rozdil > 0 ? "+" : "−"}${czk(Math.abs(m.rozdil))}` : ""}` : `${nazevMesice(i + 1)} ${rok.rok}: mimo smlouvu`}
          />
        );
      })}
    </div>
  );
}

export function ZalohyVCase({ osy }: { osy: OsaNajmu[] }) {
  if (osy.length === 0) {
    return (
      <p className="rounded-lg bg-surface-sunken px-3 py-2.5 text-sm text-ink-secondary">
        Není co porovnávat. Označ ve službách ty, které se přeúčtovávají nájemci, a doplň zálohy ve smlouvě.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {osy.map((osa, i) => (
        <section key={i}>
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="flex items-center gap-2 font-semibold">
              <Ikona nazev="najemce" trida="h-4 w-4 text-ink-muted" />{osa.najemce}
            </h3>
            <span className="text-xs text-ink-muted">
              {nazevMesice(osa.od.getMonth() + 1)} {osa.od.getFullYear()} –{" "}
              {osa.jeAktivni ? "dosud" : `${nazevMesice(osa.do.getMonth() + 1)} ${osa.do.getFullYear()}`}
            </span>
            <Badge tone={osa.jeAktivni ? "good" : "neutral"}>{osa.jeAktivni ? "platná" : "ukončená"}</Badge>
          </div>

          <div className="table-scroll">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Rok</th>
                  <th className="hidden sm:table-cell">Měsíce</th>
                  <th className="num">Zálohy</th>
                  <th className="num">Náklady</th>
                  <th>Vyúčtování</th>
                </tr>
              </thead>
              <tbody>
                {osa.roky.map((r) => {
                  const v = vysledekRoku(r);
                  return (
                    <tr key={r.rok}>
                      <td className="font-medium">
                        {r.rok}
                        <span className="ml-1.5 text-xs text-ink-muted">{r.mesicu}&nbsp;měs.</span>
                      </td>
                      <td className="hidden sm:table-cell"><Prouzek rok={r} /></td>
                      <td className="num">{czk(r.zalohy)}</td>
                      <td className="num">{czk(r.naklady)}</td>
                      <td className={`font-semibold ${v.tone === "good" ? "text-good" : v.tone === "warn" ? "text-warn" : ""}`}>
                        {v.text}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-xs font-medium text-accent">Rozpis po měsících</summary>
            <div className="table-scroll mt-2 max-h-72 overflow-y-auto">
              <table className="table-base">
                <thead>
                  <tr><th>Měsíc</th><th className="num">Zálohy</th><th className="num">Náklady</th><th className="num">Rozdíl</th></tr>
                </thead>
                <tbody>
                  {osa.roky.flatMap((r) => r.mesice).reverse().map((m) => (
                    <tr key={`${m.rok}-${m.mesic}`}>
                      <td>{nazevMesice(m.mesic)} {m.rok}</td>
                      <td className="num">{czk(m.zalohy)}</td>
                      <td className="num">{czk(m.naklady)}</td>
                      <td className={`num font-medium ${m.stav === "nedoplaci" ? "text-warn" : m.stav === "sedi" ? "text-ink-muted" : ""}`}>
                        {m.rozdil > 0 ? "+" : m.rozdil < 0 ? "−" : ""}{czk(Math.abs(m.rozdil))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      ))}

      <div className="space-y-1 border-t border-line pt-3 text-xs text-ink-muted">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="flex items-center gap-1.5"><i className={`h-2.5 w-2.5 rounded-sm ${BARVA.sedi}`} />sedí</span>
          <span className="flex items-center gap-1.5"><i className={`h-2.5 w-2.5 rounded-sm ${BARVA.nedoplaci}`} />nedoplatek</span>
          <span className="flex items-center gap-1.5"><i className={`h-2.5 w-2.5 rounded-sm ${BARVA.preplaci}`} />přeplatek</span>
          <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-surface-sunken" />mimo smlouvu</span>
        </div>
        <p>
          Náklady vycházejí z cen služeb označených k přeúčtování, ne ze skutečných odečtů, takže vyúčtování jen odhadují.
          Před první uloženou změnou se počítá první hodnota. Měsíc se počítá, když v jeho patnáctém dni smlouva platila.
        </p>
      </div>
    </div>
  );
}
