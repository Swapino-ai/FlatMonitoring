# Google Disk jako úložiště dokumentů

Soubory nahrané v aplikaci se ukládají **jen na tvůj Google Disk**, do složky `F(a)latMonitoring`.
V databázi je jen evidence (název, kategorie, vazba na nemovitost/nájemce, odkaz na soubor).
Aplikace používá rozsah `drive.file`: vidí **jen soubory, které sama nahrála**, zbytek Disku je pro ni neviditelný.

## Struktura složek

```
F(a)latMonitoring/
├─ Nemovitosti/
│  └─ <Název nemovitosti>/
│     ├─ 01 Nabytí a katastr/            kupní smlouva, list vlastnictví
│     ├─ 02 Nájemní smlouvy/
│     │  └─ <N-0001 Jméno nájemce>/      smlouvy, předávací protokoly
│     ├─ 03 Služby/
│     │  └─ <Druh · dodavatel>/          smlouvy s dodavateli
│     ├─ 04 Vyúčtování/<rok>/<Druh · dodavatel>/
│     ├─ 05 Úvěry/
│     ├─ 06 Daně/<rok>/
│     └─ 07 Fotky a ostatní/
├─ Nájemníci/<N-0001 Jméno nájemce>/     doklady nezávislé na bytu
└─ Ostatní/
```

Složky se zakládají samy při prvním nahrání. Každá má stabilní klíč (id nemovitosti, nájemce…),
takže přejmenování nemovitosti nerozbije cestu ke starým souborům; nová složka se nezaloží.
Katalog kategorií a pravidla cest jsou v `src/lib/dokumenty.ts`.

## Jednorázové nastavení

1. <https://console.cloud.google.com/> → vytvoř projekt (např. „FlatMonitoring“).
2. **APIs & Services → Library → Google Drive API → Enable**.
3. **OAuth consent screen**: typ *External*, vyplň název a svůj e-mail. Rozsahy nepřidávej ručně.
4. Na stejné obrazovce dej **Publish app** (stav „In production“). Bez toho Google po 7 dnech
   zneplatní přístup. Rozsah `drive.file` není citlivý, ověření aplikace se nevyžaduje;
   při přihlášení uvidíš varování „Google hasn’t verified this app“ — pokračuj přes *Advanced*.
5. **Credentials → Create credentials → OAuth client ID → Web application**.
   *Authorized redirect URI*: `https://<adresa-aplikace>/api/google/callback`
   (přesnou adresu ukazuje karta Google Disk ve Správě; pro lokální vývoj přidej i `http://localhost:3000/api/google/callback`).
6. Zkopíruj **Client ID** a **Client secret** do proměnných prostředí `GOOGLE_CLIENT_ID` a `GOOGLE_CLIENT_SECRET`
   (na Vercelu v *Settings → Environment Variables*) a aplikaci znovu nasaď.
7. **Správa → Google Disk → Připojit Google Disk** a potvrď přístup. Poté **Vyzkoušet připojení**.

## Jak nahrávání funguje

1. Prohlížeč pošle aplikaci název a velikost souboru. Server zkontroluje oprávnění a soubor,
   zajistí složky a vrátí jednorázovou adresu na Google a podepsaný lístek.
2. Prohlížeč pošle soubor **rovnou Googlu** (mimo server — na Vercelu je limit těla požadavku 4,5 MB) a ukazuje průběh.
3. Server ověří, že soubor leží ve schválené složce, a zapíše ho do evidence.

Zobrazení a stažení jde přes aplikaci (`/api/soubory/<id>`), takže dokument uvidí každý přihlášený
uživatel bez účtu Google a bez sdílení na Disku. Smazání přesune soubor do koše na Disku.

## Použití v kódu

```tsx
import { Dokumenty } from "@/components/Dokumenty";

<Dokumenty
  kontext={{ kategorie: "NAJEMNI_SMLOUVA", leaseId }}   // stačí id, názvy složek doplní server
  dokumenty={dokumentyZDatabaze}
  canEdit={jeMajitel}
/>
```

`Nahravac` (jen plocha pro přetažení) a `SeznamDokumentu` (jen seznam) jdou použít i zvlášť.
Omezení: max. 100 MB na soubor, zakázané jsou spustitelné přípony (`src/lib/dokumenty.ts`).
