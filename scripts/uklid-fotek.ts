/**
 * Jednorazovy uklid fotek inzeratu stazenych postaru (z HTML: chybela cast galerie,
 * navic fotka maklere, loga a ikony). Smaze ulozene fotky (soubory na Google Disku jdou
 * do kose, jdou vratit) a odkazy na fotky; dalsi nocni sken je stahne znovu z dat inzeratu.
 * Screenshoty stranek zustavaji; s argumentem "snimky" se smazou i ony (napr. s vyskakovacim
 * oknem pres stranku) a dalsi sken je porizi znovu.
 */
import { PrismaClient } from "@prisma/client";
import { doKose, jeNastaveno } from "../src/lib/googleDrive";

const prisma = new PrismaClient();

async function main() {
  const druhy = process.argv.includes("snimky") ? ["FOTO", "SNIMEK"] : ["FOTO"];
  const fotky = await prisma.inzeratSnimek.findMany({ where: { druh: { in: druhy } }, select: { id: true, driveId: true } });
  let vKosi = 0;
  if (jeNastaveno()) {
    for (const f of fotky.filter((x) => x.driveId)) {
      try { await doKose(f.driveId!); vKosi++; } catch (e) { console.log(`  ${f.driveId}: ${e instanceof Error ? e.message : e}`); }
    }
  }
  const smazano = await prisma.inzeratSnimek.deleteMany({ where: { druh: { in: druhy } } });
  const odkazy = await prisma.inzerat.updateMany({ where: { NOT: { fotkyUrl: { isEmpty: true } } }, data: { fotkyUrl: [] } });
  console.log(`Smazáno ${druhy.join(" + ")}: ${smazano.count} (na Disku do koše ${vKosi}), vynulované odkazy u ${odkazy.count} inzerátů.`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
