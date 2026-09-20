/**
 * Priprava instalace. Idempotentni — co uz existuje, necha byt.
 *
 *   npm run setup
 *
 * Vyzaduje, aby v .env bylo DATABASE_URL a DIRECT_URL z Neonu.
 */
import { execFileSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { randomBytes } from "crypto";
import { createInterface } from "readline/promises";
import { join } from "path";

const root = process.cwd();
const isWindows = process.platform === "win32";

function step(n: number, text: string) {
  console.log(`\n[${n}/3] ${text}`);
}

/** Na Windows je npx ve skutecnosti npx.cmd a Node ho bez shellu nespusti. */
function run(cmd: string, args: string[]) {
  execFileSync(isWindows ? `${cmd}.cmd` : cmd, args, { stdio: "inherit", cwd: root, shell: isWindows });
}

interface Credentials { email: string; name: string; password: string }

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
    console.log("  Vstup není terminál. Nastav FM_EMAIL, FM_NAME a FM_PASSWORD,");
    console.log('  nebo účet založ později: npm run user -- add ty@example.com "Jméno" OWNER');
    return null;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const email = (await rl.question("  Tvůj e-mail: ")).trim().toLowerCase();
    if (!email) return null;
    const name = (await rl.question("  Tvoje jméno: ")).trim();
    for (let i = 0; i < 3; i++) {
      const password = await rl.question("  Heslo (min. 8 znaků): ");
      if (password.length >= 8) return { email, name, password };
      console.log("  Krátké heslo, zkus znovu.");
    }
    return null;
  } finally {
    rl.close();
  }
}

async function main() {
  console.log("FlatMonitoring — příprava\n" + "=".repeat(30));

  // 1) .env a pripojeni k databazi
  step(1, "Konfigurace");
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) {
    writeFileSync(envPath,
      `# Připojovací řetězce z Neonu — viz README, sekce Nasazení\n` +
      `DATABASE_URL=""\n` +
      `DIRECT_URL=""\n` +
      `AUTH_SECRET="${randomBytes(32).toString("base64")}"\n`);
    console.log("  .env vytvořen a AUTH_SECRET vygenerován.");
    console.error(`
  Doplň do .env připojovací řetězce z Neonu a spusť setup znovu:

    DATABASE_URL  — Pooled connection (obsahuje "-pooler")
    DIRECT_URL    — Direct connection (bez "-pooler")
`);
    process.exitCode = 1;
    return;
  }

  let env = readFileSync(envPath, "utf8");
  if (/^AUTH_SECRET="?(vygeneruj|zmen-me|)"?\s*$/m.test(env)) {
    env = env.replace(/^AUTH_SECRET=.*$/m, `AUTH_SECRET="${randomBytes(32).toString("base64")}"`);
    writeFileSync(envPath, env);
    console.log("  AUTH_SECRET vygenerován.");
  }

  const chybi = ["DATABASE_URL", "DIRECT_URL"].filter((k) => {
    const m = env.match(new RegExp(`^${k}="?([^"\\n]*)"?$`, "m"));
    return !m || !m[1].trim();
  });
  if (chybi.length) {
    console.error(`\n  V .env chybí: ${chybi.join(", ")}`);
    console.error("  Zkopíruj je z Neonu (Dashboard → Connect) a spusť setup znovu.");
    process.exitCode = 1;
    return;
  }
  console.log("  Připojovací řetězce jsou vyplněné.");

  // 2) databaze
  step(2, "Databáze");
  run("npx", ["prisma", "generate"]);
  run("npx", ["prisma", "db", "push", "--skip-generate"]);

  // 3) prvni uzivatel
  step(3, "První uživatel");
  const { PrismaClient } = await import("@prisma/client");
  const bcrypt = (await import("bcryptjs")).default;
  const prisma = new PrismaClient();
  try {
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
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(`
${"=".repeat(30)}
Hotovo. Lokálně spustíš aplikaci:

  npm run build && npm start     →  http://localhost:3000

Účet pro obchodního partnera (jen pro čtení):

  npm run user -- add partner@example.com "Partner" PARTNER
`);
}

main().catch((e) => {
  console.error("\nInstalace selhala:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
