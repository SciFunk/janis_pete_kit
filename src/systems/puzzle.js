// Cave puzzle rooms: animals that each follow one rule, pressure plates measured by weight, gates,
// fences only animals can cross, chasms only flyers can cross, sunbeams for cats, hedges for goats.
// Design: docs/puzzle_ideas.md. Room data comes from a map def's `puzzle` block (tools/build_cave.py).
//
// Everything animals do is tile-logical and deterministic; the pixel position only eases toward the
// logical tile. Two clocks: reactive rules (deer flee, bull charge, bee sting, quail trail) fire on
// the *player beat* (the player entering a new tile); seekers (pig, goat, cat, crow, sheep, bees)
// run on their own per-step timers.
import { Assets } from "../engine/assets.js";
import { Input } from "../engine/input.js";
import { TS } from "../world/tileset.js";
import { Items } from "./items.js";
import { drawText } from "../ui/text.js";

export const SPECIES = {
  deer:  { w: 2, drive: "flee",   recall: false, step: 0.10, sheet: "animal_deer_spotteddeer",     fs: 32, settledRow: 4, label: "deer" },
  bison: { w: 5, drive: "flee",   recall: false, step: 0.20, slow: true, sheet: "animal_buffalo_whitebuffalo", fs: 32, settledRow: 4, label: "bison" },
  bull:  { w: 4, drive: "charge", recall: false, step: 0.05, sheet: "animal_buffalo_buffalo",      fs: 32, settledRow: 4, label: "bull" },
  pig:   { w: 3, drive: "seek",   wants: "food", settle: "stand", recall: true, step: 0.26, sheet: "animal_barn_pig_solidpink", fs: 32, settledRow: 4, label: "pig" },
  goat:  { w: 3, drive: "seek",   wants: "veg",  settle: "chew",  eats: true, recall: true, step: 0.22, sheet: "animal_barn_goat_pointedblonde", fs: 32, settledRow: 4, label: "goat" },
  quail: { w: 1, drive: "trail",  wants: "seed", recall: true, step: 0.16, sheet: "animal_mquail_babyquail", fs: 16, label: "quail" },
  cat:   { w: 1, drive: "seek",   wants: "sun",  settle: "sit",   recall: false, step: 0.26, sheet: "animal_cats_ocicat", fs: 32, settledRow: 4, label: "cat" },
  crow:  { w: 1, drive: "carry",  wants: "shiny", recall: true, step: 0.09, fly: true, sheet: "animal_adopt_crow", fs: 32, label: "crow" },
  bees:  { w: 0, drive: "seek",   wants: "flower", settle: "hover", recall: false, step: 0.18, fly: true, sting: true, sheet: "animal_pokemon_weedle_beedrill", fs: 32, label: "bees" },
  sheep: { w: 2, drive: "flock",  recall: true, step: 0.20, sheet: "animal_barn_sheep_solidwhite", fs: 32, settledRow: 4, label: "sheep" },
};
const PLAYER_W = 2;
const DIRS4 = [[0, 1], [1, 0], [0, -1], [-1, 0]];      // down right up left (matches sheet rows)
const FLOWERS = new Set(["tulip", "blue_jazz", "poppy", "sunflower", "fairy_rose"]);
const T_WALL = 87, T_VOID = 120, T_FENCE = 70, T_CHASM = 67;
const MINE_COLS = 16, GATE_TILE = 21, HEDGE_TILE = 24;

// what a dropped item means to the animals; one kind per item so a radish never calls both pig and goat
export function itemKind(id) {
  if (id === "fodder") return "veg";
  if (id === "trinket") return "shiny";
  if (FLOWERS.has(id)) return "flower";
  const d = Items.get(id); if (!d) return null;
  if (d.type === "seed") return "seed";
  if (d.type === "crop") return "food";
  return null;
}

class PuzzleDrop {
  constructor(kind, itemId, tx, ty) { this.kind = kind; this.itemId = itemId; this.tx = tx; this.ty = ty; this.solid = false; }
  get baseY() { return this.ty * TS + 4; }        // drawn under anything standing on it
  update() {}
  draw(ctx, camX, camY) {
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(this.tx * TS + 8 - camX, this.ty * TS + 13 - camY, 5, 2, 0, 0, Math.PI * 2); ctx.fill();
    Items.drawIcon(ctx, this.itemId, this.tx * TS - camX, this.ty * TS - 3 - camY);
  }
}

class PuzzleAnimal {
  constructor(sp, tx, ty, puzzle) {
    this.sp = sp; this.S = SPECIES[sp]; this.P = puzzle;
    this.tx = tx; this.ty = ty; this.hx = tx; this.hy = ty;
    this.px = tx * TS + 8; this.py = ty * TS + 16;
    this.dir = 0; this.frame = 0; this.animT = 0;
    this.state = "idle"; this.timer = 0; this.delay = 1.0; this.chewT = 0; this.skip = false;
    this.slide = null; this.carrying = null; this.followIdx = 0;
    this.solid = !(this.S.drive === "trail" || this.S.fly);
    this.boxW = 12; this.boxH = 8;
  }
  get baseY() { return this.py; }
  get weight() { return this.S.w; }
  box(x, y) { return [x - this.boxW / 2, y - this.boxH, this.boxW, this.boxH]; }
  get arrived() { return Math.abs(this.px - (this.tx * TS + 8)) < 0.5 && Math.abs(this.py - (this.ty * TS + 16)) < 0.5; }
  onTile(x, y) { return this.tx === x && this.ty === y; }
  face(dx, dy) { if (Math.abs(dx) >= Math.abs(dy)) this.dir = dx > 0 ? 1 : dx < 0 ? 3 : this.dir; else this.dir = dy > 0 ? 0 : 2; }
  stepTo(dx, dy) { this.face(dx, dy); this.tx += dx; this.ty += dy; this.timer = this.S.step; }

  update(dt, world) {
    // cosmetic easing toward the logical tile
    const gx = this.tx * TS + 8, gy = this.ty * TS + 16, dx = gx - this.px, dy = gy - this.py, d = Math.hypot(dx, dy);
    if (d > 0) {
      const sp = Math.max(48, TS / Math.max(0.04, this.S.step)) * dt;
      if (d <= sp) { this.px = gx; this.py = gy; } else { this.px += dx / d * sp; this.py += dy / d * sp; }
      this.animT += dt; this.frame = Math.floor(this.animT * 8) % 4;
    } else if (this.state === "chew" || (this.state === "settled" && this.S.settledRow !== undefined)) { this.animT += dt; this.frame = Math.floor(this.animT * 4) % 4; }
    else this.frame = 0;
    const P = this.P;
    if (this.state === "follow") {
      const t = P.trail[this.followIdx + 1] || P.trail[0];
      if (t && !this.onTile(t[0], t[1])) { this.face(t[0] - this.tx, t[1] - this.ty); this.tx = t[0]; this.ty = t[1]; }
      return;
    }
    if (this.slide) {                                    // bull mid-charge: one tile per step once the last one is reached
      if (!this.arrived) return;
      if (this.slide.left > 0) { this.stepTo(this.slide.dx, this.slide.dy); this.slide.left--; return; }
      const hit = this.slide.hit; this.slide = null; this.state = "idle";
      if (hit) P.knockBack("The bull got you!");
      return;
    }
    if (this.delay > 0) { this.delay -= dt; return; }
    if (this.state === "chew") { this.chewT -= dt; if (this.chewT <= 0) { this.state = "idle"; this.timer = this.S.step; } return; }
    if (this.state === "settled") {
      if (this.S.drive === "seek" && !P.targetTest(this)(this.tx, this.ty)) { this.state = "idle"; this.timer = this.S.step; }
      return;
    }
    if (this.timer > 0) { this.timer -= dt; return; }
    if (!this.arrived) return;
    P.decide(this);
  }

  draw(ctx, camX, camY) {
    const img = Assets.img[this.S.sheet]; const fs = this.S.fs;
    const dx = Math.round(this.px - fs / 2 - camX), dy = Math.round(this.py - fs - camY);
    if (!img) { ctx.fillStyle = "#c86"; ctx.fillRect(dx + 4, dy + fs - 12, fs - 8, 12); return; }
    const settled = (this.state === "settled" || this.state === "chew") && this.S.settledRow !== undefined;
    const row = settled ? this.S.settledRow : this.dir;
    const rows = Math.floor(img.height / fs);
    ctx.drawImage(img, this.frame * fs, Math.min(row, rows - 1) * fs, fs, fs, dx, dy, fs, fs);
    if (this.carrying) Items.drawIcon(ctx, this.carrying.itemId, Math.round(this.px - 8 - camX), dy - 10);
    if (this.state === "follow") { ctx.fillStyle = "rgba(255,230,120,0.9)"; ctx.fillRect(Math.round(this.px - 1 - camX), dy - 6, 2, 2); }
  }
}

export const Puzzle = {
  world: null, active: false, map: null, def: null,
  animals: [], drops: [], plates: [], gates: [], beams: [], levers: [], hedges: [], nests: [], doors: [],
  party: [], trail: [], lastTile: null, solved: {}, sandbox: false, entered: 0,

  init(world) {
    this.world = world;
    try { this.solved = JSON.parse(localStorage.getItem("farmgame.puzzle.solved") || "{}"); } catch (e) { this.solved = {}; }
    world.hooks.onMapChange.push((m) => this.enter(m));
    world.hooks.update.push((dt) => this.update(dt));
    world.hooks.draw.push((ctx, map, cx, cy) => { if (this.active) this.drawGround(ctx, cx, cy); });
    world.hooks.drawFront.push((ctx, map, cx, cy) => { if (this.active) this.drawFront(ctx, cx, cy); });
  },
  saveSolved() { try { localStorage.setItem("farmgame.puzzle.solved", JSON.stringify(this.solved)); } catch (e) { /* ignore */ } },

  // ---------------------------------------------------------------- room setup
  enter(map) {
    const def = map.def.puzzle;
    this.active = !!def; this.map = map; this.def = def || null;
    map.extraSolid = map.extraSolid || new Set(); map.extraSolid.clear();
    if (!def) { this.world.entities = []; return; }
    const cp = (l) => (l || []).map((o) => Object.assign({}, o));
    this.plates = cp(def.plates); this.gates = cp(def.gates); this.beams = cp(def.beams); this.levers = cp(def.levers);
    this.hedges = cp(def.hedges); this.nests = cp(def.nests); this.doors = cp(def.doors);
    for (const p of this.plates) p.on = false;
    for (const g of this.gates) { g.open = false; g.recorded = false; }
    this.drops = (def.items || []).map((it) => new PuzzleDrop(it.kind, this.itemFor(it.kind), it.x, it.y));
    this.animals = (def.animals || []).map((a) => new PuzzleAnimal(a.sp, a.x, a.y, this));
    // whoever is following comes along and stands beside the start
    const p = this.world.player, start = def.start || [p.tx, p.ty];
    const spots = this.freeTilesAround(start[0], start[1]);
    this.party.forEach((sp, i) => { const s = spots[i % spots.length] || start; const a = new PuzzleAnimal(sp, s[0], s[1], this); a.state = "follow"; a.followIdx = i; this.animals.push(a); });
    this.trail = [[p.tx, p.ty]]; this.lastTile = [p.tx, p.ty];
    this.entered = performance.now();
    this.refreshSolid(); this.resolvePlates();
    this.world.entities = this.animals.concat(this.drops);
    for (const s of new Set(this.animals.map((a) => a.S.sheet))) if (!Assets.img[s]) this.world.loadSheet(s);
  },
  reset() { if (this.map) this.enter(this.map); },
  itemFor(kind) { return { food: "parsnip", seed: "parsnip_seeds", veg: "fodder", shiny: "trinket", flower: "tulip" }[kind] || "parsnip"; },
  freeTilesAround(x, y) {
    const out = [];
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1], [0, 1]]) if (this.playerFloor(x + dx, y + dy) && !this.animalAt(x + dx, y + dy)) out.push([x + dx, y + dy]);
    return out.length ? out : [[x, y]];
  },
  cap() { return this.def && this.def.hub ? 3 : ((this.def && this.def.prints) || []).length + 1; },

  // ---------------------------------------------------------------- queries
  terr(x, y) { return this.map.inBounds(x, y) ? this.map.t(x, y) : T_VOID; },
  gateAt(x, y) { return this.gates.find((g) => g.x === x && g.y === y) || null; },
  leverAt(x, y) { return this.levers.find((l) => l.x === x && l.y === y) || null; },
  hedgeAt(x, y) { return this.hedges.find((h) => h.x === x && h.y === y) || null; },
  plateAt(x, y) { return this.plates.find((p) => p.x === x && p.y === y) || null; },
  nestAt(x, y) { return this.nests.find((n) => n.x === x && n.y === y) || null; },
  dropAt(x, y) { return this.drops.find((d) => d.tx === x && d.ty === y) || null; },
  animalAt(x, y, except) { return this.animals.find((a) => a !== except && a.state !== "follow" && a.tx === x && a.ty === y) || null; },
  followerAt(x, y) { return this.animals.find((a) => a.state === "follow" && a.tx === x && a.ty === y) || null; },
  playerOn(x, y) { const p = this.world.player; return p.tx === x && p.ty === y; },
  // a plain floor tile the player could stand on (release target, spawn spot)
  playerFloor(x, y) { const t = this.terr(x, y); return t !== T_WALL && t !== T_VOID && t !== T_FENCE && t !== T_CHASM && !this.map.isSolid(x, y); },
  // can this animal stand on (x,y)?
  animalWalk(x, y, a) {
    const t = this.terr(x, y);
    if (t === T_WALL || t === T_VOID) return false;
    if (t === T_CHASM && !a.S.fly) return false;
    if (t !== T_FENCE && t !== T_CHASM && this.map.isSolid(x, y)) return false;      // props, closed gates, levers
    const h = this.hedgeAt(x, y); if (h && !a.S.eats) return false;
    if (this.animalAt(x, y, a)) return false;
    if (this.playerOn(x, y)) return false;
    return true;
  },
  // breadth-first search from the animal to the nearest tile passing `test`; returns the first step
  seek(a, test) {
    const W = this.map.w, H = this.map.h, key = (x, y) => y * W + x;
    const seen = new Uint8Array(W * H), q = [[a.tx, a.ty, null]]; seen[key(a.tx, a.ty)] = 1;
    let qi = 0;
    while (qi < q.length) {
      const [x, y, first] = q[qi++];
      for (const [dx, dy] of DIRS4) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[key(nx, ny)]) continue;
        seen[key(nx, ny)] = 1;
        if (!this.animalWalk(nx, ny, a)) continue;
        const f = first || [dx, dy];
        if (test(nx, ny)) return { step: f, dist: 1 };
        q.push([nx, ny, f]);
      }
    }
    return null;
  },
  targetTest(a) {
    const S = a.S;
    if (S.drive === "seek") {
      if (S.wants === "sun") return (x, y) => this.beams.some((b) => b.lit && b.x === x && b.y === y);
      if (S.wants === "veg") return (x, y) => !!this.hedgeAt(x, y) || !!this.drops.find((d) => d.kind === "veg" && d.tx === x && d.ty === y);
      return (x, y) => !!this.drops.find((d) => d.kind === S.wants && d.tx === x && d.ty === y);
    }
    if (S.drive === "flock") return (x, y) => this.animals.some((o) => o !== a && o.sp === "sheep" && o.state !== "follow" && Math.abs(o.tx - x) + Math.abs(o.ty - y) === 1);
    if (S.drive === "carry") return a.carrying ? (x, y) => !!this.nestAt(x, y) : (x, y) => !!this.drops.find((d) => d.kind === "shiny" && d.tx === x && d.ty === y);
    return () => false;
  },

  // ---------------------------------------------------------------- animal decisions (per-step clock)
  decide(a) {
    const S = a.S;
    if (S.drive === "seek" || S.drive === "flock" || S.drive === "carry") {
      const test = this.targetTest(a);
      if (test(a.tx, a.ty)) {
        if (S.drive === "carry" && !a.carrying) { const d = this.dropAt(a.tx, a.ty); a.carrying = d; this.removeDrop(d); a.timer = S.step * 2; return; }
        if (S.settle === "chew") {
          const h = this.hedgeAt(a.tx, a.ty); const d = this.drops.find((dd) => dd.kind === "veg" && dd.tx === a.tx && dd.ty === a.ty);
          a.chewT = h ? h.chew : 20;
          if (h) this.hedges.splice(this.hedges.indexOf(h), 1); if (d) this.removeDrop(d);
          a.state = "chew"; return;
        }
        a.state = "settled"; return;
      }
      const hit = this.seek(a, test);
      if (hit) { a.stepTo(hit.step[0], hit.step[1]); return; }
      if (S.drive === "carry" && a.carrying) { a.timer = S.step * 3; return; }    // nest unreachable: wait
      if (S.drive === "flock") { a.timer = S.step * 2; return; }                   // no flock to join: a sheep waits where it is
      this.wander(a); return;
    }
    // flee / charge / trail species stand still between beats
    a.timer = S.step;
  },
  wander(a) {
    const opts = [];
    for (const [dx, dy] of DIRS4) {
      const nx = a.tx + dx, ny = a.ty + dy;
      if (Math.abs(nx - a.hx) > 2 || Math.abs(ny - a.hy) > 2) continue;
      if (this.terr(nx, ny) === T_FENCE || this.terr(nx, ny) === T_CHASM) continue;   // idle wandering keeps off fences and out of pits
      if (this.plateAt(nx, ny)) continue;                                            // and never presses a plate by accident
      if (this.animalWalk(nx, ny, a)) opts.push([dx, dy]);
    }
    if (opts.length && Math.random() < 0.6) { const o = opts[Math.floor(Math.random() * opts.length)]; a.stepTo(o[0], o[1]); a.timer = a.S.step * 2; }
    else a.timer = a.S.step * 3 + Math.random();
  },

  // ---------------------------------------------------------------- the player beat (reactive rules)
  onBeat(ptx, pty) {
    for (const a of this.animals) {
      if (a.state === "follow") continue;            // (the spawn delay only holds back seekers; a deer or bull reacts at once)
      const S = a.S, adj = Math.abs(a.tx - ptx) + Math.abs(a.ty - pty) === 1;
      if (S.drive === "flee") {
        if (!adj) continue;
        if (S.slow && (a.skip = !a.skip)) continue;
        this.flee(a, ptx, pty);
      } else if (S.drive === "charge") {
        if (a.slide || (a.tx !== ptx && a.ty !== pty)) continue;
        this.charge(a, ptx, pty);
      } else if (S.drive === "trail" && a.state !== "settled") {
        const t = this.trail[1]; if (!t || (t[0] === a.tx && t[1] === a.ty) || this.playerOn(t[0], t[1])) continue;
        if (!this.animalWalk(t[0], t[1], a)) continue;
        a.face(t[0] - a.tx, t[1] - a.ty); a.tx = t[0]; a.ty = t[1];
        if (this.drops.find((d) => d.kind === "seed" && d.tx === a.tx && d.ty === a.ty)) a.state = "settled";
      } else if (S.sting && adj) {
        this.knockBack("Stung by the bees!"); return;
      }
    }
  },
  flee(a, ptx, pty) {
    const away = [Math.sign(a.tx - ptx), Math.sign(a.ty - pty)];
    const can = (d) => this.animalWalk(a.tx + d[0], a.ty + d[1], a);
    if (can(away)) { a.stepTo(away[0], away[1]); return; }
    const cw = [-away[1], away[0]], ccw = [away[1], -away[0]];
    const gain = (d) => Math.abs(a.tx + d[0] - ptx) + Math.abs(a.ty + d[1] - pty);
    let order = [cw, ccw];
    if (gain(ccw) > gain(cw)) order = [ccw, cw];                        // prefer the side that gains distance; tie -> clockwise
    for (const d of order) if (can(d)) { a.stepTo(d[0], d[1]); return; }
    // boxed in: stays put
  },
  charge(a, ptx, pty) {
    const dx = Math.sign(ptx - a.tx), dy = Math.sign(pty - a.ty);
    let n = 0, hit = false, x = a.tx, y = a.ty;
    for (;;) {
      const nx = x + dx, ny = y + dy;
      if (this.playerOn(nx, ny)) { hit = true; break; }
      if (!this.animalWalk(nx, ny, a)) break;
      x = nx; y = ny; n++;
      if (n > 64) break;
    }
    a.face(dx, dy);
    if (n === 0 && !hit) return;
    a.state = "charge"; a.slide = { dx: dx, dy: dy, left: n, hit: hit };
  },
  knockBack(msg) {
    const w = this.world; w.toast(msg); w.sfx("hit");
    const s = this.def.start; w.player.x = s[0] * TS + 8; w.player.y = s[1] * TS + 16; w.player.dir = 2;
    this.reset();
  },

  // ---------------------------------------------------------------- plates & gates
  resolvePlates() {
    const p = this.world.player;
    for (const pl of this.plates) {
      let w = 0; pl.occupants = [];
      for (const a of this.animals) if (a.tx === pl.x && a.ty === pl.y) { w += a.weight; pl.occupants.push(a.sp); }
      if (p.tx === pl.x && p.ty === pl.y) w += PLAYER_W;
      pl.w = w; pl.on = w >= pl.need;
    }
    let changed = false;
    for (const g of this.gates) {
      const all = g.plates.every((id) => { const pl = this.plates.find((q) => q.id === id); return pl && pl.on; });
      const open = g.latch ? (g.open || all) : all;
      if (open !== g.open) { changed = true; g.open = open; if (!open) g.recorded = false; if (open) this.world.sfx("door"); }
      if (open && !g.recorded) {
        const who = []; for (const id of g.plates) { const pl = this.plates.find((q) => q.id === id); if (pl) who.push.apply(who, pl.occupants); }
        if (who.length) { g.recorded = true; this.solved[this.map.id] = [...new Set(who)]; this.saveSolved(); }
      }
    }
    if (changed) this.refreshSolid();
  },
  refreshSolid() {
    const s = this.map.extraSolid; s.clear();
    for (const g of this.gates) if (!g.open) s.add(g.x + "," + g.y);
    for (const l of this.levers) s.add(l.x + "," + l.y);
  },

  // ---------------------------------------------------------------- per-frame
  update(dt) {
    if (!this.active || this.world.inputLocked()) return;
    const p = this.world.player;
    if (p.tx !== this.lastTile[0] || p.ty !== this.lastTile[1]) {
      this.lastTile = [p.tx, p.ty]; this.trail.unshift([p.tx, p.ty]); if (this.trail.length > 12) this.trail.pop();
      this.onBeat(p.tx, p.ty);
    }
    this.resolvePlates();
    // walking through an open gate leads on
    const g = this.gateAt(p.tx, p.ty);
    if (g && g.open && g.next && !this.world.transitioning && performance.now() - this.entered > 500) {
      if (g.final) this.world.toast("You solved the whole cave!");
      const dest = this.world.defs[g.next];
      const st = dest && dest.puzzle && dest.puzzle.start ? dest.puzzle.start : [10, 6];
      this.world.goto(g.next, st[0], st[1], 2);
    }
    if (Input.justPressed("KeyR") && !this.world.inputLocked()) { this.reset(); const s = this.def.start; p.x = s[0] * TS + 8; p.y = s[1] * TS + 16; this.world.toast("Room reset"); }
  },

  // ---------------------------------------------------------------- player verbs (called from Actions)
  // returns true when handled
  interact(tx, ty) {
    if (!this.active) return false;
    const w = this.world, p = w.player;
    const f = this.followerAt(tx, ty); if (f) { w.toast("The " + f.S.label + " is following you"); return true; }
    const a = this.animalAt(tx, ty);
    const under = this.dropAt(tx, ty);
    if (a && under && a.state === "settled") {          // a pig standing in its dinner: take the dinner, the pig wanders off
      if (p.inventory.canAdd(under.itemId, 1)) { p.inventory.add(under.itemId, 1); this.removeDrop(under); w.toast(Items.name(under.itemId), under.itemId); w.sfx("pickup"); }
      return true;
    }
    if (a) {
      if (this.party.length >= this.cap()) { w.toast("Too many animals following (" + this.cap() + " max here)"); return true; }
      const take = () => { a.state = "follow"; a.followIdx = this.party.length; a.slide = null; this.party.push(a.sp); w.toast("The " + a.S.label + " follows you"); this.resolvePlates(); };
      if (!a.S.recall) w.ask("The " + a.S.label + " won't come when called once it's loose. Take it anyway?", ["Take it", "Leave it"], (i) => { if (i === 0) take(); });
      else take();
      return true;
    }
    const lv = this.leverAt(tx, ty);
    if (lv) {
      for (const id of lv.beams) { const b = this.beams.find((q) => q.id === id); if (b) b.lit = !b.lit; }
      lv.on = !lv.on; w.sfx("hit"); w.toast(this.beams.some((b) => b.lit) ? "Light pours in" : "The shutter closes");
      for (const an of this.animals) if (an.state === "settled" && an.S.wants === "sun" && !this.targetTest(an)(an.tx, an.ty)) { an.state = "idle"; an.timer = an.S.step; }
      return true;
    }
    const d = this.dropAt(tx, ty);
    if (d) {
      if (p.inventory.canAdd(d.itemId, 1)) { p.inventory.add(d.itemId, 1); this.removeDrop(d); w.toast(Items.name(d.itemId), d.itemId); w.sfx("pickup"); }
      return true;
    }
    if (this.party.length && this.playerFloor(tx, ty) && !this.animalAt(tx, ty)) {
      const sp = this.party.shift();
      const fol = this.animals.find((an) => an.state === "follow" && an.sp === sp);
      if (fol) {
        fol.state = "idle"; fol.tx = tx; fol.ty = ty; fol.hx = tx; fol.hy = ty; fol.timer = fol.S.step; fol.delay = 0;
        this.animals.forEach((an) => { if (an.state === "follow") an.followIdx = this.party.indexOf(an.sp); });
        w.toast("Released the " + fol.S.label);
        this.onBeat(p.tx, p.ty);          // a released deer flinches away at once
      }
      return true;
    }
    return false;
  },
  // drop / throw the selected item onto the facing tile (over a fence or a one-tile chasm)
  useItem(id, tx, ty) {
    if (!this.active) return false;
    const kind = itemKind(id); if (!kind) return false;
    const w = this.world, p = w.player;
    const dx = Math.sign(tx - p.tx), dy = Math.sign(ty - p.ty);
    let t = this.terr(tx, ty), lx = tx, ly = ty;
    if (t === T_FENCE || t === T_CHASM) {
      lx += dx; ly += dy; let t2 = this.terr(lx, ly), hops = 1;
      while (t === T_FENCE && t2 === T_FENCE && hops < 3) { lx += dx; ly += dy; t2 = this.terr(lx, ly); hops++; }   // over a pen's corner: keep going
      if (t2 === T_CHASM || t2 === T_FENCE || t2 === T_WALL || t2 === T_VOID) {
        if (t === T_CHASM || t2 === T_CHASM) { p.inventory.remove(id, 1); w.toast("It fell into the dark."); return true; }
        w.toast("Can't throw that far"); return true;
      }
    }
    if (!this.playerFloor(lx, ly) && !this.animalAt(lx, ly)) { if (this.terr(lx, ly) === T_WALL || this.terr(lx, ly) === T_VOID) return false; w.toast("Can't drop it there"); return true; }
    if (this.dropAt(lx, ly)) { w.toast("Something's already there"); return true; }
    p.inventory.remove(id, 1);
    this.drops.push(new PuzzleDrop(kind, id, lx, ly)); this.world.entities = this.animals.concat(this.drops);
    w.sfx("plant");
    return true;
  },
  removeDrop(d) { const i = this.drops.indexOf(d); if (i >= 0) this.drops.splice(i, 1); this.world.entities = this.animals.concat(this.drops); },

  // ---------------------------------------------------------------- drawing
  drawGround(ctx, cx, cy) {
    const mine = Assets.img.mine;
    const tile = (idx, x, y) => { if (mine) ctx.drawImage(mine, (idx % MINE_COLS) * TS, Math.floor(idx / MINE_COLS) * TS, TS, TS, x * TS - cx, y * TS - cy, TS, TS); };
    // chasm rims: a dark ledge where floor meets the pit
    const m = this.map;
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      if (m.t(x, y) !== T_CHASM) continue;
      const px = x * TS - cx, py = y * TS - cy;
      ctx.fillStyle = "#07050a"; ctx.fillRect(px, py, TS, TS);
      ctx.fillStyle = "rgba(90,60,30,0.9)";
      if (m.t(x, y - 1) !== T_CHASM) ctx.fillRect(px, py, TS, 3);
      if (m.t(x - 1, y) !== T_CHASM) ctx.fillRect(px, py, 2, TS);
      if (m.t(x + 1, y) !== T_CHASM) ctx.fillRect(px + TS - 2, py, 2, TS);
    }
    // doorway prints: who solved this room last
    const solved = this.solved[m.id];
    if (solved && solved.length && this.def.start) {
      const spots = this.freeTilesAround(this.def.start[0], this.def.start[1]);
      solved.forEach((sp, i) => { const s = spots[i % spots.length]; this.drawPrint(ctx, sp, s[0] * TS - cx, s[1] * TS - cy); });
    }
    for (const pl of this.plates) {
      const px = pl.x * TS - cx, py = pl.y * TS - cy;
      ctx.fillStyle = "#4a4239"; ctx.fillRect(px + 2, py + 2, 12, 12);
      ctx.fillStyle = pl.on ? "#6f8a5a" : "#8c8577"; ctx.fillRect(px + 3, py + 3, 10, pl.on ? 10 : 9);
      ctx.fillStyle = pl.on ? "#3e5a2f" : "#5a5348";
      for (let k = 0; k < pl.need; k++) ctx.fillRect(px + 4 + (k % 3) * 3, py + 5 + Math.floor(k / 3) * 3, 2, 2);   // dots = weight needed
    }
    for (const n of this.nests) { const px = n.x * TS - cx, py = n.y * TS - cy; ctx.strokeStyle = "#8a5a2b"; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(px + 8, py + 9, 6, 4, 0, 0, Math.PI * 2); ctx.stroke(); ctx.strokeStyle = "#c9955a"; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(px + 8, py + 8, 4, 2.5, 0, 0, Math.PI * 2); ctx.stroke(); }
    for (const b of this.beams) {
      const px = b.x * TS - cx, py = b.y * TS - cy;
      if (b.lit) { ctx.fillStyle = "rgba(255,236,150,0.45)"; ctx.beginPath(); ctx.ellipse(px + 8, py + 9, 8, 5, 0, 0, Math.PI * 2); ctx.fill(); }
      else { ctx.strokeStyle = "rgba(255,236,150,0.25)"; ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.ellipse(px + 8, py + 9, 7, 4, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    }
    for (const h of this.hedges) tile(HEDGE_TILE, h.x, h.y);
    for (const g of this.gates) {
      if (!g.open) tile(GATE_TILE, g.x, g.y);
      else { ctx.strokeStyle = "rgba(255,220,120,0.5)"; ctx.strokeRect(g.x * TS - cx + 1.5, g.y * TS - cy + 1.5, 13, 13); }
    }
    for (const l of this.levers) {
      const px = l.x * TS - cx, py = l.y * TS - cy;
      ctx.fillStyle = "#5a5348"; ctx.fillRect(px + 3, py + 9, 10, 5);
      ctx.strokeStyle = "#c9b48a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px + 8, py + 11); ctx.lineTo(px + (l.on ? 12 : 4), py + 3); ctx.stroke(); ctx.lineWidth = 1;
      ctx.fillStyle = l.on ? "#9fd88a" : "#d9432e"; ctx.fillRect(px + (l.on ? 11 : 3), py + 2, 3, 3);
    }
  },
  drawFront(ctx, cx, cy) {
    for (const b of this.beams) {
      if (!b.lit) continue;
      const px = b.x * TS - cx, py = b.y * TS - cy;
      const g = ctx.createLinearGradient(0, py - 40, 0, py + 12);
      g.addColorStop(0, "rgba(255,240,170,0)"); g.addColorStop(1, "rgba(255,240,170,0.35)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(px + 2, py - 40); ctx.lineTo(px + 14, py - 40); ctx.lineTo(px + 17, py + 12); ctx.lineTo(px - 1, py + 12); ctx.closePath(); ctx.fill();
    }
  },
  // HUD bits (screen canvas): hub door labels and the party line
  drawUI() {
    if (!this.active) return;
    const cx = this.world.cam.x, cy = this.world.cam.y;
    for (const d of this.doors) {
      const dest = this.world.defs[d.to];
      drawText(d.label, d.x * TS + 8 - cx, d.y * TS - 12 - cy, { size: 7, bold: true, align: "center", color: "#ffd86b" });
      if (dest) drawText(dest.name, d.x * TS + 8 - cx, d.y * TS + (d.y < this.map.h / 2 ? 18 : -22) - cy, { size: 5, align: "center", color: "#e8dcc8" });
    }
    const name = this.map.name + (this.party.length ? "   following: " + this.party.join(", ") : "");
    drawText(name, 6, 6, { size: 6.5, color: "#f4e4c1" });
    drawText("Space: follow / release / pick up / pull lever   C: drop the selected item (throws over a fence)   R: reset room", 6, 16, { size: 5, color: "#c9b48a" });
  },
  drawPrint(ctx, sp, px, py) {
    const S = SPECIES[sp]; if (!S) return;
    ctx.fillStyle = "rgba(40,25,10," + (0.25 + S.w * 0.12).toFixed(2) + ")";
    const dot = (x, y, w, h) => ctx.fillRect(px + x, py + y, w, h);
    if (sp === "bees") { ctx.fillStyle = "rgba(230,200,60,0.5)"; dot(4, 6, 3, 2); dot(9, 9, 3, 2); dot(6, 11, 2, 2); }
    else if (sp === "quail") { dot(3, 4, 1, 2); dot(5, 3, 1, 2); dot(7, 4, 1, 2); dot(8, 9, 1, 2); dot(10, 8, 1, 2); dot(12, 9, 1, 2); }
    else if (sp === "cat") { dot(4, 4, 2, 2); dot(7, 3, 2, 2); dot(5, 7, 3, 3); dot(10, 9, 2, 2); dot(13, 8, 2, 2); }
    else if (sp === "crow") { dot(3, 5, 6, 1); dot(4, 8, 5, 1); dot(10, 4, 1, 6); dot(9, 9, 4, 1); }
    else if (sp === "deer") { dot(4, 3, 2, 3); dot(7, 3, 2, 3); dot(9, 9, 2, 3); dot(12, 9, 2, 3); }
    else if (sp === "sheep") { dot(3, 4, 2, 3); dot(6, 4, 2, 3); dot(3, 9, 2, 3); dot(6, 9, 2, 3); dot(10, 6, 2, 3); dot(13, 6, 2, 3); }
    else if (sp === "pig") { dot(4, 4, 3, 3); dot(8, 4, 3, 3); dot(6, 10, 3, 3); dot(10, 10, 3, 3); }
    else if (sp === "goat") { dot(3, 3, 3, 4); dot(7, 3, 3, 4); dot(3, 9, 3, 4); dot(7, 9, 3, 4); dot(12, 7, 2, 2); }
    else if (sp === "bull") { dot(3, 2, 4, 5); dot(8, 2, 4, 5); dot(3, 9, 4, 5); dot(8, 9, 4, 5); }
    else if (sp === "bison") { dot(1, 1, 6, 6); dot(9, 1, 6, 6); dot(1, 9, 6, 6); dot(9, 9, 6, 6); }
  },
};
