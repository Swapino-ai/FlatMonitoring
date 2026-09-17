# FlatMonitoring

Přehled nemovitostního portfolia pro soukromého investora do bytů. Běží lokálně,
data zůstávají na tvém počítači v jednom SQLite souboru.

Odpovídá na čtyři otázky:

1. **Jak se mi investice vrací?** Hrubý i čistý výnos, cash-on-cash, cap rate, DSCR, IRR od pořízení.
2. **Kolik na tom vázne dluhu?** Zbývající jistina, LTV, rozpad splátek na úroky a jistinu, hlídání konce fixace.
3. **Kde se dá ušetřit?** Rozstřel dodavatelů energií, pojištění a internetu napříč byty a odhad úspory z hromadné poptávky.
4. **Co dát do daňového přiznání?** Podklad dle § 9 ZDP včetně odpisů a porovnání paušálu se skutečnými výdaji.

---

## Rychlý start

```bash
npm install
cp .env.example .env          # doplň AUTH_SECRET
npm run db:push               # vytvoří data.db
npm run db:seed               # ukázková data (volitelné)
npm run build && npm start    # http://localhost:3000
```

Do `.env` vygeneruj tajný klíč pro podpis přihlašovacích cookies:

```bash
openssl rand -base64 32
```

### První uživatel

Aplikace nemá veřejnou registraci — účty se zakládají z příkazové řádky:

```bash
npm run user -- add ty@example.com "Tvoje jméno" OWNER
npm run user -- add partner@example.com "Obchodní partner" PARTNER
```

`OWNER` může vše, `PARTNER` má přístup jen pro čtení — vidí čísla a reporty,
ale nemůže nic měnit ani spustit sken trhu.

Pokud jsi spustil `db:seed`, existují ukázkové účty `majitel@example.com` a
`partner@example.com` s heslem `heslo123`. **Před ostrým použitím je smaž nebo jim
změň heslo** (`npm run user -- passwd ...`).

---

## Sdílení s obchodním partnerem

**PDF e-mailem** — nejjednodušší. V sekci Reporty si vyklikáš sekce a rok, stáhneš PDF a pošleš.
Partner nepotřebuje nic instalovat.

**Živý přístup** — partner se přihlásí svým účtem a vidí aktuální data. Aplikaci
nikdy nevystavuj přímo na veřejnou IP. Použij tunel:

```bash
# Tailscale — partner musí být ve tvé síti
tailscale serve 3000

# nebo Cloudflare Tunnel — veřejná HTTPS adresa, přístup pořád chrání přihlášení
cloudflared tunnel --url http://localhost:3000
```

**Tisk z prohlížeče** — stránka `/report` má vlastní tiskové styly, stačí Ctrl+P.

---

## Měsíční sken trhu

Sken stahuje nabídky ze Sreality a Bezrealitek, spočítá medián ceny za m² u
srovnatelných bytů (stejné město, dispozice, plocha ±25 %) a z něj odhadne
hodnotu tvých bytů.

```bash
npm run market:scan
```

Měsíčně přes cron (1. den ve 4:00):

```cron
0 4 1 * * cd /cesta/k/flatmonitoring && /usr/bin/npm run market:scan >> logs/market.log 2>&1
```

Nebo jednorázově tlačítkem v sekci Trh.

**Na co si dát pozor:**

- Jde o **nabídkové** ceny. Realizované bývají o 5–10 % nižší — ber odhad jako horní hranici.
- Při méně než třech srovnatelných nabídkách se odhad nepočítá. Raději žádné číslo než nedůvěryhodné.
- Portály nemají veřejné API pro tento účel a mění strukturu stránek. Když se sken
  rozbije, uloží se jako `FAILED` s popisem chyby (viditelné v sekci Trh) a
  **poslední platné ocenění zůstane nedotčené**. Aplikace kvůli tomu nespadne.
- Sken chodí pomalu a po jednom dotazu na kombinaci město+dispozice, aby portály zbytečně nezatěžoval.

Pokud scraping přestane fungovat, zadej hodnotu ručně jako ocenění typu `MANUAL`
nebo `EXPERT` — zbytek aplikace funguje dál beze změny.

---

## PDF export

PDF se generuje tak, že headless Chromium vytiskne stránku `/report`. Díky tomu
vypadá PDF stejně jako aplikace a není potřeba udržovat druhou šablonu.

Chromium si Playwright stáhne sám:

```bash
npx playwright install chromium
```

Máš-li už Chrome nebo Chromium v systému, ukaž na něj a stahování přeskočíš:

```bash
# .env
CHROMIUM_PATH="/usr/bin/chromium"
```

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

## Struktura

```
prisma/schema.prisma     datový model (nemovitost, úvěr, nájem, transakce, služba, ocenění)
src/lib/finance.ts       amortizace, výnosové ukazatele, IRR
src/lib/tax.ts           odpisy a daň z příjmu z nájmu dle české legislativy
src/lib/portfolio.ts     agregace — z databáze na ukazatele
src/lib/savings.ts       hledání úspor z hromadného vyjednávání
src/lib/market/          scrapery portálů a oceňování z trhu
src/lib/pdf.ts           tisk reportu přes headless Chromium
src/app/report/          tisková verze reportu (zdroj PDF)
scripts/market-scan.ts   měsíční cron
scripts/user.ts          správa uživatelů
```

## Zálohování

Celá databáze je jeden soubor:

```bash
cp data.db zalohy/data-$(date +%F).db
```

`.env` a `*.db` jsou v `.gitignore` — do gitu se nikdy nedostanou.

---

## Co aplikace záměrně nedělá

- **Negeneruje XML pro finanční správu.** Dává čísla, která do přiznání opíšeš nebo předáš účetní.
- **Nenapojuje se na bankovní účet.** Transakce se zadávají ručně nebo importem.
- **Nepočítá DPH ani příjmy podle § 7.** Míří na fyzickou osobu pronajímající byty dle § 9.
