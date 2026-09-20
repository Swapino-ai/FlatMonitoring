# FlatMonitoring

Přehled nemovitostního portfolia pro soukromého investora do bytů.
Běží na Vercelu, data v Postgresu na Neonu.

Odpovídá na čtyři otázky:

1. **Jak se mi investice vrací?** Hrubý i čistý výnos, cash-on-cash, cap rate, DSCR, IRR od pořízení.
2. **Kolik na tom vázne dluhu?** Zbývající jistina, LTV, rozpad splátek na úroky a jistinu, hlídání konce fixace.
3. **Kde se dá ušetřit?** Rozstřel dodavatelů energií, pojištění a internetu napříč byty a odhad úspory z hromadné poptávky.
4. **Co dát do daňového přiznání?** Podklad dle § 9 ZDP včetně odpisů a porovnání paušálu se skutečnými výdaji.

---

## Nasazení

Celé to proběhne v prohlížeči. **Na svém počítači nemusíš nic instalovat** —
žádný Node.js, žádný Git.

### 1. Databáze na Neonu

1. Jdi na [neon.tech](https://neon.tech) a zaregistruj se (nejrychleji přes GitHub).
2. **Create project.** Jméno třeba `flatmonitoring`, region **Europe (Frankfurt)** —
   je nejblíž a aplikace pak odpovídá rychleji.
3. Po vytvoření se objeví **Connection string**. Potřebuješ z něj **dva tvary**:

   - **Pooled connection** — v adrese je `-pooler`. Tohle je `DATABASE_URL`.
     Na konec připoj `&pgbouncer=true`, jinak Prisma selže na prepared statements:
     ```
     postgresql://...@ep-neco-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&pgbouncer=true
     ```
   - **Direct connection** — tentýž řetězec **bez** `-pooler`. Tohle je `DIRECT_URL`.
     Používá se jen při nahrávání schématu.
     ```
     postgresql://...@ep-neco.eu-central-1.aws.neon.tech/neondb?sslmode=require
     ```

   V Neonu se mezi nimi přepíná přepínačem **Connection pooling** u connection stringu.

4. Oba si někam zkopíruj. **Jsou to hesla k tvým datům** — neposílej je e-mailem ani do chatu.

### 2. Klíč pro podpis přihlášení

Aplikace potřebuje náhodný tajný klíč (`AUTH_SECRET`). Vygeneruj si ho třeba
na [generate-secret.vercel.app/32](https://generate-secret.vercel.app/32) — je to jen
náhodný řetězec, nikde se neregistruje.

### 3. Nasazení na Vercel

1. Jdi na [vercel.com](https://vercel.com), přihlas se GitHubem.
2. **Add New → Project** a vyber repozitář `FlatMonitoring`.
3. Než dáš Deploy, rozbal **Environment Variables** a vlož tři položky:

   | Název | Hodnota |
   |---|---|
   | `DATABASE_URL` | pooled řetězec z Neonu (ten s `-pooler` a `&pgbouncer=true`) |
   | `DIRECT_URL` | direct řetězec z Neonu (bez `-pooler`) |
   | `AUTH_SECRET` | náhodný klíč z kroku 2 |

4. **Deploy.** Build zároveň nahraje schéma do Neonu, takže nemusíš spouštět nic ručně.

### 4. První účet

Otevři adresu, kterou ti Vercel dal (`neco.vercel.app`). Protože je databáze
prázdná, aplikace tě sama pustí na stránku **První spuštění** — vyplň e-mail a heslo
a jsi uvnitř. Jakmile účet vznikne, tahle stránka se zavře a už se k ní nikdo nedostane.

### 5. Účet pro obchodního partnera

V aplikaci jdi na **Uživatelé → Přidat účet** a zvol roli **Jen pro čtení**.
Partner uvidí čísla i reporty, ale nic nezmění a sken trhu nespustí.

Pak mu pošleš adresu aplikace a přihlašovací údaje — heslo ideálně jinou cestou
než ten odkaz. Žádné tunely, žádná nastavení routeru, funguje to odkudkoli.

### 6. Měsíční sken trhu

Sken běží přes GitHub Actions, ne na Vercelu — mezi dotazy záměrně čeká, aby
portály nezatěžoval, a do časového limitu serverless funkce by se nevešel.

V repozitáři na GitHubu: **Settings → Secrets and variables → Actions →
New repository secret** a přidej `DATABASE_URL` a `DIRECT_URL` (stejné hodnoty
jako na Vercelu).

Pak se sken spustí 1. den v měsíci sám. Ručně ho pustíš v záložce **Actions →
Měsíční sken trhu → Run workflow**. Ten samý běh po sobě uloží i zálohu dat
jako artefakt ke stažení.

---

## Zálohování

Neon sám drží historii změn (na free tieru 24 hodin), takže drobný omyl se dá
vrátit z jeho konzole. Pro vlastní kopii dat slouží export do JSON:

```bash
npm run backup                        # zalohy/flatmonitoring-2026-09-20.json
npm run restore -- zalohy/soubor.json # POZOR: přepíše všechna data
```

Export je nezávislý na databázi — nepotřebuje `pg_dump` a dá se z něj obnovit
i do úplně nové databáze. Měsíční běh na GitHubu ho dělá automaticky a nechává
ho 90 dní jako artefakt.

---

## PDF pro partnera

V sekci Reporty si vyklikáš rok a sekce a dáš **Vytisknout do PDF**. Otevře se
tisková verze a rovnou tiskový dialog prohlížeče — v něm zvol **Uložit jako PDF**.

Na Vercelu se PDF nevyrábí na serveru: bezhlavý Chromium se do serverless funkce
nevejde. Výsledek je ale stejný, protože tisková verze používá tytéž styly.
Při vlastním hostování (viz níže) stačí nastavit `CHROMIUM_PATH` a tlačítko začne
stahovat hotové PDF jedním klikem.

---

## Daňová část

Sekce Daně sestaví podklad pro přílohu č. 2 k přiznání k DPFO — příjmy z nájmu dle § 9 ZDP:

- **porovná paušál 30 %** (strop 600 000 Kč) **se skutečnými výdaji** a doporučí výhodnější variantu,
- počítá **odpisy budovy** dle § 31 (rovnoměrné) i § 32 (zrychlené), 4.–6. odpisová skupina,
- **odečítá podíl na pozemku** ze vstupní ceny, protože pozemek se neodepisuje,
- odděluje **úroky z hypotéky** (uznatelné) od **splátky jistiny** (neuznatelná),
- vynechává **zálohy na služby** jako průchozí položku,
- u prodeje hlídá **časový test** pro osvobození dle § 4 (5 nebo 10 let podle data nabytí),
- uplatní **progresivní sazbu** 15 / 23 % podle § 16.

Sazby a limity jsou v `src/lib/tax.ts` v tabulce `TAX_YEARS` — **každý rok je zkontroluj**
proti aktuálnímu znění zákona.

Výpočet vychází pouze z příjmů z nájmu. Máš-li i příjmy ze zaměstnání nebo
podnikání, dílčí základy se sčítají a slevu na poplatníka lze uplatnit jen jednou.
**Je to podklad, ne náhrada daňového poradce.**

---

## Sken trhu — na co si dát pozor

Sken stahuje nabídky ze Sreality a Bezrealitek, spočítá medián ceny za m² u
srovnatelných bytů (stejné město, dispozice, plocha ±25 %) a z něj odhadne
hodnotu tvých bytů.

- Jde o **nabídkové** ceny. Realizované bývají o 5–10 % nižší — ber odhad jako horní hranici.
- Při méně než třech srovnatelných nabídkách se odhad nepočítá. Raději žádné číslo než nedůvěryhodné.
- Portály nemají veřejné API a mění strukturu stránek. Když se sken rozbije, uloží se
  jako `FAILED` s popisem chyby (vidíš to v sekci Trh) a **poslední platné ocenění
  zůstane nedotčené**.
- Portály občas blokují požadavky z datových center. Když sken z GitHubu nic nevrátí,
  spusť ho ze svého počítače, nebo zadej hodnotu ručně jako ocenění typu `MANUAL`.

---

## Práce s projektem lokálně

Pro vývoj nebo vlastní hostování. Potřebuješ Node.js 20+.

```bash
git clone https://github.com/Swapino-ai/FlatMonitoring.git
cd FlatMonitoring
npm install
cp .env.example .env     # doplň DATABASE_URL, DIRECT_URL, AUTH_SECRET
npm run setup
npm run dev
```

Uživatele spravuj v aplikaci (sekce **Uživatelé**). Z příkazové řádky to jde taky,
když se nemůžeš přihlásit:

```bash
npm run user -- list
npm run user -- add partner@example.com "Obchodní partner" PARTNER
npm run user -- passwd partner@example.com
```

Ukázková data (tři byty, hypotéky, dva roky pohybů):

```bash
npm run db:seed          # POZOR: smaže současný obsah databáze
```

V `deploy/` jsou konfigurace pro vlastní hostování — systemd, launchd
a `windows-install.ps1` pro Plánovač úloh Windows.

### Když `npm install` selže na certifikátu

`UNABLE_TO_GET_ISSUER_CERT_LOCALLY` znamená, že firemní síť nebo antivirus
rozšifrovává HTTPS vlastní certifikační autoritou. Windows jí věří, Node.js ne.

```powershell
$env:NODE_OPTIONS = "--use-system-ca"   # Node.js 22.15+
npm install
```

Vypnutí kontroly (`npm config set strict-ssl false`) je až poslední možnost —
přestaneš tím ověřovat, odkud se ti stahuje kód, který se pak spustí.

### Nedávej projekt do Google Drivu ani OneDrivu

Synchronizace drží soubory otevřené, `npm install` pak hlásí `EPERM`
a `node_modules` s desítkami tisíc souborů se bude přenášet donekonečna.
Dej projekt na lokální disk.

---

## Struktura

```
prisma/schema.prisma     datový model (nemovitost, úvěr, nájem, transakce, služba, ocenění)
src/lib/finance.ts       amortizace, výnosové ukazatele, IRR
src/lib/tax.ts           odpisy a daň z příjmu z nájmu dle české legislativy
src/lib/portfolio.ts     agregace — z databáze na ukazatele
src/lib/savings.ts       hledání úspor z hromadného vyjednávání
src/lib/market/          scrapery portálů a oceňování z trhu
src/app/setup/           založení prvního účtu při prázdné databázi
src/app/users/           správa účtů pro majitele
src/app/report/          tisková verze reportu (zdroj PDF)
scripts/backup.ts        export dat do JSON
scripts/restore.ts       obnova ze zálohy
.github/workflows/       měsíční sken trhu a záloha
```

---

## Co aplikace záměrně nedělá

- **Negeneruje XML pro finanční správu.** Dává čísla, která do přiznání opíšeš nebo předáš účetní.
- **Nenapojuje se na bankovní účet.** Transakce se zadávají ručně.
- **Nepočítá DPH ani příjmy podle § 7.** Míří na fyzickou osobu pronajímající byty dle § 9.
