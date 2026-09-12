// 8-neighbour autotiling driven by tables learned from real Stardew maps (data/learned_tiles.json,
// produced by tools/learn_tiles.py). A mask bit is set when that neighbour is "different" in the
// sense the table was learned with: for dirt/plaza = neighbour is not dirt/plaza; for shore =
// neighbour IS water. Bits: N=1 NE=2 E=4 SE=8 S=16 SW=32 W=64 NW=128. Unlisted masks fall back to
// the nearest listed mask by Hamming distance.
export const N = 1, NE = 2, E = 4, SE = 8, S = 16, SW = 32, W = 64, NW = 128;

// learned[mask] = [[tileIndex, count], ...] (most common first). Keeps the top choice plus any
// runner-up that is at least `keep` as common, so plain areas get a little variety.
export function buildResolver(learned, opts) {
  opts = opts || {};
  const keep = opts.keep === undefined ? 0.6 : opts.keep;
  const map = new Map();
  for (const k in learned) {
    const entries = learned[k].filter((e) => !opts.filter || opts.filter(e[0]));
    if (!entries.length) continue;
    const top = entries[0][1];
    const total = learned[k].reduce((a, e) => a + e[1], 0);
    if (opts.minCount && total < opts.minCount) continue;
    map.set(+k, entries.filter((e) => e[1] >= top * keep).map((e) => e[0]));
  }
  const resolve = new Array(256);
  const masks = [...map.keys()];
  for (let m = 0; m < 256; m++) {
    if (map.has(m)) { resolve[m] = map.get(m); continue; }
    let best = 99, bt = null;
    for (const lm of masks) {
      let x = m ^ lm, d = 0;
      while (x) { d += x & 1; x >>= 1; }
      if (d < best) { best = d; bt = map.get(lm); }
    }
    resolve[m] = bt || [];
  }
  return resolve;
}

// deterministic per-tile hash for variant picking
export function tileHash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

export function neighbourMask(differs, x, y) {
  let m = 0;
  if (differs(x, y - 1)) m |= N;
  if (differs(x + 1, y - 1)) m |= NE;
  if (differs(x + 1, y)) m |= E;
  if (differs(x + 1, y + 1)) m |= SE;
  if (differs(x, y + 1)) m |= S;
  if (differs(x - 1, y + 1)) m |= SW;
  if (differs(x - 1, y)) m |= W;
  if (differs(x - 1, y - 1)) m |= NW;
  return m;
}
