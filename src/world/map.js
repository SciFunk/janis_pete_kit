// GameMap: one location. Terrain is a char grid resolved into tiles by autotiling (tables learned
// from real Stardew maps); sparse tile layers ("detail" under entities, "front" above) sit on top;
// props are y-sorted with entities.
//
// Terrain chars: g grass · d dirt · w water · p stone plaza (town sheet) · x void (black, solid) ·
// f interior floor · W interior wall band · F low fence (cave: animals cross, player can't) ·
// C chasm (cave: only flyers cross). Both are player-solid; src/systems/puzzle.js reads them.
import { Assets } from "../engine/assets.js";
import { Tileset, TS } from "./tileset.js";
import { buildResolver, neighbourMask, tileHash } from "./autotile.js";
import { Prop } from "./props.js";
import { Critter } from "../entities/critter.js";

const OUT_COLS = 25, TOWN_COLS = 32;             // vanilla sheet widths the learned indices refer to
const GRASS_PLAIN = [175, 175];   // Ridgeside's plain grass; its decorations (tufts, animated flowers) share this base tone
const GRASS_DECOR = [];   // the sheet's tufts sit on a darker grass square than 175; none match, so plain grass only
const WATER_PLAIN = [1231, 1274, 1231, 1231];
const SHORE_BLOCK = (i) => { const c = i % OUT_COLS, r = Math.floor(i / OUT_COLS); return r >= 24 && r <= 28 && c >= 4 && c <= 7; };
// bank overlays the real maps draw on water cells next to land (Buildings layer): the dirt-cliff rim
// blocks at rows 6-13 and 27-31 of the outdoors sheet; bushes and fences that also sit on shores are not
const BANK_BLOCK = (i) => { const r = Math.floor(i / OUT_COLS), c = i % OUT_COLS; return (r >= 6 && r <= 13 && c >= 6 && c <= 13) || (r >= 27 && r <= 31 && c >= 3 && c <= 11); };
const FOAM_ROW = (i) => { const r = Math.floor(i / OUT_COLS); return BANK_BLOCK(i) && (r === 8 || r === 9 || r === 29); };
const CLIFF_TOP = (i) => { const r = Math.floor(i / OUT_COLS); return r === 7 || r === 28; };   // full-dirt cliff tiles: the foam row goes under them

let RES = null;   // resolvers built once from Assets.data.learned
function resolvers() {
  if (RES) return RES;
  const L = Assets.data.learned;
  const shoreTable = {};
  for (const m in L.shore) shoreTable[m] = L.shore[m].filter((e) => e[0][0] === "out").map((e) => [e[0][1], e[1]]);
  RES = {
    dirt: buildResolver(L.dirt, { keep: 0.6, minCount: 3 }),
    plaza: buildResolver(L.plaza, { keep: 0.5, minCount: 2 }),
    // shore: prefer the grass-bank block tiles; plain grass wins only when nothing from the block was seen
    // land next to water: mostly plain grass, sometimes a tuft overhang (never the plain dirt tiles 680/681)
    shore: buildResolver(shoreTable, { keep: 0.5, minCount: 2, filter: (i) => i === 175 || (SHORE_BLOCK(i) && i !== 680 && i !== 681) }),
    bank: buildResolver(L.wover || {}, { keep: 0.5, minCount: 3, filter: BANK_BLOCK }),   // cliff rim drawn over the water cell
    bank2: buildResolver(L.wover2 || {}, { keep: 0.5, minCount: 4, filter: FOAM_ROW }),    // foam row under a cliff top
    wedge: buildResolver(L.wedge || {}, { keep: 0.5, minCount: 2 }),                      // water tiles that carry the shoreline
    anims: L.anims,
  };
  return RES;
}

export class GameMap {
  constructor(def) {
    this.def = def;
    this.id = def.id;
    this.name = def.name || def.id;
    this.w = def.w; this.h = def.h;
    this.indoor = !!def.indoor;
    this.tilesetKey = def.tileset || "outdoors";
    this.terrain = new Uint8Array(this.w * this.h);
    for (let y = 0; y < this.h; y++) {
      const row = def.terrain[y] || "";
      for (let x = 0; x < this.w; x++) this.terrain[y * this.w + x] = (row.charCodeAt(x) || 103); // 'g'
    }
    this.ground = new Int32Array(this.w * this.h).fill(-1);
    this.solid = new Uint8Array(this.w * this.h);
    this.detail = def.layers && def.layers.detail ? def.layers.detail : [];
    this.front = def.layers && def.layers.front ? def.layers.front : [];
    this.props = []; this.critters = [];       // critters: wandering animals spawned from props of kind "animal"
    this.warps = def.warps || [];
    this.spawns = def.spawns || {};
    this.music = def.music || null;
    this.season = "spring";
    this.special = new Map();   // cell index -> {img, sx, sy} for tiles drawn from another sheet
    // editor paint layer: "x,y" -> {sheet, idx, solid}; drawn over the ground, under entities
    this.paint = new Map(); for (const [x, y, sh, idx, so] of (def.layers && def.layers.paint) || []) this.paint.set(x + "," + y, { sheet: sh, idx: idx, solid: !!so });
    this.floorTiles = new Map(); for (const [x, y, f] of def.floorTiles || []) this.floorTiles.set(x + "," + y, f);
    this.wallTiles = new Map(); for (const [x, y, f] of def.wallTiles || []) this.wallTiles.set(x + "," + y, f);
    this.waterCells = [];       // [x, y, ...] of water tiles (animated overlay)
    this.anim = new Map();
    const catalog = Assets.data.props;
    (def.props || []).forEach((inst, i) => {
      const pdef = catalog[inst.name];
      if (!pdef) { console.warn("unknown prop", inst.name); return; }
      if (inst.removed) return;                       // removed in the editor (data/maps/edits)
      const p = new Prop(pdef, inst.name, inst); p.index = i; p.map = this;
      this.props.push(p);
      if (pdef.kind === "animal") { p.critter = new Critter(p); this.critters.push(p.critter); }
    });
    this.rebuild();
  }

  // ---- per-map persistent state (removed props, hoed dirt) ----
  saveState() {
    const removed = [];
    const alive = new Set(this.props.map((p) => p.index));
    (this.def.props || []).forEach((inst, i) => { if (!alive.has(i)) removed.push(i); });
    const hp = {};
    for (const p of this.props) if (p.def.hp && p.hp !== p.def.hp) hp[p.index] = p.hp;
    const out = { removed: removed, hp: hp };
    if (this.farm) { out.farm = []; for (const [k, t] of this.farm.hoed) out.farm.push([k, t.w ? 1 : 0, t.crop]); }
    return out;
  }
  applyState(st) {
    if (!st) return;
    const rm = new Set(st.removed || []);
    this.props = this.props.filter((p) => !rm.has(p.index));
    for (const p of this.props) if (st.hp && st.hp[p.index] !== undefined) p.hp = st.hp[p.index];
    if (st.farm) { this.farm = { hoed: new Map() }; for (const [k, w, crop] of st.farm) this.farm.hoed.set(k, { w: !!w, crop: crop || null }); }
    this.rebuildSolid();
  }

  tileset() {
    const key = this.tilesetKey === "outdoors" ? "outdoors_" + this.season : this.tilesetKey;
    if (!this._ts || this._tsKey !== key) { this._ts = new Tileset(Assets.img[key]); this._tsKey = key; }
    return this._ts;
  }
  // outdoors-sheet index (25-column vanilla numbering) -> this tileset's id
  oid(idx) { const ts = this.tileset(); return ts.id(idx % OUT_COLS, Math.floor(idx / OUT_COLS)); }

  t(x, y) { // terrain char code with edge clamping
    if (x < 0) x = 0; if (y < 0) y = 0; if (x >= this.w) x = this.w - 1; if (y >= this.h) y = this.h - 1;
    return this.terrain[y * this.w + x];
  }
  setTerrain(x, y, ch) { this.terrain[y * this.w + x] = ch.charCodeAt(0); this.rebuild(); }
  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }

  rebuild() { this.rebuildGround(); this.rebuildSolid(); }

  rebuildGround() {
    const w = this.w, h = this.h, T = this.terrain;
    const R = this.indoor ? null : resolvers();
    this.special.clear(); this.waterCells = []; this.bank = [];
    const isNotDirt = (x, y) => this.t(x, y) !== 100;
    const isWater = (x, y) => this.t(x, y) === 119;
    const isLand = (x, y) => this.t(x, y) !== 119;
    const isNotPlaza = (x, y) => this.t(x, y) !== 112;
    const pick = (list, hsh) => list[(hsh >>> 3) % list.length];
    const cliff = new Set();   // water cells that got a full-dirt cliff top; the row below gets foam
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = T[y * w + x], i = y * w + x;
      const hsh = tileHash(x, y);
      if (c === 103) {                                   // g
        const wm = neighbourMask(isWater, x, y);
        let idx;
        if (wm && R) { const opts = R.shore[wm]; idx = opts && opts.length ? pick(opts, hsh) : 175; }
        else idx = (hsh % 17 === 0) ? GRASS_DECOR[(hsh >>> 8) % GRASS_DECOR.length] : GRASS_PLAIN[(hsh >>> 4) % 2];
        this.ground[i] = this.oid(idx);
      } else if (c === 100) {                            // d: dirt, grass fringe on the sides that meet grass
        const nd = (xx, yy) => this.inBounds(xx, yy) && this.t(xx, yy) !== 100;
        const n = nd(x, y - 1), e = nd(x + 1, y), s = nd(x, y + 1), w2 = nd(x - 1, y), v = (hsh >>> 2) % 2;
        let idx = v ? 227 : 226;
        if (n && w2) idx = 184; else if (n && e) idx = 187; else if (s && w2) idx = 266; else if (s && e) idx = 269;
        else if (n) idx = v ? 186 : 185; else if (s) idx = v ? 268 : 267; else if (w2) idx = 225; else if (e) idx = 228;
        this.ground[i] = this.oid(idx);
      } else if (c === 119) {                            // w: shoreline is drawn on the water tile, as in the real maps
        const lm = neighbourMask(isLand, x, y);
        const opts = lm && R ? R.wedge[lm] : null;
        this.ground[i] = this.oid(opts && opts.length ? pick(opts, hsh) : WATER_PLAIN[(hsh >>> 5) % WATER_PLAIN.length]);
        this.waterCells.push(x, y);
        if (lm && R) { const bo = R.bank[lm]; if (bo && bo.length) { this.bank.push([x, y, this.oid(bo[0])]); if (CLIFF_TOP(bo[0])) cliff.add(i); } }   // most common = consistent rim
      } else if (c === 112) {                            // p: town-sheet plaza stone
        const m = neighbourMask(isNotPlaza, x, y);
        const opts = R ? R.plaza[m] : null;
        const idx = opts && opts.length ? pick(opts, hsh) : 641;
        this.special.set(i, { img: Assets.img["town_" + this.season] || Assets.img.town_spring, sx: (idx % TOWN_COLS) * 16, sy: Math.floor(idx / TOWN_COLS) * 16 });
        this.ground[i] = -2;
      } else if (c === 102 || c === 70) {                // f (and F fence): interior floor from floors.png (32x32 patterns)
        const fo = this.floorTiles.get(x + "," + y); let f = fo !== undefined ? fo : (this.def.floor || 0), fimg = Assets.img.floors;
        if (typeof f === "string") { const q = f.split(":"); fimg = Assets.img[q[0]] || fimg; f = +q[1] || 0; }
        this.special.set(i, { img: fimg, sx: (f % 8) * 32 + (x % 2) * 16, sy: Math.floor(f / 8) * 32 + (y % 2) * 16 });
        this.ground[i] = -2;
      } else if (c === 87) {                             // W: interior wall from walls.png (16x48 wallpapers)
        const wo = this.wallTiles.get(x + "," + y); let wp = wo !== undefined ? wo : (this.def.wallpaper || 0), wimg = Assets.img.walls;
        if (typeof wp === "string") { const q = wp.split(":"); wimg = Assets.img[q[0]] || wimg; wp = +q[1] || 0; }
        let k = 0; while (k < 2 && y - k - 1 >= 0 && T[(y - k - 1) * w + x] === 87) k++;
        this.special.set(i, { img: wimg, sx: (wp % 16) * 16, sy: Math.floor(wp / 16) * 48 + k * 16 });
        this.ground[i] = -2;
      } else {                                           // x void
        this.ground[i] = -1;
      }
    }
    if (R && cliff.size) {   // second pass: foam under cliff tops (learned as its own table)
      const isCliff = (x, y) => this.inBounds(x, y) && cliff.has(y * w + x);
      for (let i = 0; i < this.waterCells.length; i += 2) {
        const x = this.waterCells[i], y = this.waterCells[i + 1];
        if (neighbourMask(isLand, x, y)) continue;
        const cm = neighbourMask(isCliff, x, y);
        if (!(cm & 1)) continue;                      // only directly under a cliff top
        const bo = R.bank2[cm]; if (bo && bo.length) this.bank.push([x, y, this.oid(bo[0])]);
      }
    }
    for (const [x, y, id] of (this.def.layers && this.def.layers.ground) || []) this.ground[y * w + x] = id;
    // animation lookup keyed by this tileset's ids
    this.anim = new Map();
    if (R) for (const k in R.anims) {
      const frames = R.anims[k].map(([tid, dur]) => [this.oid(tid), dur]);
      const total = frames.reduce((a, f) => a + f[1], 0);
      this.anim.set(this.oid(+k), { frames: frames, total: total });
    }
  }

  rebuildSolid() {
    const w = this.w, h = this.h;
    this.solid.fill(0);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = this.terrain[y * w + x];
      if (c === 119 || c === 120 || c === 87 || c === 70 || c === 67) this.solid[y * w + x] = 1; // water, void, wall, fence, chasm
    }
    for (const [x, y] of (this.def.layers && this.def.layers.solid) || []) this.solid[y * w + x] = 1;
    for (const [k, t] of this.paint) if (t.solid) { const [x, y] = k.split(",").map(Number); if (this.inBounds(x, y)) this.solid[y * w + x] = 1; }
    for (const p of this.props) {
      const r = p.solidRect;
      if (!r) continue;
      for (let y = r[1]; y < r[1] + r[3]; y++) for (let x = r[0]; x < r[0] + r[2]; x++)
        if (this.inBounds(x, y)) this.solid[y * w + x] = 1;
      const d = p.doorTile;
      if (d && this.inBounds(d[0], d[1])) this.solid[d[1] * w + d[0]] = 0;
    }
  }

  isSolid(tx, ty) {
    if (!this.inBounds(tx, ty)) return true;
    if (this.solid[ty * this.w + tx] === 1) return true;
    return !!(this.extraSolid && this.extraSolid.size && this.extraSolid.has(tx + "," + ty));   // closed gates, levers (puzzle rooms)
  }

  rectBlocked(x, y, w, h) {
    const x0 = Math.floor(x / TS), y0 = Math.floor(y / TS), x1 = Math.floor((x + w - 1) / TS), y1 = Math.floor((y + h - 1) / TS);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (this.isSolid(tx, ty)) return true;
    return false;
  }

  propAt(tx, ty) {
    for (const p of this.props) if (p.containsTile(tx, ty)) return p;
    return null;
  }
  propById(id) { return this.props.find((p) => p.id === id) || null; }
  removeProp(p) { const i = this.props.indexOf(p); if (i >= 0) { this.props.splice(i, 1); this.rebuildSolid(); } if (p.critter) { const j = this.critters.indexOf(p.critter); if (j >= 0) this.critters.splice(j, 1); } }
  addProp(name, inst) {
    const pdef = Assets.data.props[name];
    if (!pdef) { console.warn("unknown prop", name); return null; }
    const p = new Prop(pdef, name, inst); p.map = this; p.index = 10000 + this.props.length; this.props.push(p); this.rebuildSolid();
    if (pdef.kind === "animal") { p.critter = new Critter(p); this.critters.push(p.critter); }
    return p;
  }

  warpAt(tx, ty) {
    for (const wp of this.warps) {
      const ww = wp.w || 1, wh = wp.h || 1;
      if (tx >= wp.x && ty >= wp.y && tx < wp.x + ww && ty < wp.y + wh) return wp;
    }
    for (const p of this.props) {
      const d = p.doorTile;
      if (d && d[0] === tx && d[1] === ty && p.door) return { to: p.door.to, tx: p.door.tx, ty: p.door.ty, dir: p.door.dir, x: tx, y: ty };
    }
    return null;
  }

  drawGround(ctx, camX, camY, vw, vh) {
    const ts = this.tileset();
    const x0 = Math.max(0, Math.floor(camX / TS)), y0 = Math.max(0, Math.floor(camY / TS));
    const x1 = Math.min(this.w - 1, Math.floor((camX + vw) / TS)), y1 = Math.min(this.h - 1, Math.floor((camY + vh) / TS));
    const now = performance.now();
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      let id = this.ground[y * this.w + x];
      if (id === -2) { const s = this.special.get(y * this.w + x); if (s && s.img) ctx.drawImage(s.img, s.sx, s.sy, TS, TS, x * TS - camX, y * TS - camY, TS, TS); continue; }
      const an = this.anim.get(id);
      if (an) { let t = now % an.total; for (const f of an.frames) { if (t < f[1]) { id = f[0]; break; } t -= f[1]; } }
      ts.draw(ctx, id, x * TS - camX, y * TS - camY);
    }
    this.drawWater(ctx, camX, camY, vw, vh, now);
    this.drawLayer(ctx, this.bank, camX, camY, vw, vh);       // shoreline rim over the animated water
    this.drawLayer(ctx, this.detail, camX, camY, vw, vh);
    this.drawPaint(ctx, camX, camY, vw, vh);
  }

  drawPaint(ctx, camX, camY, vw, vh) {
    if (!this.paint.size) return;
    for (const [k, t] of this.paint) {
      const img = Assets.img[t.sheet === "outdoors" ? "outdoors_" + this.season : t.sheet]; if (!img) continue;
      const [x, y] = k.split(",").map(Number);
      const px = x * TS - camX, py = y * TS - camY;
      if (px < -TS || py < -TS || px > vw || py > vh) continue;
      const cols = Math.floor(img.width / TS);
      ctx.drawImage(img, (t.idx % cols) * TS, Math.floor(t.idx / cols) * TS, TS, TS, px, py, TS, TS);
    }
  }
  // editor helpers
  setPaint(x, y, sheet, idx, solid) { this.paint.set(x + "," + y, { sheet: sheet, idx: idx, solid: !!solid }); this.rebuildSolid(); }
  clearPaint(x, y) { this.paint.delete(x + "," + y); this.rebuildSolid(); }
  setFloorTile(x, y, f) { this.floorTiles.set(x + "," + y, f); this.rebuildGround(); }
  setWallTile(x, y, f) { this.wallTiles.set(x + "," + y, f); this.rebuildGround(); }

  // Stardew-style water: the flat blue tile plus a scrolling, tinted texture from the cursors sheet
  // (10 frames of 64x64 at (0,2064); each tile shows its 16x16 slice of the 4x4-tile pattern).
  drawWater(ctx, camX, camY, vw, vh, now) {
    if (!this.waterCells.length) return;
    const frames = waterFrames(); if (!frames) return;
    const f = Math.floor(now / 140) % 10, flip = Math.floor(now / 1400) % 2;
    const img = frames[f];
    ctx.globalAlpha = 0.55;
    for (let i = 0; i < this.waterCells.length; i += 2) {
      const x = this.waterCells[i], y = this.waterCells[i + 1];
      const px = x * TS - camX, py = y * TS - camY;
      if (px < -TS || py < -TS || px > vw || py > vh) continue;
      const row = ((x + y) % 2 !== 0) !== (flip === 1) ? 64 : 0;
      ctx.drawImage(img, (x % 4) * 16, row + (y % 4) * 16, 16, 16, px, py, 16, 16);
    }
    ctx.globalAlpha = 1;
  }

  drawFront(ctx, camX, camY, vw, vh) { this.drawLayer(ctx, this.front, camX, camY, vw, vh); }

  drawLayer(ctx, layer, camX, camY, vw, vh) {
    if (!layer || !layer.length) return;
    const ts = this.tileset();
    for (const [x, y, id] of layer) {
      const px = x * TS - camX, py = y * TS - camY;
      if (px < -TS || py < -TS || px > vw || py > vh) continue;
      ts.draw(ctx, id, px, py);
    }
  }
}

// tinted water frames: 10 canvases of 64x128 (two pattern rows) from cursors.png, coloured like
// Stardew's default waterColor (120,200,255)
let WATER_FRAMES = null;
function waterFrames() {
  if (WATER_FRAMES) return WATER_FRAMES;
  const cur = Assets.img.cursors; if (!cur) return null;
  WATER_FRAMES = [];
  for (let f = 0; f < 10; f++) {
    const c = document.createElement("canvas"); c.width = 64; c.height = 128;
    const g = c.getContext("2d");
    g.drawImage(cur, f * 64, 2064, 64, 128, 0, 0, 64, 128);
    g.globalCompositeOperation = "multiply"; g.fillStyle = "rgb(120,200,255)"; g.fillRect(0, 0, 64, 128);
    g.globalCompositeOperation = "destination-in"; g.drawImage(cur, f * 64, 2064, 64, 128, 0, 0, 64, 128);
    WATER_FRAMES.push(c);
  }
  return WATER_FRAMES;
}
