# FlatMonitoring

Přehled nemovitostního portfolia pro soukromého investora do bytů. Běží lokálně,
data zůstávají na tvém počítači v jednom SQLite souboru.

Odpovídá na čtyři otázky:

1. **Jak se mi investice vrací?** Hrubý i čistý výnos, cash-on-cash, cap rate, DSCR, IRR od pořízení.
2. **Kolik na tom vázne dluhu?** Zbývající jistina, LTV, rozpad splátek na úroky a jistinu, hlídání konce fixace.
3. **Kde se dá ušetřit?** Rozstřel dodavatelů energií, pojištění a internetu napříč byty a odhad úspory z hromadné poptávky.
4. **Co dát do daňového přiznání?** Podklad dle § 9 ZDP včetně odpisů a porovnání paušálu se skutečnými výdaji.

---

## Nasazení

Aplikace je zamýšlená tak, že běží **na tvém počítači nebo na domácím serveru**,
ne v cloudu. Data neopouštějí tvůj stroj.

Potřebuješ jen **Node.js 20 nebo novější** ([nodejs.org](https://nodejs.org)).
Nic dalšího — databáze je soubor, žádný databázový server se neinstaluje.

### 1. Instalace

```bash
git clone https://github.com/Swapino-ai/FlatMonitoring.git
cd FlatMonitoring
npm install
npm run setup
```

`npm run setup` je idempotentní — vygeneruje `.env` s náhodným podpisovým klíčem,
založí databázi v `data/data.db`, zeptá se na tvůj účet a stáhne Chromium pro PDF.
Když něco už existuje, nechá to být, takže ho můžeš klidně spustit znovu.

Neinteraktivně (např. z vlastního skriptu):

```bash
FM_EMAIL=ty@example.com FM_NAME="Tvoje jméno" FM_PASSWORD='silneheslo' npm run setup
```

### 2. Spuštění

```bash
npm run build
npm start                     # http://localhost:3000
```

Chceš si to nejdřív osahat na ukázkových datech?

```bash
npm run db:seed               # tři byty, úvěry, dva roky transakcí
```

Seed vytvoří i účty `majitel@example.com` a `partner@example.com` s heslem
`heslo123`. **Než tam dáš ostrá data, smaž je** (`npm run user -- rm ...`).

### 3. Ať to běží pořád

Samotné `npm start` skončí, jakmile zavřeš terminál. Pro trvalý běh jsou
v adresáři `deploy/` připravené konfigurace — v obou stačí přepsat `CHANGE_ME`:

**Linux (systemd):**

```bash
sudo cp deploy/flatmonitoring.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now flatmonitoring
journalctl -u flatmonitoring -f
```

**macOS (launchd):**

```bash
mkdir -p logs
cp deploy/com.flatmonitoring.app.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.flatmonitoring.app.plist
```

**Windows:** nejjednodušší je [NSSM](https://nssm.cc) — `nssm install FlatMonitoring`,
jako program zadej cestu k `npm.cmd`, argument `start` a pracovní adresář projektu.

### 4. Přístup pro obchodního partnera

Založ mu účet v režimu jen pro čtení — vidí čísla i reporty, ale nemůže nic měnit
ani spustit sken:

```bash
npm run user -- add partner@example.com "Obchodní partner" PARTNER
```

**Aplikaci nikdy nevystavuj přímo na veřejnou IP ani neotevírej port na routeru.**
Použij tunel, který provoz šifruje a nevystaví tvou domácí síť:

```bash
# Tailscale — partner musí být ve tvé tailnet síti. Nejbezpečnější varianta.
tailscale serve 3000

# Cloudflare Tunnel — veřejná HTTPS adresa, přístup pořád chrání přihlášení.
cloudflared tunnel --url http://localhost:3000
```

Nechceš-li řešit síť vůbec, funguje i nejjednodušší cesta: v sekci Reporty
vygeneruj PDF a pošli ho e-mailem. Partner nepotřebuje vůbec nic.

### 5. Automatický provoz

Měsíční sken trhu a denní záloha. Na Linuxu systemd timerem:

```bash
sudo cp deploy/flatmonitoring-scan.service deploy/flatmonitoring.timer /etc/systemd/system/
sudo systemctl enable --now flatmonitoring.timer
```

Nebo prostým cronem:

```cron
0 4 1 * * cd /cesta/k/FlatMonitoring && /usr/bin/npm run market:scan >> logs/market.log 2>&1
0 3 * * * cd /cesta/k/FlatMonitoring && /usr/bin/npm run backup >> logs/backup.log 2>&1
```

### 6. Zálohování

```bash
npm run backup                      # zalohy/data-2026-09-17.db
npm run backup -- /Volumes/disk/fm.db
```

Používá `VACUUM INTO`, takže záloha je konzistentní i za běhu aplikace — na rozdíl
od prostého kopírování souboru. Posledních 30 záloh si nechá, starší maže.

Obnova je prosté přejmenování zpátky na `data/data.db` (aplikaci předtím zastav).

### Aktualizace

```bash
git pull
npm install
npm run db:push        # promítne případné změny schématu
npm run build
sudo systemctl restart flatmonitoring
```

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
scripts/setup.ts         první spuštění (idempotentní)
scripts/market-scan.ts   měsíční sken trhu pro cron
scripts/backup.ts        konzistentní záloha databáze
scripts/user.ts          správa uživatelů
deploy/                  systemd a launchd konfigurace
data/data.db             celá databáze — jediný soubor, který je potřeba zálohovat
```

## Kam se ukládají data

Celá databáze je jeden soubor: **`data/data.db`**. Zálohuj přes `npm run backup`
(viz výše), ne kopírováním za běhu.

`.env`, `data/` a `zalohy/` jsou v `.gitignore` — do gitu se nikdy nedostanou.

---

## Co aplikace záměrně nedělá

- **Negeneruje XML pro finanční správu.** Dává čísla, která do přiznání opíšeš nebo předáš účetní.
- **Nenapojuje se na bankovní účet.** Transakce se zadávají ručně nebo importem.
- **Nepočítá DPH ani příjmy podle § 7.** Míří na fyzickou osobu pronajímající byty dle § 9.
