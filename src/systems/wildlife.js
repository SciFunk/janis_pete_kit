// Wild animals: small creatures that turn up now and then on outdoor maps, wander, run from the
// player, and leave again. Bats over water in the evening. Species, where they live and when they
// show are in data/wildlife.json (Assets.data.wildlife); each names a prop of kind "animal" whose
// sheet layout (Critter.anim) it borrows. Nothing here is saved.
import { Assets } from "../engine/assets.js";
import { Screen } from "../engine/screen.js";
import { Clock } from "./time.js";
import { Critter } from "../entities/critter.js";
import { TS } from "../world/tileset.js";

const WATER = 119;

class WildCritter extends Critter {
  constructor(prop, sp) {
    super(prop);
    this.wild = true; this.sp = sp; this.life = sp.life || 45 + Math.random() * 45;
    this.water = sp.where === "water"; this.fly = !!sp.fly; this.fleeT = 0; this.t = Math.random() * 10;
    if (sp.speed) this.speed = sp.speed;
    this.name = sp.name || null;
  }
  blocked(world, b) {
    if (this.fly) return false;
    if (this.water) { const m = world.map, tx = Math.floor((b[0] + b[2] / 2) / TS), ty = Math.floor((b[1] + b[3]) / TS); return !m.inBounds(tx, ty) || m.t(tx, ty) !== WATER; }
    return world.map.rectBlocked(b[0], b[1], b[2], b[3]);
  }
  update(dt, world) {
    this.life -= dt; this.t += dt;
    if (this.fly) {                                    // bats: loop over the water they came from
      const a = this.t * 1.6, r = 36 + 12 * Math.sin(this.t * 0.5);
      this.x = this.hx + Math.cos(a) * r + Math.sin(this.t * 0.9) * 10; this.y = this.hy - 22 + Math.sin(a * 1.4) * 12;
      this.animT += dt; this.frame = Math.floor(this.animT * 10) % this.frames; this.flip = Math.sin(a) > 0;
      return;
    }
    const p = world.player, dx = this.x - p.x, dy = this.y - p.y, d = Math.hypot(dx, dy) || 1;
    if (this.sp.flee !== false && d < 60 && this.fleeT <= 0) {           // someone's coming: run the other way
      this.state = "walk"; this.stateT = 1.4; this.fleeT = 1.4;
      this.tx_ = this.x + dx / d * 90; this.ty_ = this.y + dy / d * 90;
    }
    this.fleeT -= dt;
    this.stateT -= dt;
    const speed = this.speed * (this.fleeT > 0 ? 2.4 : 1);
    if (this.state === "walk") {
      const ex = this.tx_ - this.x, ey = this.ty_ - this.y, e = Math.hypot(ex, ey);
      if (e < 2 || this.stateT <= 0) { this.state = "idle"; this.stateT = 1 + Math.random() * 4; this.frame = 0; return; }
      const sp = speed * dt, mx = ex / e * sp, my = ey / e * sp;
      if (Math.abs(ex) > Math.abs(ey)) { this.dir = ex > 0 ? 1 : 3; this.flip = ex < 0; } else this.dir = ey > 0 ? 0 : 2;
      const b = this.box(this.x + mx, this.y + my);
      if (!this.blocked(world, b)) { this.x += mx; this.y += my; this.animT += dt; this.frame = Math.floor(this.animT * 6) % this.frames; }
      else { this.state = "idle"; this.stateT = 0.5 + Math.random(); }
    } else {
      if (this.mode === "strip") { this.animT += dt; this.frame = Math.floor(this.animT * 5) % this.frames; }
      if (this.stateT <= 0) {
        this.state = "walk"; this.stateT = 3;
        const r = this.water ? 40 : 64;
        this.tx_ = this.hx + (Math.random() - 0.5) * 2 * r; this.ty_ = this.hy + (Math.random() - 0.5) * 2 * r * 0.7;
      }
    }
    if (this.state === "idle" && this.fleeT <= 0 && Math.random() < dt * 0.15) { this.hx = this.x; this.hy = this.y; }   // drifts: home follows it
  }
}

export const Wildlife = {
  world: null, timer: 6, list: [], loading: new Set(),
  init(world) {
    this.world = world;
    world.hooks.update.push((dt) => this.update(dt));
    world.hooks.onMapChange.push(() => { this.list = []; this.timer = 3 + Math.random() * 8; });
  },
  cfg() { return Assets.data.wildlife || { species: [] }; },
  batsTime() { const h = Clock.hour; return h >= 18 || h < 4; },
  nearFarmExit() {
    const w = this.world; if (w.map.id !== "farm") return null;
    const wp = (w.map.warps || []).find((q) => q.to === "town"); if (!wp) return null;
    return Math.abs(w.player.tx - wp.x) <= 10 && Math.abs(w.player.ty - wp.y) <= 8 ? wp : null;
  },

  update(dt) {
    const w = this.world, m = w.map;
    if (!m || m.indoor || w.sandbox || window.KIT) return;
    for (const c of [...this.list]) {
      const far = Math.hypot(c.x - w.player.x, c.y - w.player.y) > 240;
      if ((c.life <= 0 && far) || (c.fly && !this.batsTime())) this.remove(c);
    }
    this.timer -= dt; if (this.timer > 0) return;
    const exit = this.nearFarmExit();
    this.timer = exit ? 5 + Math.random() * 6 : 22 + Math.random() * 22;
    if (this.batsTime()) this.spawnBats();
    if (this.list.filter((c) => !c.fly).length >= 3) return;
    if (Math.random() > (exit ? 0.7 : 0.45)) return;
    this.spawnOne(exit);
  },

  eligible() {
    const s = Clock.seasonName, h = Clock.hour, m = this.world.map, water = !!(m.waterCells && m.waterCells.length);
    const timeOk = (sp) => !sp.when || (sp.when === "day" ? h >= 6 && h < 18 : h >= 17 || h < 6);
    return this.cfg().species.filter((sp) => !sp.fly && (!sp.seasons || sp.seasons.indexOf(s) >= 0) && timeOk(sp) && (!sp.maps || sp.maps.indexOf(m.id) >= 0) && ((sp.where !== "water" && sp.where !== "shore") || water) && Assets.data.props[sp.prop]);
  },
  pick(list) {
    const tot = list.reduce((a, s) => a + (s.weight || 1), 0); let r = Math.random() * tot;
    for (const s of list) { r -= (s.weight || 1); if (r <= 0) return s; }
    return list[list.length - 1];
  },
  spawnOne(exit) {
    const list = this.eligible(); if (!list.length) return null;
    const sp = this.pick(list), spot = this.spot(sp, exit);
    return spot ? this.spawn(sp, spot[0], spot[1]) : null;
  },
  // a tile for it to appear on: off screen near the player, or between the player and the farm's town exit
  spot(sp, exit) {
    const w = this.world, m = w.map, p = w.player;
    const shore = (tx, ty) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => m.inBounds(tx + a, ty + b) && m.t(tx + a, ty + b) === WATER);
    for (let i = 0; i < 60; i++) {
      let tx, ty;
      if (exit) { const side = exit.x < m.w / 2 ? 1 : -1; tx = exit.x + side * (1 + Math.floor(Math.random() * 5)); ty = exit.y + Math.floor(Math.random() * 9) - 4; }
      else { tx = p.tx + Math.floor((Math.random() - 0.5) * 34); ty = p.ty + Math.floor((Math.random() - 0.5) * 24); }
      if (!m.inBounds(tx, ty)) continue;
      const t = m.t(tx, ty);
      if (sp.where === "water") { if (t !== WATER) continue; }
      else {
        if (t === WATER || m.isSolid(tx, ty)) continue;
        if (sp.where === "shore" && !shore(tx, ty)) continue;
      }
      const sx = tx * TS - w.cam.x, sy = ty * TS - w.cam.y;
      if (!exit && sx > -24 && sx < Screen.vw + 24 && sy > -24 && sy < Screen.vh + 24) continue;   // appears out of view
      if (Math.hypot(tx - p.tx, ty - p.ty) < 5) continue;
      return [tx, ty];
    }
    return null;
  },
  async spawn(sp, tx, ty) {
    const w = this.world, def = Assets.data.props[sp.prop]; if (!def) return null;
    const mapId = w.map.id;
    if (!Assets.img[def.sheet]) {
      if (this.loading.has(def.sheet)) return null;
      this.loading.add(def.sheet); await w.loadSheet(def.sheet); this.loading.delete(def.sheet);
      if (w.map.id !== mapId) return null;
    }
    const c = new WildCritter({ def: def, sheet: def.sheet, x: tx, y: ty }, sp);
    this.list.push(c); w.map.critters.push(c);
    return c;
  },
  async spawnBats() {
    const w = this.world, m = w.map;
    if (this.list.some((c) => c.fly) || this.batsPending) return;
    this.batsPending = true;
    const cells = m.waterCells; if (!cells || cells.length < 16) { this.batsPending = false; return; }
    const bats = this.cfg().species.filter((s) => s.fly && Assets.data.props[s.prop]); if (!bats.length) { this.batsPending = false; return; }
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) { const k = Math.floor(Math.random() * (cells.length / 2)) * 2; await this.spawn(this.pick(bats), cells[k], cells[k + 1]); }   // one at a time so a shared sheet loads once
    this.batsPending = false;
  },
  remove(c) {
    const i = this.list.indexOf(c); if (i >= 0) this.list.splice(i, 1);
    const j = this.world.map.critters.indexOf(c); if (j >= 0) this.world.map.critters.splice(j, 1);
  },
};
