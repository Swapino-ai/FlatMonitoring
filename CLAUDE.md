# Pravidla projektu FlatMonitoring

## Datum
- Datum se v celé aplikaci zadává **vždy ve formátu dd/mm/yyyy** přes komponentu `DatumPole`
  (`src/components/DatumPole.tsx`), ve formulářích přes `Pole` s `type="date"` (to samo vykreslí `DatumPole`).
- **Nikdy** nepoužívat prohlížečové `<input type="date">` (ani `datetime-local`, `month`, `week`) —
  formátuje se podle jazyka prohlížeče (např. mm/dd/yyyy). Hlídá to `scripts/kontrola-datumu.mjs`,
  který běží před každým buildem a při porušení build shodí.
- Zobrazení data: `dateCz()` z `src/lib/format.ts`.
