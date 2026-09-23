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

### 5. Zadání dat

Všechno se zadává v aplikaci, žádná příkazová řádka:

1. **Nemovitosti → Přidat nemovitost** — adresa, plocha, pořizovací cena, podíl
   na pozemku a odpisová skupina.
2. V **detailu bytu** pak doplníš zbytek. Každá sekce má vlastní formulář:
   - **Dluh a zajištění** — hypotéky a úvěry. Měsíční splátku nech prázdnou
     a dopočítá se anuita.
   - **Nájem a nájemci** — smlouvy. Čisté nájemné drž oddělené od záloh na
     služby; daní se jen nájemné.
   - **Služby a dodavatelé** — energie, pojištění, SVJ. Podklad pro hledání úspor.
   - **Pohyby** — jednotlivé platby. Částku zadáváš kladně, znaménko i daňové
     zařazení určí kategorie.
   - **Ocenění** — aktuální tržní hodnota, ručně nebo ze skenu trhu.

### 6. Účet pro obchodního partnera

V aplikaci jdi na **Uživatelé → Přidat účet** a zvol roli **Jen pro čtení**.
Partner uvidí čísla i reporty, ale nic nezmění a sken trhu nespustí.

Pak mu pošleš adresu aplikace a přihlašovací údaje — heslo ideálně jinou cestou
než ten odkaz. Žádné tunely, žádná nastavení routeru, funguje to odkudkoli.

### 7. Noční sken trhu

Aplikace má **jediný plánovaný běh**: každou noc ve 3:40 projde všechny
nemovitosti, stáhne prodejní i nájemní nabídky, přecení a odhadne nájem.
Do historie se zapisuje jen změna, takže denní běh nevyrobí 365 skoro shodných
řádků za rok.

Běží přes GitHub Actions, ne na Vercelu — Sreality odmítají dotazy z datových
center a sken mezi dotazy čeká, aby portál nezatěžoval; do časového limitu
serverless funkce by se nevešel.

V repozitáři na GitHubu: **Settings → Secrets and variables → Actions →
New repository secret** a přidej `DATABASE_URL`, `DIRECT_URL` (stejné hodnoty
jako na Vercelu) a `MAPY_API_KEY`.

Ručně ho pustíš v záložce **Actions → Noční sken trhu → Run workflow**. Ten samý
běh po sobě uloží i zálohu dat jako artefakt ke stažení. Co proběhlo a jak to
dopadlo, uvidíš v aplikaci na stránce **Provoz**.

---

## Když je aplikace pomalá

Klikni v hlavičce na ukazatel verze — otevře se `/api/diagnostika`, která změří,
kde se čas ztrácí, a napíše diagnózu.

Nejčastější příčina je **databáze na jiném kontinentu než aplikace**. Jeden dotaz
pak trvá kolem 100 ms místo jednotek milisekund a každé načtení stránky na to čeká.
Region Neonu nejde změnit, ale přestěhovat se dá za pár minut:

1. V Neonu **Create project**, region **Europe (Frankfurt)**.
2. Ve staré aplikaci: **Reporty → Stáhnout zálohu**.
3. Ve Vercelu přepiš `DATABASE_URL` a `DIRECT_URL` na nový projekt a nasaď znovu
   (Deployments → … → Redeploy). Build sám vytvoří schéma.
4. Otevři aplikaci — prázdná databáze tě pustí na **První spuštění**, kde si
   založíš dočasný účet.
5. **Reporty → Obnovit ze zálohy** a nahraj stažený soubor. Přepíše i účty, takže
   se pak přihlašuješ původním heslem.
6. Starý projekt v Neonu smaž, ať neplatíš za dva.

Druhá příčina je **uspaná databáze**: Neon ji na free tieru po pěti minutách
nečinnosti vypne a první dotaz ji budí skoro sekundu. To se na placeném tarifu
dá vypnout; jinak se to projeví jen u prvního načtení po pauze.

## Zálohování

Neon sám drží historii změn (na free tieru 24 hodin), takže drobný omyl se dá
vrátit z jeho konzole. Vlastní kopii dat si stáhneš přímo v aplikaci:

**Reporty → Stáhnout zálohu** uloží celou evidenci do jednoho souboru JSON.
**Obnovit ze zálohy** ji nahraje zpět — pozor, přepíše všechno včetně účtů.

Totéž z příkazové řádky, když ji máš po ruce:

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

## Druhy nemovitostí a úvěrů

**Nemovitost** může být byt, družstevní byt, rodinný nebo bytový dům, chata,
garáž, parkovací stání, nebytový či obchodní prostor, sklad a pozemek. Druh
určuje, co dává smysl evidovat a počítat:

- **Pozemek a družstevní podíl se neodepisují** — u nich se odpisový plán vůbec
  nezobrazí. Družstevní podíl navíc není nemovitost, takže při prodeji platí
  časový test pět let podle § 4 odst. 1 písm. s) ZDP, ne deset.
- **Sklady a haly** patří do 4. odpisové skupiny, tedy 20 let místo 30.
- U garáže nebo pozemku se **neptá na dispozici**.
- Sken trhu se spouští jen u druhů, které jdou na Sreality porovnat v kategorii
  bytů — garáž ani pozemek se přeskočí.

**Úvěr** se dělí podle zákona č. 257/2016 Sb. o spotřebitelském úvěru:
hypoteční úvěr na bydlení, americká hypotéka, úvěr ze stavebního spoření,
překlenovací úvěr, spotřebitelský úvěr jiný než na bydlení, podnikatelský úvěr,
soukromá půjčka.

Při zadávání se u každého druhu ukáže, **jak se u něj řeší předčasné splacení** —
to je v praxi největší rozdíl. U hypotéky na bydlení zdarma při výročí fixace,
při prodeji po dvou letech nebo u čtvrtiny jistiny ročně; u spotřebitelského
úvěru kdykoli s náhradou nejvýš 1 %. U podnikatelského úvěru aplikace upozorní,
že se zákonná ochrana spotřebitele neuplatní vůbec.

## Spoluvlastnictví

Byt může mít víc vlastníků s podíly v procentech — třeba ty 50 % a obchodní
partner 50 %. Podíly zadáš v detailu bytu v kartě **Spoluvlastníci**.

Přepínačem v hlavičce pak volíš, co se počítá:

- **Celé portfolio** — všechna čísla za byt jako celek, bez ohledu na podíly.
- **Můj podíl** — všechny částky krácené na tvou část: hodnota, dluh, nájem,
  cash flow i odpisy.

**Poměrové ukazatele se podílem nemění.** Výnos, LTV, DSCR ani cap rate nezávisí
na tom, jak velkou část bytu vlastníš — krátí se čitatel i jmenovatel. Mění se
jen absolutní částky.

**Daně se počítají vždy jen z tvého podílu**, bez ohledu na přepínač.
Spoluvlastník zdaňuje svou část příjmů, výdajů i odpisů.

Byt bez zadaných vlastníků se počítá jako **celý tvůj** — zavedení podílů proto
nerozbije už vedenou evidenci a podíly se dají doplnit postupně. Když součet
podílů nedosáhne sta procent, aplikace upozorní, že se zbytek nezapočítá nikomu.

**Vlastníka vybíráš při zakládání nemovitosti** — nemusí to být ten, kdo záznam
vytvořil. Později ho změníš v **Upravit → Vlastníci a podíly**, kde jde podíl
přepsat, doplnit dalšího spoluvlastníka nebo některého odebrat. Totéž najdeš
i v detailu nemovitosti v kartě *Spoluvlastníci*.

Vlastníkem může být jen uživatel s účtem. Účet pro spoluvlastníka založíš
v sekci **Uživatelé**; roli *jen pro čtení* dej tomu, kdo nemá měnit data.

## Vysvětlivky ukazatelů

Zkratky a ukazatele mají u sebe značku `?`. Po najetí myší, klepnutí na telefonu
nebo přechodu klávesnicí se objeví vysvětlení — co číslo znamená, jak se počítá
a hlavně **jak ho číst**: kdy je dobré a kdy varuje.

Texty jsou v `src/lib/terms.ts`, přidání dalšího ukazatele je jeden záznam
ve slovníku a atribut `term` u popisku.

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

Sken stahuje nabídky ze **Sreality**, spočítá medián ceny za m² u srovnatelných
bytů (stejné město, dispozice, plocha ±25 %) a z něj odhadne hodnotu tvých bytů.
Prochází stránky výpisu, dokud nemá patnáct srovnatelných nabídek, nejvýš deset stránek.

- Jde o **nabídkové** ceny. Realizované bývají o 5–10 % nižší — ber odhad jako horní hranici.
- Při méně než třech srovnatelných nabídkách se odhad nepočítá. Raději žádné číslo než nedůvěryhodné.
- Jeden dotaz trvá 15–20 sekund. Tlačítko v sekci Trh proto skenuje po jedné
  nemovitosti a ukazuje postup — celý sken v jednom požadavku by na serverless
  funkci vypršel.
- Sreality nemají veřejné API (to původní zrušily) a strukturu stránek občas mění.
  Když se sken rozbije, uloží se jako `FAILED` i s adresou, která selhala, a
  **poslední platné ocenění zůstane nedotčené**.
- Hodnotu můžeš kdykoli **zadat ručně** v detailu bytu. Aplikace je plně použitelná
  i s rozbitým skenem — ber ho jako pohodlí, ne jako základ.
- U každého ocenění ze skenu zůstane **uložený snímek nabídek**, ze kterých medián
  vznikl. V detailu bytu na něj vede odkaz *Podle čeho se počítalo* — uvidíš karty
  konkurenčních bytů s cenou za m², čtvrtí i odkazem na inzerát a to, kde mezi nimi
  tvůj byt leží. Snímek se ukládá k ocenění, takže zůstane doložitelný i poté, co
  inzeráty z trhu zmizí.

### Zadávání adresy a hledání v okruhu

Adresa se nevyplňuje po polích. Napiš do řádku *Najít adresu* například
„Korunní 15 Praha“ a ulice, město, PSČ i městská část se doplní samy —
a s nimi souřadnice. Pole pod tím jdou kdykoli přepsat ručně; ruční zásah
souřadnice zahodí, aby okruh nehledal kolem místa, které už v poli nestojí.

Našeptávač jede přes **Mapy.cz** a potřebuje klíč — zdarma a bez karty na
`developer.mapy.cz`. Ulož ho jako proměnnou `MAPY_API_KEY` (ve Vercelu
*Settings → Environment Variables*). Bez klíče formulář funguje dál, jen se
adresa vyplňuje ručně. Dotazy jdou přes vlastní `/api/adresy`, takže klíč
zůstává na serveru — v prohlížeči by se dal přečíst a zneužít.

Proč zrovna Mapy.cz: na dotaz „Masarykova 5, Brno“ nabídl OpenStreetMap
Vranovice, Hrušovany u Brna a Zbýšov. Google Places je kvalitou srovnatelný,
ale chce účet s platební kartou.

Pod adresou je **mapa**. Výběr z našeptávače na ni rovnou posune značku a
klepnutím do mapy polohu upřesníš — našeptávač zná dům, ne který vchod. Ze
souřadnic se adresa dotáhne zpátky, ale platí ta poloha, kam jsi klepl.
V detailu nemovitosti je pak mapa jen k prohlížení, s odkazem do Mapy.cz.

Dlaždice mapy si prohlížeč tahá přes `/api/mapa/dlazdice/...`, ne přímo
z Mapy.cz — v adrese dlaždice je klíč a ten by si z požadavku kdokoli přečetl.
Je to jeden skok navíc, což u aplikace pro dva lidi nevadí.

**Srovnatelné nabídky se pak hledají podle vzdušné vzdálenosti**, ne podle
shody názvu čtvrti. Byt na hranici Vinohrad a Žižkova má blíž k nabídkám za
rohem než k druhému konci „své“ čtvrti, a sousední obec za hranicí města je
srovnatelnější než druhý konec toho samého města. Okruh **se rozšiřuje, dokud není z čeho počítat**: začne na výchozím podle
druhu nemovitosti a zdvojnásobuje se, dokud nemá osm srovnatelných nabídek,
nejvýš však na 50 km. Dál už to není okolí — nabídky padesát kilometrů daleko
jsou jiný trh a medián z nich by klamal.

| Druh | Výchozí okruh | Posloupnost |
| --- | --- | --- |
| Byt, družstevní byt | 3 km | 3 → 6 → 12 → 24 → 48 → 50 |
| Garáž, parkovací stání | 5 km | 5 → 10 → 20 → 40 → 50 |
| Rodinný dům | 8 km | 8 → 16 → 32 → 50 |
| Pozemek | 10 km | 10 → 20 → 40 → 50 |
| Bytový dům, sklad | 15 km | 15 → 30 → 50 |

Pravidlo je záměrně jednoduché — ber nejužší okruh, ve kterém už je osm
nabídek. Důsledek je, že kvůli jedné chybějící nabídce může skočit o stupeň
výš; to je přijatelnější než chytré výjimky, kterým pak nikdo nerozumí.

Rozšíření se nezamlčuje: sníží uvedenou spolehlivost a karta konkurenčních
nabídek napíše, na kolik kilometrů se muselo jít.

U nemovitosti bez souřadnic (založené dřív, nebo s ručně psanou adresou) se
srovnává postaru podle města a čtvrti. Stačí ji otevřít v úpravách a adresu
vybrat z našeptávače.

### Které typy nemovitostí se skenují

Sreality mají pro každý druh vlastní cestu v adrese, ne jen `byty`. Ověřeno
sondou `scripts/probe-kategorie.ts` proti živému webu:

| Typ v aplikaci | Cesta na Sreality | Nabídek s Kč/m² |
| --- | --- | --- |
| Byt, družstevní byt | `byty` | 18/20 |
| Rodinný dům | `domy` (podkategorie Rodinný) | 21/22 |
| Bytový dům | `komercni` (podkategorie Činžovní dům) | 17/20 |
| Garáž | `garaze` | 20/20 |
| Parkovací stání | `garazova-stani` | 18/20 |
| Nebytový prostor | `komercni/kancelare` | 16/20 |
| Obchodní prostor | `komercni/obchodni-prostory` | 18/20 |
| Sklad nebo hala | `komercni/sklady` | 18/20 |
| Pozemek | `pozemky` | 18/20 |

Chata a „jiná nemovitost“ se zatím neskenují. Chaty na Sreality spadají pod
`domy`, ale přesný název podkategorie sonda nepotvrdila — lepší neskenovat než
míchat chatu s vilou. `ostatni/garaz` ani `komercni/obchodni` neexistují
(404); správné tvary jsou v tabulce.

Každá uložená nabídka nese kategorii, takže se druhy nepotkají: garáž 20 m²
a byt 22 m² ve stejném městě by si jinak navzájem zamořily medián.

### Noční sken nájmů

Nájemné reaguje na sezonu i na změnu nabídky ve čtvrti mnohem rychleji než
prodejní cena. Skenuje se ale společně s prodejními cenami v jediném nočním
běhu — dva plány zvlášť jen znamenaly dvě místa, kde něco může selhat. Odhad vzniká stejně jako
u prodejní ceny — medián Kč/m² ze srovnatelných nabídek krát tvoje plocha —
a ukládá se do vlastní historie se snímkem nabídek, ze kterých vznikl.

Do historie se zapíše **jen změna**: shodný odhad nebo pohyb pod 1 % se
zahodí, jinak by za rok vzniklo 365 skoro stejných řádků a vývoj by se v nich
ztratil. V detailu bytu je karta *Tržní nájem*, která odhad porovná s tvým
smluvním nájmem a vyčíslí, kolik ročně necháváš na stole (nebo o kolik jsi nad
trhem a riskuješ odchod nájemníka).

### Které portály jde na nájmy skenovat

Ověřeno sondou proti živým webům (`scripts/probe-rentals.ts`, workflow
*Sonda portálů*):

| Portál | Výsledek |
| --- | --- |
| **Sreality** | HTTP 200, inzeráty strukturovaně v `__NEXT_DATA__` (20 na stránku) — **jediný použitelný zdroj**, vrací 17 srovnatelných nájemních nabídek |
| iDNES Reality | HTTP 200, ceny jen v HTML (25×), žádná strukturovaná data — šlo by parsovat HTML, které se ale mění bez varování |
| Reality.cz | HTTP 200, ceny jen v HTML (25×) — totéž |
| Bezrealitky | HTTP 200, ale v datech stránky žádné rozpoznatelné inzeráty (skládá se v prohlížeči) |
| UlovDomov | HTTP 200, žádné inzeráty v datech stránky |
| RE/MAX | HTTP 200, 0 cen v HTML — vykresluje se až v prohlížeči |
| RealityMix | HTTP 404 |
| Bazoš reality | HTTP 404 |
| Century 21 | HTTP 429 (omezuje četnost dotazů) |
| M&M Reality | HTTP 403 (blokuje roboty) |

#### Bazoš

Bazoš je čitelný — `reality.bazos.cz/pronajmu/byt/` vrací HTTP 200 se dvaceti
inzeráty v serverem vykresleném HTML včetně ceny i lokality. Použitelný ale
není: jeho `robots.txt` zakazuje `/search.php`, `/*hledat=`, `/*hlokalita=`,
`/*humkreis`, `/*cenaod=` i `/*cenado=`, tedy přesně filtr podle lokality,
okruhu a ceny. Město v cestě neexistuje (`/pronajmu/byt/praha/` → 404), RSS
také ne. Povolený je jedině celostátní nefiltrovaný výpis řazený podle data.

Scraper obcházející robots.txt tu vědomě není. Kdyby Sreality vypadly, cesta
vede přes jeden noční průchod povolených stránek `/pronajmu/byt/` s filtrem až
u nás — jeden crawl pro všechny byty, žádný zakázaný parametr. Data z Bazoše
budou ale vždy špinavější: velký podíl soukromých podnájmů, kde cena často
nezahrnuje energie nebo je „dohodou".

Ověřeno `scripts/probe-bazos.ts` (spouští se ručně, nic nemění).

Proto zůstává jediným zdrojem Sreality — se 17 srovnatelnými nabídkami na dotaz
je medián dost podložený. Přidání druhého zdroje by znamenalo parsovat HTML
iDNES nebo Reality.cz, což se tiše rozbije při každém redesignu; kdyby Sreality
vypadly, je to záložní cesta, ne věc, kterou je teď potřeba udržovat.

### Proč mezi zdroji nejsou Bezrealitky

Jejich výpis se skládá až v prohlížeči z mapy. Server vrací pod každou adresou
tutéž sadu zahraničních nabídek v eurech (ověřeno pěti variantami dotazu —
`location`, dvě podoby `regionOsmIds`, město v cestě i bez filtru; v datech
stránky stojí `location: "fromMap"` a prázdné `regionOsmIds`). Z HTML se z nich
české nabídky získat nedají.

### Když se sken rozbije

V repozitáři jsou diagnostické skripty. Spusť v záložce **Actions** workflow
**Sonda portálů** — otestuje scrapery proti živým webům a při selhání rovnou
vypíše skutečnou strukturu dat, takže není potřeba hádat:

```
scripts/test-scrapers.ts    spustí scrapery a zkontroluje kvalitu výsledků
scripts/probe-market.ts     dostupnost adres a hlaviček
scripts/probe-structure.ts  kde v __NEXT_DATA__ leží inzeráty
scripts/probe-fields.ts     přesné tvary polí, stránkování, filtry
scripts/probe-rentals.ts    které portály jdou číst na pronájmy
scripts/probe-bazos.ts      tvary adres Bazoše a co dovoluje robots.txt
scripts/probe-kategorie.ts  které kategorie nemovitostí jdou skenovat
scripts/probe-odkazy.ts     že odkazy na inzeráty vedou na živou stránku
```

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
