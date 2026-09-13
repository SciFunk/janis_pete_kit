// Props: static world sprites (buildings, trees, rocks, furniture) placed on a map by tile position.
// Definitions come from data/props.json; instances live in GameMap.props. Solid footprints feed the
// map's collision grid; drawing is y-sorted with the characters.
import { Assets } from "../engine/assets.js";
import { TS } from "./tileset.js";

export class Prop {
  constructor(def, name, inst) {
    this.def = def; this.name = name;
    this.x = inst.x; this.y = inst.y;             // tile of the sprite's top-left
    this.id = inst.id || null;
    this.door = inst.door || null;                 // {to, tx, ty} warp when stepping on def.door tile
    this.note = inst.note || null;
    this.shop = inst.shop || null;
    this.sheet = inst.sheet || def.sheet;
    this.sx = def.sx; this.sy = def.sy; this.sw = def.sw; this.sh = def.sh;
    this.tw = Math.ceil(this.sw / TS); this.th = Math.ceil(this.sh / TS);
    this.px = this.x * TS; this.py = this.y * TS;
    this.baseY = this.py + this.sh + (def.stack ? 8 : 0);   // depth key (bottom edge); "stack" things sit on top of whatever shares their tile
    this.hp = def.hp || 0;                          // debris hit points
    this.index = -1; this.map = null;               // set by GameMap
    this.kind = def.kind || "prop";
    this.solidRect = inst.solid === false ? null : this.computeSolid();   // inst.solid=false: made walkable in the editor
  }

  // returns [tx, ty, w, h] in tiles, or null
  computeSolid() {
    const s = this.def.solid;
    if (s === undefined || s === "all") return [this.x, this.y, this.tw, this.th];
    if (s === "none" || s === false) return null;
    if (Array.isArray(s)) return [this.x + s[0], this.y + s[1], s[2], s[3]];
    if (typeof s === "string" && s.startsWith("bottom:")) {
      const n = parseInt(s.slice(7), 10);
      return [this.x, this.y + this.th - n, this.tw, n];
    }
    if (s === "trunk") return [this.x + Math.floor(this.tw / 2), this.y + this.th - 1, 1, 1];
    return [this.x, this.y, this.tw, this.th];
  }

  get doorTile() {
    if (!this.def.door) return null;
    return [this.x + this.def.door[0], this.y + this.def.door[1]];
  }

  containsTile(tx, ty) {
    return tx >= this.x && ty >= this.y && tx < this.x + this.tw && ty < this.y + this.th;
  }

  draw(ctx, camX, camY) {
    if (this.kind === "animal") return;            // drawn by its Critter
    let sheet = this.sheet;
    if (this.def.seasonal && this.map) sheet = "outdoors_" + this.map.season;
    else if (this.def.seasons && this.map && this.def.seasons[this.map.season]) sheet = this.def.seasons[this.map.season];   // one sheet per season
    const img = Assets.img[sheet];
    if (!img) return;
    const an = this.def.anim, sx = an ? this.sx + (Math.floor(Date.now() / (an.ms || 300)) % an.frames) * this.sw : this.sx;   // frames side by side
    ctx.drawImage(img, sx, this.sy, this.sw, this.sh, this.px - camX, this.py - camY, this.sw, this.sh);
  }
}
