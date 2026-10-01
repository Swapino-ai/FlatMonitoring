# Před spuštěním do ostré verze

Seznam toho, co je dnes nastavené „pro testování“ nebo jsem nikdy neověřil proti skutečným službám.
Odškrtávej postupně.

## A. Funkce, které se mají vrátit zpět (jen pro test)

- [ ] **Smazat natrvalo vydané vyúčtování nájemci.** V ostré jen **storno** (doklad zůstává v evidenci).
  - tlačítko „Smazat natrvalo“ v `src/components/VyuctovaniNajemceKarta.tsx` (formulář s `smazAkce` na konci komponenty `Detail`)
  - akce `smazVyuctovani` v `src/lib/vyuctovaniNajemceActions.ts`
  - Proč: vydané vyúčtování je doklad pro nájemce. Po smazání se uvolní číslo (`VN-2026-000X`), takže se čísla v řadě
    přeskakují nebo opakují.
- [ ] Rozhodnout, jestli v ostré nechat **mazání vyúčtování služeb od dodavatelů** (koš u řádku) a **mazání nájemníků** bez smlouvy.
- [ ] Zkušební plocha pro nahrávání ve Správě (karta Google Disk → „Vyzkoušet nahrávání“, složka Ostatní) – nechat, nebo odebrat.

## B. Databáze a prostředí

- [ ] **Přepnutí na databázi ve Frankfurtu** (Vercel `DATABASE_URL` + `DIRECT_URL`, Redeploy, GitHub Secrets). Postup: `docs/migrace-neon-eu.md`.
  - `DATABASE_URL` = Pooled s `&pgbouncer=true`; `DIRECT_URL` = skutečná Direct (bez `-pooler`).
- [ ] Starou databázi v USA nechat týden, pak smazat. Smazat secret `NOVA_DIRECT_URL` a workflow `.github/workflows/migrace-db.yml`.
- [ ] **Testovací data**: smazat nebo odděleně zálohovat testovací nemovitosti, nájemce, smlouvy, vydaná vyúčtování a dokumenty.
  - Čísla dokladů `VN-…` se tím vynulují. Ověřit, že ostrá řada začne tam, kde chceš.
- [ ] Neon: ověřit plán a uspávání (cold start 1–3 s po pauze), případně placený plán nebo vypnutý autosuspend.
- [ ] Zálohování: pravidelná záloha databáze (ne jen ruční), ověřit **obnovu ze zálohy na kopii** (nové tabulky: nájemci, provozovatelé,
  vyúčtování, dokumenty, druhy služeb).
- [ ] Produkční větev: veškerá práce je na větvi `claude/real-estate-management-app-kc3cz0`. Do ostré je potřeba ji **sloučit do hlavní větve**
  a nastavit ve Vercelu, ze které větve se nasazuje Production.

## C. Přihlášení a oprávnění

- [ ] Silný `AUTH_SECRET` (jen ve Vercelu, ne v repozitáři), min. 32 náhodných znaků.
- [ ] Smazat testovací účty uživatelů, změnit hesla, zkontrolovat role (majitel / jen čtení).
- [ ] Projít, co vidí **uživatel jen pro čtení** (účty, adresy, vyúčtování nájemcům, nájemníci, Správa – mají být skryté).
- [ ] U uživatelů a provozovatelů doplnit **číslo účtu** (bez něj nejde QR platba nedoplatku).

## D. Google Disk

- [ ] OAuth aplikace v Google Cloud ve stavu **In production** (v „Testing“ přístup po 7 dnech vyprší).
- [ ] Produkční **redirect URI** (`https://<ostrá-adresa>/api/google/callback`), `GOOGLE_CLIENT_ID` a `GOOGLE_CLIENT_SECRET` ve Vercelu **Production**.
- [ ] Znovu připojit Disk z ostré adresy. Nahrávání jsem **nikdy nespustil proti skutečnému Googlu**: otestovat nahrání, otevření, stažení, smazání.
- [ ] Vyčistit na Disku testovací složky v `F(a)latMonitoring/`.
- [ ] Refresh token a čísla účtů jsou v databázi jako čistý text. Rozhodnout, jestli je šifrovat.

## E. Data v aplikaci, která je nutné doplnit

- [ ] **Provozovatel** u každé nemovitosti (jinak je pronajímatelem vlastník s největším podílem). U smluv zkontrolovat „Pronajímatel na smlouvě“.
- [ ] U všech služeb **„Služba platí od“** (nové pole je povinné při úpravě), označit přeúčtované služby.
- [ ] U smluv zkontrolovat zálohy (celkem / po službách), u záměrně odlišných zálohy zaškrtnout příznak.
- [ ] Doplnit údaje nájemníků (adresa, kontakt, účet pro vratku) a zkontrolovat duplicity v Nájemnících (sloučení záznamů aplikace neumí).
- [ ] Ceny služeb v budoucnu se přepínají při otevření stránky (bez plánovače) – počítat s tím u dat v budoucnu.

## F. Co jsem nikdy neověřil v prohlížeči (otestuj před ostrým)

- [ ] Vydání vyúčtování nájemci (číslo, splatnost, neúplné, překryv), storno, vypořádání, e-mail (mailto), kopírování textu.
- [ ] **QR platba** – naskenovat bankovní aplikací a zkontrolovat částku, účet a variabilní symbol.
- [ ] Tisk / uložení do PDF: evidenční list i vyúčtování (A4, bez okolní stránky).
- [ ] Nová smlouva z této, výběr nájemce a pronajímatele ve formuláři smlouvy.
- [ ] Rozpis záloh po službách s historií, budoucí změny cen.
- [ ] Obnova dat ze zálohy (JSON) včetně nových tabulek.

## G. Právní a provozní

- [ ] Vyúčtování a evidenční list **neobsahují právní náležitosti** (poučení, lhůty reklamace…). Zkontrolovat s právníkem nebo účetní.
  Lhůta pro vyúčtování (obvykle 4 měsíce od konce období) je jen připomenutí, aplikace ji nehlídá.
- [ ] Osobní údaje nájemců (adresy, telefony, účty): informační povinnost podle GDPR, přístup jen majitelé, zabezpečená záloha.
- [ ] Platnost klíče katastru do **29. 3. 2027** (kvóta 500 volání za období).
- [ ] Diagnostické workflow (`sonda-katastru.yml`, `probe-market.yml`) v ostré vypnout nebo smazat.
