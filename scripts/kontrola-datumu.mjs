/**
 * Pojistka: datum se v aplikaci zadava vzdy ve formatu dd/mm/yyyy pres DatumPole
 * (ceský kalendar). Prohlizecovy <input type="date"> formatuje podle jazyka prohlizece
 * (napr. mm/dd/yyyy) — jeho pouziti shodi build.
 *
 * Pole z components/form.tsx s type="date" je v poradku: samo vykresli DatumPole.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ZAKAZANE = /<input\b[^>]*\btype=\{?["'](date|datetime-local|month|week)["']/s;
const nalezy = [];
const projdi = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) projdi(p);
    else if (/\.(tsx|jsx)$/.test(f)) {
      // Komentare (i ty, co o <input type="date"> mluvi) se nepocitaji; delka radku zustava
      const text = readFileSync(p, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, (k) => k.replace(/[^\n]/g, " "))
        .replace(/\/\/[^\n]*/g, (k) => " ".repeat(k.length));
      for (const m of text.matchAll(new RegExp(ZAKAZANE.source, "gs"))) {
        const radek = text.slice(0, m.index).split("\n").length;
        nalezy.push(`${p}:${radek}`);
      }
    }
  }
};
projdi("src");
if (nalezy.length) {
  console.error("Prohlížečové datumové pole (<input type=\"date\">) — použij DatumPole (dd/mm/yyyy):\n  " + nalezy.join("\n  "));
  process.exit(1);
}
console.log("Kontrola datumových polí: OK (vše přes DatumPole, dd/mm/yyyy)");
