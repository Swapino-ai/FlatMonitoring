/**
 * Kontrola uvolneni dispozice.
 *
 * 3+kk v Oparne nemelo s cim porovnat, protoze zadne jine 3+kk v dosahu neni.
 * Porovnani podle plochy je pak lepsi nez zadny odhad — ale jen jako zaloha
 * a viditelne oznacene. Tenhle test hlida, ze se omezeni neuvolni driv, nez
 * je potreba.
 */
interface R { disposition: string | null; km: number }

function vyber(vsechny: R[], dispozice: string | undefined, minimum: number, okruhy: number[], cil: number) {
  const vyberOkruh = (kand: R[]) => {
    let vybrane = kand;
    for (const k of okruhy) {
      const v = kand.filter((x) => x.km <= k);
      vybrane = v;
      if (v.length >= cil) break;
    }
    // Nejuzsi okruh, ktery vybrane nabidky opravdu obsahuje
    const nejdal = vybrane.reduce((m, x) => Math.max(m, x.km), 0);
    const okruh = okruhy.find((k) => k >= nejdal) ?? okruhy[okruhy.length - 1];
    return { vybrane, okruh };
  };

  const shodne = dispozice ? vsechny.filter((r) => r.disposition === dispozice) : vsechny;
  let { vybrane, okruh } = vyberOkruh(shodne);
  let uvolneno = false;

  if (vybrane.length < minimum && dispozice) {
    const s = vyberOkruh(vsechny);
    if (s.vybrane.length >= minimum) { vybrane = s.vybrane; okruh = s.okruh; uvolneno = true; }
  }
  return { pocet: vybrane.length, okruh, uvolneno };
}

const OKRUHY = [3, 6, 12, 24, 48, 50];

const PRIPADY = [
  {
    popis: "dost 3+kk v lokalitě — neuvolňovat",
    vsechny: [...Array(9)].map((_, i) => ({ disposition: "3+kk", km: 1 + i * 0.1 })),
    ceka: { uvolneno: false, okruh: 3 },
  },
  {
    popis: "Oparno: žádné 3+kk, ale jiné byty jsou — uvolnit",
    vsechny: [{ disposition: "2+1", km: 2 }, { disposition: "2+kk", km: 3 }, { disposition: "1+1", km: 2.5 }],
    ceka: { uvolneno: true, okruh: 3 },
  },
  {
    popis: "dvě 3+kk blízko, minimum jsou tři — uvolnit",
    vsechny: [{ disposition: "3+kk", km: 1 }, { disposition: "3+kk", km: 2 }, { disposition: "2+1", km: 2 }],
    ceka: { uvolneno: true, okruh: 3 },
  },
  {
    // Okruh je tu bez významu — statistika při nulovém počtu vrátí "žádný
    // odhad" a k hlášení se nikdy nedostane
    popis: "nic v dosahu — zůstat bez odhadu",
    vsechny: [] as R[],
    ceka: { uvolneno: false, okruh: 3 },
  },
];

let chyb = 0;
for (const p of PRIPADY) {
  const r = vyber(p.vsechny, "3+kk", 3, OKRUHY, 8);
  const ok = r.uvolneno === p.ceka.uvolneno && r.okruh === p.ceka.okruh;
  if (!ok) chyb++;
  console.log(`  ${ok ? "OK " : "!! "} ${p.popis}`);
  console.log(`       ${r.pocet} nabídek, okruh ${r.okruh} km, dispozice ${r.uvolneno ? "uvolněna" : "dodržena"}`);
}
console.log(chyb === 0 ? "\nUvolnění dispozice funguje." : `\n${chyb} případů neprošlo.`);
process.exitCode = chyb === 0 ? 0 : 1;
