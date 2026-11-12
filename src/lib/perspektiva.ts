/**
 * Narovnani fotky dokladu podle 4 rohu (perspektivni transformace). Ciste vypocty bez DOM,
 * at jde otestovat; vykresleni do canvasu je v OrezFotky.
 */
export type Bod = { x: number; y: number };

/** Resi soustavu A·x = b Gaussovou eliminaci (8×8 pro homografii). */
function res(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const v = M[c][c] || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const k = M[r][c] / v;
      for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j];
    }
  }
  return M.map((r, i) => r[n] / (r[i] || 1e-12));
}

/** Homografie H (3×3, h33 = 1), ktera zobrazi body `z` na body `na`. */
export function homografie(z: Bod[], na: Bod[]): number[] {
  const A: number[][] = [], b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = z[i], { x: u, y: v } = na[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  return [...res(A, b), 1];
}

export const aplikuj = (h: number[], x: number, y: number): Bod => {
  const w = h[6] * x + h[7] * y + h[8];
  return { x: (h[0] * x + h[1] * y + h[2]) / w, y: (h[3] * x + h[4] * y + h[5]) / w };
};

const vzd = (a: Bod, b: Bod) => Math.hypot(a.x - b.x, a.y - b.y);

/** Velikost vysledku podle delek stran ctyruhelniku (rohy: LH, PH, PD, LD), nejvys `max` px. */
export function velikostVysledku(rohy: Bod[], max = 2000): { w: number; h: number } {
  const [lh, ph, pd, ld] = rohy;
  let w = Math.max(vzd(lh, ph), vzd(ld, pd));
  let h = Math.max(vzd(lh, ld), vzd(ph, pd));
  const k = Math.min(1, max / Math.max(w, h));
  w = Math.max(1, Math.round(w * k)); h = Math.max(1, Math.round(h * k));
  return { w, h };
}

/**
 * Narovna ctyruhelnik `rohy` (v pixelech zdroje; LH, PH, PD, LD) do obdelniku w×h.
 * Bilinearni interpolace. Vraci RGBA data vysledku.
 */
export function narovnej(zdroj: { data: Uint8ClampedArray; width: number; height: number }, rohy: Bod[], w: number, h: number): Uint8ClampedArray<ArrayBuffer> {
  const H = homografie([{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }], rohy);
  const out = new Uint8ClampedArray(new ArrayBuffer(w * h * 4));
  const { data, width: sw, height: sh } = zdroj;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = aplikuj(H, x + 0.5, y + 0.5);
      const fx = Math.min(sw - 1.001, Math.max(0, p.x - 0.5)), fy = Math.min(sh - 1.001, Math.max(0, p.y - 0.5));
      const x0 = Math.floor(fx), y0 = Math.floor(fy), dx = fx - x0, dy = fy - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
      const o = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        out[o + c] = (data[i00 + c] * (1 - dx) + data[i10 + c] * dx) * (1 - dy) + (data[i01 + c] * (1 - dx) + data[i11 + c] * dx) * dy;
      }
      out[o + 3] = 255;
    }
  }
  return out;
}
