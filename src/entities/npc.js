// NPC: a scheduled character with dialogue and friendship. All NPCs exist all the time (World.allNpcs);
// only those on the current map are drawn/moved. Off-map NPCs jump to their schedule targets.
import { Character, DOWN, DIRS } from "./character.js";
import { Assets } from "../engine/assets.js";
import { findPath } from "../world/pathfind.js";
import { TS } from "../world/tileset.js";
import { Clock } from "../systems/time.js";
import { Weather } from "../systems/weather.js";
import { Friendship } from "../systems/friendship.js";
import { Talk } from "../systems/talk.js";

export class NPC extends Character {
  // "outfits": "<name>" in npcs.json -> a random seasonal sheet from data/outfits_catalog.json each day
  pickOutfit() {
    const cat = Assets.data.outfits, set = this.def.outfits && cat && cat[this.def.outfits];
    if (!set) return;
    const pool = set[Clock.seasonName] || set.other || set.any || [];
    if (!pool.length) return;
    const key = pool[(Clock.dayIndex() * 7 + pool.length) % pool.length];
    this.sheet = key;
    if (!Assets.img[key]) Assets.image(key, "assets/characters/" + key + ".png").catch(() => { this.sheet = this.def.sheet; });
  }

  constructor(id, def) {
    super({ name: def.name, sheet: def.sheet, x: 0, y: 0, speed: 46 });
    this.id = id; this.def = def;
    this.frameSize = def.frame || null;        // e.g. [32, 32] for a sheet from the animal packs
    this.map = def.home.map;
    this.x = def.home.x * TS + 8; this.y = def.home.y * TS + 16;
    this.dir = def.home.dir || DOWN;
    this.path = null; this.target = null; this.waitT = 0;
    this.blockedT = 0;
    this.lastScheduleKey = null;
    this.pickOutfit();
    this.wander = def.wander || 0;   // tiles of idle wandering around the target
    this.wanderT = 2 + Math.random() * 4;
  }

  get tx() { return Math.floor(this.x / TS); }
  get ty() { return Math.floor((this.y - 1) / TS); }

  // --- schedule ---
  schedule() {
    const s = this.def.schedule || {};
    if (Weather.raining && s.rain) return s.rain;
    if (s[Clock.seasonName]) return s[Clock.seasonName];
    return s.default || [];
  }
  // the entry in force at the current time (last one whose time <= now)
  currentEntry() {
    const list = this.schedule(); let cur = null;
    for (const e of list) if (e[0] <= Clock.minutes) cur = e;
    return cur;
  }

  // Called every frame for every NPC (even off-map).
  simulate(dt, world) {
    const e = this.currentEntry();
    if (!e) return;
    const key = Clock.dayIndex() + ":" + e[0];
    if (key !== this.lastScheduleKey) {
      this.lastScheduleKey = key;
      this.target = { map: e[1], x: e[2], y: e[3], dir: e[4] };
      if (this.map !== e[1]) {          // cross-map: teleport (no cross-map pathing yet)
        this.map = e[1]; this.x = e[2] * TS + 8; this.y = e[3] * TS + 16; this.dir = e[4] === undefined ? DOWN : e[4];
        this.path = null; this.arrived = true;
        return;
      }
      this.path = null; this.arrived = false;
    }
    if (this.map !== world.map.id) {
      // off-screen: just be at the target
      if (this.target && !this.arrived) { this.x = this.target.x * TS + 8; this.y = this.target.y * TS + 16; this.arrived = true; if (this.target.dir !== undefined) this.dir = this.target.dir; }
    }
  }

  // on-map update
  update(dt, world) {
    this.moving = false;
    if (this.talking) { this.animate(dt); return; }
    const t = this.target;
    if (t && !this.arrived) {
      if (!this.path) {
        this.path = findPath(world.map, this.tx, this.ty, t.x, t.y, null, 8000);
        if (!this.path) { this.x = t.x * TS + 8; this.y = t.y * TS + 16; this.arrived = true; }
      }
      if (this.path) this.followPath(dt, world, () => { this.arrived = true; if (t.dir !== undefined) this.dir = t.dir; });
    } else if (this.wander > 0 && t) {
      this.wanderT -= dt;
      if (this.path) this.followPath(dt, world, () => { this.path = null; });
      else if (this.wanderT <= 0) {
        this.wanderT = 3 + Math.random() * 6;
        const gx = t.x + Math.floor(Math.random() * (2 * this.wander + 1)) - this.wander;
        const gy = t.y + Math.floor(Math.random() * (2 * this.wander + 1)) - this.wander;
        if (world.map.inBounds(gx, gy) && !world.map.isSolid(gx, gy)) this.path = findPath(world.map, this.tx, this.ty, gx, gy, null, 800);
      }
    }
    this.animate(dt);
  }

  followPath(dt, world, done) {
    if (!this.path.length) { this.path = null; done(); return; }
    const [nx, ny] = this.path[0];
    const px = nx * TS + 8, py = ny * TS + 16;
    const dx = px - this.x, dy = py - this.y, d = Math.hypot(dx, dy);
    const step = this.speed * dt;
    if (d <= step) { this.x = px; this.y = py; this.path.shift(); this.moving = true; if (!this.path.length) { this.path = null; done(); } return; }
    const mx = dx / d * step, my = dy / d * step;
    this.setDirFromDelta(dx, dy);
    const before = this.x + "," + this.y;
    this.move(mx, my, world);
    this.moving = (this.x + "," + this.y) !== before;
    if (!this.moving) { this.blockedT += dt; if (this.blockedT > 1.5) { this.blockedT = 0; this.path = null; } }
    else this.blockedT = 0;
  }

  // --- interaction ---
  talk(world) {
    const p = world.player;
    this.faceToward(p.tx, p.ty);
    p.faceToward(this.tx, this.ty);
    const held = p.inventory.selectedId;
    if (held && Friendship.canGift(this.id) && Talk.isGiftable(held)) {
      world.ask("Give " + Talk.itemName(held) + " to " + this.def.name + "?", ["Yes", "No"], (i) => {
        if (i === 0) Talk.gift(world, this, held);
      });
      return;
    }
    Talk.converse(world, this);
  }

  draw(ctx, camX, camY) {
    super.draw(ctx, camX, camY);
  }
}
