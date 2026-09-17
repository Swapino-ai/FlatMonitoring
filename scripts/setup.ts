/**
 * Prvni spusteni — pripravi .env, databazi a prvniho uzivatele.
 * Je idempotentni: co uz existuje, nechá být. Klidně spusť znovu.
 *
 *   npm run setup
 */
import { execFileSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { randomBytes } from "crypto";
import { createInterface } from "readline/promises";
import { join } from "path";

const root = process.cwd();

function step(n: number, text: string) {
  console.log(`\n[${n}/4] ${text}`);
}

function run(cmd: string, args: string[]) {
  execFileSync(cmd, args, { stdio: "inherit", cwd: root });
}

interface Credentials { email: string; name: string; password: string }

/**
 * Prihlasovaci udaje bud z prostredi (neinteraktivni instalace), nebo dotazem.
 * Pri presmerovanem vstupu se nikdy neptame do prazdna — radeji krok preskocime.
 */
async function collectCredentials(): Promise<Credentials | null> {
  const fromEnv = {
    email: process.env.FM_EMAIL?.trim().toLowerCase() ?? "",
    name: process.env.FM_NAME?.trim() ?? "",
    password: process.env.FM_PASSWORD ?? "",
  };
  if (fromEnv.email && fromEnv.password.length >= 8) {
    console.log(`  Použity údaje z proměnných prostředí (${fromEnv.email}).`);
    return fromEnv;
  }
  if (fromEnv.email || fromEnv.password) {
    console.log("  FM_EMAIL a FM_PASSWORD (min. 8 znaků) musí být zadané obě.");
    return null;
  }

  if (!process.stdin.isTTY) {
    console.log("  Vstup není terminál, nemohu se zeptat.");
    console.log("  Pro neinteraktivní instalaci nastav FM_EMAIL, FM_NAME a FM_PASSWORD.");
    return null;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const email = (await rl.question("  Tvůj e-mail: ")).trim().toLowerCase();
    if (!email) return null;
    const name = (await rl.question("  Tvoje jméno: ")).trim();

    for (let attempt = 0; attempt < 3; attempt++) {
      const password = await rl.question("  Heslo (min. 8 znaků): ");
      if (password.length >= 8) return { email, name, password };
      console.log("  Krátké heslo, zkus znovu.");
    }
    console.log("  Tři pokusy nevyšly.");
    return null;
  } finally {
    rl.close();
  }
}

async function main() {
  console.log("FlatMonitoring — příprava instalace\n" + "=".repeat(38));

  // 1) .env
  step(1, "Konfigurace");
  const envPath = join(root, ".env");
  if (existsSync(envPath)) {
    const env = readFileSync(envPath, "utf8");
    if (/AUTH_SECRET="?(vygeneruj|zmen-me|)"?\s*$/m.test(env)) {
      const secret = randomBytes(32).toString("base64");
      writeFileSync(envPath, env.replace(/^AUTH_SECRET=.*$/m, `AUTH_SECRET="${secret}"`));
      console.log("  AUTH_SECRET vygenerován.");
    } else {
      console.log("  .env už existuje a má vyplněný AUTH_SECRET — nechávám být.");
    }
  } else {
    const secret = randomBytes(32).toString("base64");
    writeFileSync(envPath,
      `DATABASE_URL="file:../data/data.db"\n` +
      `AUTH_SECRET="${secret}"\n` +
      `CHROMIUM_PATH=""\n`);
    console.log("  .env vytvořen, AUTH_SECRET vygenerován.");
  }

  // 2) databaze
  step(2, "Databáze");
  mkdirSync(join(root, "data"), { recursive: true });
  run("npx", ["prisma", "generate"]);
  run("npx", ["prisma", "db", "push", "--skip-generate"]);
  console.log("  Databáze je v data/data.db");

  // 3) prvni uzivatel
  step(3, "První uživatel");
  const { PrismaClient } = await import("@prisma/client");
  const bcrypt = (await import("bcryptjs")).default;
  const prisma = new PrismaClient();

  const count = await prisma.user.count();
  if (count > 0) {
    console.log(`  Už existuje ${count} uživatelů — přeskakuji.`);
  } else {
    const creds = await collectCredentials();
    if (creds) {
      await prisma.user.create({
        data: {
          email: creds.email,
          name: creds.name || creds.email,
          role: "OWNER",
          passwordHash: await bcrypt.hash(creds.password, 10),
        },
      });
      console.log(`  Účet ${creds.email} vytvořen s rolí OWNER.`);
    } else {
      console.log("  Přeskakuji — účet si vytvoř sám:");
      console.log('    npm run user -- add ty@example.com "Tvoje jméno" OWNER');
    }
  }
  await prisma.$disconnect();

  // 4) prohlizec pro PDF
  step(4, "Chromium pro PDF export");
  const envText = readFileSync(envPath, "utf8");
  const custom = envText.match(/^CHROMIUM_PATH="(.+)"$/m)?.[1];
  if (custom && existsSync(custom)) {
    console.log(`  Použije se ${custom}.`);
  } else {
    try {
      run("npx", ["playwright", "install", "chromium"]);
      console.log("  Chromium připraven.");
    } catch {
      console.log("  Chromium se nepodařilo stáhnout. PDF export zatím nepojede.");
      console.log("  Máš-li Chrome v systému, doplň do .env cestu: CHROMIUM_PATH=\"/usr/bin/chromium\"");
    }
  }

  console.log(`
${"=".repeat(38)}
Hotovo. Spusť aplikaci:

  npm run build && npm start     →  http://localhost:3000

Další účet (např. pro obchodního partnera, jen pro čtení):

  npm run user -- add partner@example.com "Partner" PARTNER
`);
}

main().catch((e) => {
  console.error("\nInstalace selhala:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
