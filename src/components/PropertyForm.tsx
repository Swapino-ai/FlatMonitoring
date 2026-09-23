"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useState } from "react";
import { saveProperty, type FormState } from "@/lib/actions";
import { Card } from "./Stat";
import { Pole } from "./form";
import { NEMOVITOST_MAP, TYPY_NEMOVITOSTI } from "@/lib/catalogs";
import { AdresaNaseptavac, type Navrh } from "./AdresaNaseptavac";
import { Mapa } from "./Mapa";

type Values = Partial<{
  type: string;
  name: string; street: string; city: string; zip: string; district: string | null;
  disposition: string | null; areaM2: number; floor: number | null; buildYear: number | null;
  cadastralNo: string | null; hasBalcony: boolean; hasCellar: boolean; hasParking: boolean;
  purchaseDate: string | Date; purchasePrice: number; acquisitionCosts: number;
  renovationCosts: number; landShareValue: number; depreciationGroup: number;
  depreciationMethod: string; status: string; notes: string | null;
  latitude: number | null; longitude: number | null;
}>;

export function PropertyForm({ id, values = {}, uzivatele = [], vychoziVlastnik }: {
  id?: string;
  values?: Values;
  /** Seznam uctu pro vyber vlastnika — jen pri zakladani. */
  uzivatele?: { id: string; name: string; email: string }[];
  vychoziVlastnik?: string;
}) {
  const action = saveProperty.bind(null, id ?? null);
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});

  const v = values;
  const [typ, setTyp] = useState(v.type ?? "BYT");

  // Adresu drzime ve stavu, aby ji naseptavac mohl vyplnit — a uzivatel
  // kdykoli prepsat rucne.
  const [adresa, setAdresa] = useState({
    street: v.street ?? "", city: v.city ?? "", zip: v.zip ?? "", district: v.district ?? "",
    latitude: v.latitude ?? null as number | null, longitude: v.longitude ?? null as number | null,
  });

  function prevezmi(n: Navrh) {
    setAdresa({
      street: n.ulice, city: n.mesto, zip: n.psc,
      // Naseptavac nemusi cast znat; co uz je vyplnene, nemazeme
      district: n.cast || adresa.district,
      latitude: n.latitude, longitude: n.longitude,
    });
  }

  // Klepnuti do mapy: ze souradnic dotahneme adresu zpatky
  async function zMapy(lat: number, lon: number) {
    setAdresa((a) => ({ ...a, latitude: lat, longitude: lon }));
    try {
      const r = await fetch(`/api/adresy?lat=${lat}&lon=${lon}`);
      const d = await r.json();
      if (!d.navrh) return;
      setAdresa((a) => ({
        // Souradnice drzi to, kam uzivatel klepl — presnejsi nez stred domu
        ...a, latitude: lat, longitude: lon,
        street: d.navrh.ulice || a.street,
        city: d.navrh.mesto || a.city,
        zip: d.navrh.psc || a.zip,
        district: d.navrh.cast || a.district,
      }));
    } catch {
      // Adresa se nedotahla — souradnice ale platí a to je pro okruh podstatné
    }
  }

  const zmen = (pole: keyof typeof adresa) => (e: React.ChangeEvent<HTMLInputElement>) =>
    // Rucni zasah do adresy zneplatnuje souradnice — jinak by okruh hledal
    // kolem mista, ktere uz v poli nestoji
    setAdresa((a) => ({ ...a, [pole]: e.target.value, latitude: null, longitude: null }));
  const katalog = NEMOVITOST_MAP.get(typ);
  const dateValue = v.purchaseDate ? new Date(v.purchaseDate).toISOString().slice(0, 10) : "";

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <p className="rounded-lg bg-bad/10 px-3 py-2.5 text-sm text-bad">{state.error}</p>
      )}

      <Card title="Základní údaje">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label mb-1.5 block" htmlFor="type">Druh nemovitosti</label>
            <select id="type" name="type" value={typ} onChange={(e) => setTyp(e.target.value)} className="input">
              {TYPY_NEMOVITOSTI.map((t) => <option key={t.klic} value={t.klic}>{t.nazev}</option>)}
            </select>
            {katalog?.popis && <p className="mt-1 text-xs text-ink-muted">{katalog.popis}</p>}
          </div>
          <Field label="Název" name="name" defaultValue={v.name} required errors={state.fieldErrors}
            hint="Pracovní označení, např. „Vinohrady 2+kk“" />
          <Select label="Stav" name="status" defaultValue={v.status ?? "RENTED"} options={[
            ["RENTED", "Pronajato"], ["VACANT", "Volné"], ["RENOVATION", "Rekonstrukce"],
            ["FOR_SALE", "Na prodej"], ["SOLD", "Prodáno"],
          ]} />
          <AdresaNaseptavac onVybrano={prevezmi} />

          <Field label="Ulice a číslo" name="street" value={adresa.street} onChange={zmen("street")}
            required errors={state.fieldErrors} />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Město" name="city" value={adresa.city} onChange={zmen("city")}
              required errors={state.fieldErrors} />
            <Field label="PSČ" name="zip" value={adresa.zip} onChange={zmen("zip")}
              required errors={state.fieldErrors} />
          </div>
          <Field label="Městská část / katastr" name="district" value={adresa.district} onChange={zmen("district")}
            hint="Používá se pro srovnání s trhem" errors={state.fieldErrors} />

          <input type="hidden" name="latitude" value={adresa.latitude ?? ""} />
          <input type="hidden" name="longitude" value={adresa.longitude ?? ""} />

          <div className="sm:col-span-2">
            <Mapa latitude={adresa.latitude} longitude={adresa.longitude} onZmena={zMapy} />
            <p className="mt-1 text-xs text-ink-muted">
              {adresa.latitude != null
                ? `Poloha uložena (${adresa.latitude.toFixed(5)}, ${adresa.longitude!.toFixed(5)}) — podle ní se hledají srovnatelné nabídky v okruhu.`
                : "Bez polohy se srovnání hledá jen podle města a čtvrti, což je hrubší."}
            </p>
          </div>
          <Field label="Číslo jednotky v KN" name="cadastralNo" defaultValue={v.cadastralNo ?? ""} errors={state.fieldErrors} />
        </div>
      </Card>

      {katalog?.upozorneni && (
        <p className="rounded-lg bg-warn/10 px-3 py-2.5 text-sm text-warn">{katalog.upozorneni}</p>
      )}

      <Card title="Parametry">
        <div className="grid gap-4 sm:grid-cols-4">
          {katalog?.maDispozici !== false && (
            <Field label="Dispozice" name="disposition" defaultValue={v.disposition ?? ""}
              hint="např. 2+kk" errors={state.fieldErrors} />
          )}
          <Field label="Plocha (m²)" name="areaM2" type="number" step="0.1" defaultValue={v.areaM2} required errors={state.fieldErrors} />
          <Field label="Patro" name="floor" type="number" defaultValue={v.floor ?? ""} errors={state.fieldErrors} />
          <Field label="Rok výstavby" name="buildYear" type="number" defaultValue={v.buildYear ?? ""} errors={state.fieldErrors} />
        </div>
        <div className="mt-4 flex flex-wrap gap-5">
          <Check label="Balkon / terasa" name="hasBalcony" defaultChecked={v.hasBalcony} />
          <Check label="Sklep" name="hasCellar" defaultChecked={v.hasCellar} />
          <Check label="Parkování" name="hasParking" defaultChecked={v.hasParking} />
        </div>
      </Card>

      <Card title="Pořízení">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Datum pořízení" name="purchaseDate" type="date" defaultValue={dateValue} required errors={state.fieldErrors} />
          <Field label="Kupní cena (Kč)" name="purchasePrice" type="number" step="1" defaultValue={v.purchasePrice} required errors={state.fieldErrors} />
          <Field label="Vedlejší náklady pořízení (Kč)" name="acquisitionCosts" type="number" defaultValue={v.acquisitionCosts ?? 0}
            hint="Provize, právník, znalec, poplatky" errors={state.fieldErrors} />
          <Field label="Rekonstrukce před pronájmem (Kč)" name="renovationCosts" type="number" defaultValue={v.renovationCosts ?? 0} errors={state.fieldErrors} />
          <Field label="Hodnota podílu na pozemku (Kč)" name="landShareValue" type="number" defaultValue={v.landShareValue ?? 0}
            hint="Pozemek se neodepisuje — odečte se ze vstupní ceny" errors={state.fieldErrors} />
        </div>
      </Card>

      <Card title="Odpisy">
        {katalog?.odpisovaSkupina === null && (
          <p className="mb-3 rounded-lg bg-surface-sunken px-3 py-2 text-xs text-ink-secondary">
            Tenhle druh se neodepisuje — odpisový plán se u něj nebude počítat, ať tu vyplníš cokoli.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Odpisová skupina" name="depreciationGroup"
            defaultValue={String(v.depreciationGroup ?? katalog?.odpisovaSkupina ?? 5)} options={[
            ["4", "4. skupina — 20 let (haly, lehké budovy)"],
            ["5", "5. skupina — 30 let (zděné a panelové domy)"],
            ["6", "6. skupina — 50 let"],
          ]} />
          <Select label="Metoda" name="depreciationMethod" defaultValue={v.depreciationMethod ?? "STRAIGHT"} options={[
            ["STRAIGHT", "Rovnoměrné odpisování (§ 31)"],
            ["ACCELERATED", "Zrychlené odpisování (§ 32)"],
          ]} />
        </div>
        <p className="mt-3 text-xs text-ink-muted">
          Metodu nelze po zahájení odpisování změnit. Odpisy se uplatní jen při skutečných výdajích, ne při paušálu.
        </p>
      </Card>

      {!id && uzivatele.length > 0 && (
        <Card title="Vlastník">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label mb-1.5 block" htmlFor="ownerId">Komu nemovitost patří</label>
              <select id="ownerId" name="ownerId" defaultValue={vychoziVlastnik} className="input">
                {uzivatele.map((u) => (
                  <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-ink-muted">
                Nemusíš to být ty — vlastníkem může být kterýkoli uživatel.
              </p>
            </div>
            <Pole label="Podíl (%)" name="ownerShare" type="number" step="0.01" min={0.01} max={100}
              defaultValue={100} hint="Spoluvlastníky doplníš po uložení v detailu nemovitosti" />
          </div>
        </Card>
      )}

      <Card title="Poznámky">
        <textarea name="notes" defaultValue={v.notes ?? ""} rows={3} className="input" />
      </Card>

      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Ukládám…" : id ? "Uložit změny" : "Přidat nemovitost"}
        </button>
        <Link href={id ? `/properties/${id}` : "/properties"} className="btn">Zrušit</Link>
      </div>
    </form>
  );
}

function Field({ label, name, hint, errors, ...rest }: {
  label: string; name: string; hint?: string; errors?: Record<string, string>;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const error = errors?.[name];
  return (
    <div>
      <label className="label mb-1.5 block" htmlFor={name}>{label}</label>
      <input id={name} name={name} className="input" {...rest} />
      {error ? <p className="mt-1 text-xs text-bad">{error}</p>
             : hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

function Select({ label, name, options, defaultValue }: {
  label: string; name: string; options: [string, string][]; defaultValue?: string;
}) {
  return (
    <div>
      <label className="label mb-1.5 block" htmlFor={name}>{label}</label>
      <select id={name} name={name} defaultValue={defaultValue} className="input">
        {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select>
    </div>
  );
}

function Check({ label, name, defaultChecked }: { label: string; name: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="h-4 w-4 rounded border-line accent-accent" />
      {label}
    </label>
  );
}
