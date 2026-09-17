/**
 * Sprava uzivatelu z prikazove radky — aplikace nema registraci zamerne.
 *
 *   npx tsx scripts/user.ts add ty@example.com "Tvoje Jmeno" OWNER
 *   npx tsx scripts/user.ts passwd partner@example.com
 *   npx tsx scripts/user.ts list
 *   npx tsx scripts/user.ts rm partner@example.com
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createInterface } from "readline/promises";

const prisma = new PrismaClient();

async function askPassword(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const pw = await rl.question(prompt);
  rl.close();
  if (pw.length < 8) throw new Error("Heslo musí mít aspoň 8 znaků.");
  return pw;
}

async function main() {
  const [command, email, name, role] = process.argv.slice(2);

  switch (command) {
    case "add": {
      if (!email || !name) throw new Error('Použití: add <email> "<jméno>" [OWNER|PARTNER]');
      const r = (role ?? "PARTNER").toUpperCase();
      if (r !== "OWNER" && r !== "PARTNER") throw new Error("Role musí být OWNER nebo PARTNER.");
      const password = await askPassword(`Heslo pro ${email}: `);
      const user = await prisma.user.create({
        data: { email: email.toLowerCase(), name, role: r, passwordHash: await bcrypt.hash(password, 10) },
      });
      console.log(`Vytvořen ${user.email} (${user.role}).`);
      break;
    }
    case "passwd": {
      if (!email) throw new Error("Použití: passwd <email>");
      const password = await askPassword(`Nové heslo pro ${email}: `);
      await prisma.user.update({
        where: { email: email.toLowerCase() },
        data: { passwordHash: await bcrypt.hash(password, 10) },
      });
      console.log("Heslo změněno.");
      break;
    }
    case "rm": {
      if (!email) throw new Error("Použití: rm <email>");
      await prisma.user.delete({ where: { email: email.toLowerCase() } });
      console.log("Uživatel smazán.");
      break;
    }
    case "list": {
      const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
      if (users.length === 0) { console.log("Žádní uživatelé. Vytvoř prvního: npx tsx scripts/user.ts add ..."); break; }
      for (const u of users) console.log(`${u.role.padEnd(8)} ${u.email.padEnd(30)} ${u.name}`);
      break;
    }
    default:
      console.log(`Použití:
  npx tsx scripts/user.ts add <email> "<jméno>" [OWNER|PARTNER]
  npx tsx scripts/user.ts passwd <email>
  npx tsx scripts/user.ts rm <email>
  npx tsx scripts/user.ts list`);
  }
}

main()
  .catch((e) => { console.error("Chyba:", e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
