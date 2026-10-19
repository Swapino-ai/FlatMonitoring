/** Nocni stazeni pohybu z Fio a jejich sparovani (GitHub Actions). Bez FIO_TOKEN nic nedela. */
import { fioNastaveno } from "../src/lib/fio";
import { synchronizujFio } from "../src/lib/fioSync";
import { prisma } from "../src/lib/db";

async function main() {
  if (!fioNastaveno()) { console.log("Fio není napojené (chybí FIO_TOKEN), přeskočeno."); return; }
  const r = await synchronizujFio();
  console.log(r.error ? `Fio: ${r.error}` : `Fio: ${r.novych} nových pohybů, spárováno ${r.sparovano}, ke kontrole ${r.keKontrole}.`);
}
main().finally(() => prisma.$disconnect());
