# Přesun databáze Neon z USA do EU

Neon region existujícího projektu měnit neumí. Zakládá se nový projekt v Evropě a celá
databáze se do něj přenese workflowem **Migrace databáze do nového regionu**. Stará databáze se
jen čte, takže se dá kdykoli vrátit.

Proč: aplikace běží na Vercelu ve Frankfurtu (`fra1`), databáze v USA. Každý dotaz tak cestuje přes
Atlantik (zhruba 100 ms) a stránka jich dělá desítky.

## 1. Nový projekt v Neonu (Frankfurt)

1. https://console.neon.tech → **New Project**.
2. **Region: AWS Europe (Frankfurt) `eu-central-1`**.
3. **Postgres version: stejná jako u staré databáze** (Settings → ukazuje verzi). Přenos je jinak riskantní.
4. Jméno klidně `flatmonitoring-eu`. Databáze nech prázdnou, nic v ní nezakládej.
5. **Connect** → zkopíruj adresu (stačí jedna, klidně pooled): bude `NOVA_DIRECT_URL`.
   Workflow si z ní sám odvodí přímé spojení (odstraní `-pooler` a parametr `pgbouncer`).
   Později potřebuješ obě varianty (pooled pro `DATABASE_URL`, direct pro `DIRECT_URL`).

## 2. Secret pro přenos

GitHub → repozitář → **Settings → Secrets and variables → Actions → New repository secret**:

- Name `NOVA_DIRECT_URL`, hodnota = adresa nové databáze.

(`DIRECT_URL` se starou databází už tam je. Pokud je v ní adresa s `-pooler`, nevadí.)

## 3. Spuštění přenosu

GitHub → **Actions → Migrace databáze do nového regionu → Run workflow** → do pole napiš `MIGROVAT`.

Workflow udělá:
1. přípravu přímých adres a kontrolu, že se liší (vypíše jen regiony),
2. zálohu staré databáze do JSON (artefakt ke stažení, 90 dní),
3. kontrolu, že nová databáze je prázdná,
4. přenos všeho včetně sekvencí (čísla nájemníků N-0001…), propojení s Google Diskem a paměti složek,
5. porovnání počtu řádků ve **všech** tabulkách (rozdíl = chyba),
6. kontrolu, že schéma sedí s aplikací.

Když se cokoli nepovede, nová databáze zůstane prázdná (přenos běží v jedné transakci) a stará se nemění.

## 4. Přepnutí aplikace

Přepni až po zeleném běhu workflow.

1. **Vercel → projekt → Settings → Environment Variables**: změň
   - `DATABASE_URL` → Pooled connection **nové** databáze (s `&pgbouncer=true`),
   - `DIRECT_URL` → Direct connection **nové** databáze.
2. **Deployments → Redeploy** (proměnné se načtou až při novém nasazení).
3. **GitHub Secrets**: stejné dvě hodnoty (`DATABASE_URL`, `DIRECT_URL`) změň i tam, ať noční sken a další workflowy
   nepíšou do staré databáze.
4. Otevři aplikaci a zkontroluj data; ve Správě → Google Disk by mělo zůstat „Připojeno“.

## 5. Úklid

Starou databázi nech aspoň týden. Až bude vše v pořádku, smaž starý projekt v Neonu (a `NOVA_DIRECT_URL` už nepotřebuješ).

## Návrat zpět

Stačí vrátit původní `DATABASE_URL` a `DIRECT_URL` ve Vercelu i v GitHub Secrets a znovu nasadit.
Pozor: změny provedené v aplikaci po přepnutí jsou jen v nové databázi.
