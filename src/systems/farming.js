// Hoed dirt + crops. State lives per map in map.farm = { hoed: Map<"x,y", tile> }.
// tile = { w: watered(bool), crop: null | { id, phase, day, grown, regrowT, dead } }
// Growth follows Stardew's Crop.newDay: a watered crop advances `day`; when day >= phases[phase]
// the phase increments; mature when phase === phases.length. Regrowing crops set grown=true after
// harvest and count regrowT down to 0.
import { Assets } from "../engine/assets.js";
import { TS } from "../world/tileset.js";
import { tileHash } from "../world/autotile.js";
import { Clock } from "./time.js";

// HoeDirt.drawGuide: neighbour key (N=1, E=2, S=4, W=8) -> index in the 4x4 block
const DRAW_GUIDE = { 0: 0, 8: 15, 2: 13, 1: 12, 4: 4, 9: 11, 3: 9, 5: 8, 6: 1, 12: 3, 10: 14, 7: 5, 15: 6, 13: 7, 11: 10, 14: 2 };

export const Farming = {
  crops: {},
  init(cropData) { this.crops = cropData; },

  state(map) {
    if (!map.farm) map.farm = { hoed: new Map() };
    return map.farm;
  },
  key(x, y) { return x + "," + y; },
  tile(map, x, y) { return map.farm ? map.farm.hoed.get(this.key(x, y)) || null : null; },

  canTill(map, x, y) {
    if (!map.def.tillable || !map.inBounds(x, y)) return false;
    const c = map.t(x, y);
    if (c !== 103 && c !== 100) return false; // g or d
    if (map.isSolid(x, y) || map.propAt(x, y)) return false;
    return !this.tile(map, x, y);
  },
  till(map, x, y) {
    if (!this.canTill(map, x, y)) return false;
    this.state(map).hoed.set(this.key(x, y), { w: false, crop: null });
    return true;
  },
  unTill(map, x, y) {
    const t = this.tile(map, x, y); if (!t || t.crop) return false;
    map.farm.hoed.delete(this.key(x, y)); return true;
  },
  water(map, x, y) {
    const t = this.tile(map, x, y); if (!t) return false;
    t.w = true; return true;
  },
  canPlant(map, x, y, cropId) {
    const t = this.tile(map, x, y); if (!t || t.crop) return false;
    const c = this.crops[cropId]; if (!c) return false;
    return c.seasons.indexOf(Clock.seasonName) >= 0 || map.indoor;
  },
  plant(map, x, y, cropId) {
    if (!this.canPlant(map, x, y, cropId)) return false;
    this.tile(map, x, y).crop = { id: cropId, phase: 0, day: 0, grown: false, regrowT: 0, dead: false };
    return true;
  },
  isMature(crop) { const c = this.crops[crop.id]; return crop.phase >= c.phases.length; },
  isHarvestable(crop) { return !crop.dead && this.isMature(crop) && (!crop.grown || crop.regrowT <= 0); },

  // returns {id, n} harvested, or null
  harvest(map, x, y) {
    const t = this.tile(map, x, y); if (!t || !t.crop || !this.isHarvestable(t.crop)) return null;
    const c = this.crops[t.crop.id];
    let n = c.minYield || 1;
    const maxY = c.maxYield || n;
    if (maxY > n) n += Math.floor(Math.random() * (maxY - n + 1));
    if (c.extraChance && Math.random() < c.extraChance) n += 1;
    if (c.regrow > 0) { t.crop.grown = true; t.crop.regrowT = c.regrow; }
    else t.crop = null;
    return { id: c.harvest, n: n };
  },
  clearCrop(map, x, y) { const t = this.tile(map, x, y); if (t) t.crop = null; },

  newDay(map, raining) {
    if (!map.farm) return;
    const season = Clock.seasonName;
    for (const [k, t] of map.farm.hoed) {
      const wet = t.w || (raining && !map.indoor);
      if (t.crop) {
        const cr = t.crop, c = this.crops[cr.id];
        if (!map.indoor && c.seasons.indexOf(season) < 0) { cr.dead = true; }
        else if (wet && !cr.dead) {
          if (cr.grown && cr.regrowT > 0) cr.regrowT -= 1;
          else if (cr.phase < c.phases.length) {
            cr.day += 1;
            if (cr.day >= c.phases[cr.phase]) { cr.phase += 1; cr.day = 0; }
          }
        }
      } else if (!wet && Math.random() < 0.1) {
        map.farm.hoed.delete(k); continue; // empty dry dirt slowly reverts
      }
      t.w = raining && !map.indoor;
    }
  },

  // ---- drawing (world ground hook) ----
  draw(ctx, map, camX, camY, vw, vh) {
    if (!map.farm) return;
    const dirt = Assets.img.hoedirt, atlas = Assets.img.crop_atlas;
    const hoed = map.farm.hoed;
    const x0 = Math.floor(camX / TS) - 1, y0 = Math.floor(camY / TS) - 1, x1 = Math.floor((camX + vw) / TS) + 1, y1 = Math.floor((camY + vh) / TS) + 1;
    const has = (x, y) => hoed.has(x + "," + y);
    for (const [k, t] of hoed) {
      const i = k.indexOf(","), x = +k.slice(0, i), y = +k.slice(i + 1);
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      let key = 0;
      if (has(x, y - 1)) key |= 1; if (has(x + 1, y)) key |= 2; if (has(x, y + 1)) key |= 4; if (has(x - 1, y)) key |= 8;
      const idx = DRAW_GUIDE[key];
      const sx = (idx % 4) * 16, sy = Math.floor(idx / 4) * 16 + (t.w ? 64 : 0);
      ctx.drawImage(dirt, sx, sy, 16, 16, x * TS - camX, y * TS - camY, 16, 16);
    }
    // crops (drawn after all dirt so tall sprites overlap neighbours' dirt correctly)
    for (const [k, t] of hoed) {
      if (!t.crop) continue;
      const i = k.indexOf(","), x = +k.slice(0, i), y = +k.slice(i + 1);
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const cr = t.crop, c = this.crops[cr.id];
      let col;
      if (cr.dead) col = 8;
      else if (cr.grown) col = cr.regrowT <= 0 ? 6 : 7;
      else if (cr.phase === 0) col = tileHash(x, y) & 1;
      else col = Math.min(7, cr.phase + 1);
      const row = c.row;
      if (col === 8) { // dead: generic withered sprite row at the end of the atlas
        ctx.drawImage(atlas, (tileHash(x, y) % 4) * 16, atlas.height - 32, 16, 32, x * TS - camX, y * TS - camY - 16, 16, 32);
      } else {
        ctx.drawImage(atlas, col * 16, row * 32, 16, 32, x * TS - camX, y * TS - camY - 16, 16, 32);
      }
    }
  },

  save() {
    const out = {};
    // caller passes maps; see save.js
    return out;
  },
  serialize(map) {
    if (!map.farm) return null;
    const arr = [];
    for (const [k, t] of map.farm.hoed) arr.push([k, t.w ? 1 : 0, t.crop]);
    return arr;
  },
  deserialize(map, arr) {
    if (!arr) return;
    const st = this.state(map); st.hoed.clear();
    for (const [k, w, crop] of arr) st.hoed.set(k, { w: !!w, crop: crop || null });
  },
};
