// Wandering animal spawned for every placed prop of kind "animal" (see tools/import_animals.py).
// def.anim = { mode: "dir" | "strip", frames, fw, fh }
//   dir:   4 columns of walking frames, rows down / right / up / left
//   strip: one row of frames looped in place; mirrored when heading left
import { Assets } from "../engine/assets.js";
import { TS } from "../world/tileset.js";

export class Critter {
  constructor(prop) {
    this.prop = prop; this.def = prop.def; this.sheet = prop.sheet || prop.def.sheet;
    const a = this.def.anim || { mode: "strip", frames: 1, fw: 16, fh: 16 };
    this.fw = a.fw; this.fh = a.fh; this.mode = a.mode; this.frames = a.frames;
    this.hx = prop.x * TS + 8; this.hy = prop.y * TS + 16;      // home: the placed tile
    this.x = this.hx; this.y = this.hy; this.dir = 0; this.frame = 0; this.animT = 0; this.flip = false;
    this.state = "idle"; this.stateT = 1 + Math.random() * 3; this.tx_ = this.x; this.ty_ = this.y;
    this.solid = false; this.boxW = Math.min(12, this.fw - 4); this.boxH = 8;
    this.speed = this.fw >= 32 ? 22 : 34;
    this.id = prop.id || null; this.name = prop.note || null;
  }
  get tx() { return Math.floor(this.x / TS); }
  get ty() { return Math.floor((this.y - 1) / TS); }
  get baseY() { return this.y; }
  box(x, y) { return [x - this.boxW / 2, y - this.boxH, this.boxW, this.boxH]; }
  simulate() {}

  update(dt, world) {
    this.stateT -= dt;
    if (this.state === "walk") {
      const dx = this.tx_ - this.x, dy = this.ty_ - this.y, d = Math.hypot(dx, dy);
      if (d < 2 || this.stateT <= 0) { this.state = "idle"; this.stateT = 1 + Math.random() * 4; this.frame = 0; return; }
      const sp = this.speed * dt, mx = dx / d * sp, my = dy / d * sp;
      if (Math.abs(dx) > Math.abs(dy)) { this.dir = dx > 0 ? 1 : 3; this.flip = dx < 0; } else this.dir = dy > 0 ? 0 : 2;
      const b = this.box(this.x + mx, this.y + my);
      if (!world.map.rectBlocked(b[0], b[1], b[2], b[3])) { this.x += mx; this.y += my; this.animT += dt; this.frame = Math.floor(this.animT * 6) % this.frames; }
      else { this.state = "idle"; this.stateT = 1; }
    } else {
      if (this.mode === "strip") { this.animT += dt; this.frame = Math.floor(this.animT * 5) % this.frames; }   // strips animate while idle too (birds peck, frogs blink)
      if (this.stateT <= 0) {
        this.state = "walk"; this.stateT = 3;
        const r = this.fw >= 32 ? 64 : 48;
        this.tx_ = this.hx + (Math.random() - 0.5) * 2 * r; this.ty_ = this.hy + (Math.random() - 0.5) * 2 * r * 0.7;
      }
    }
  }

  interact(world) { world.toast(this.name || "It looks at you."); return true; }

  draw(ctx, camX, camY) {
    const img = Assets.img[this.sheet]; if (!img) return;
    const dx = Math.round(this.x - this.fw / 2 - camX), dy = Math.round(this.y - this.fh + 4 - camY);
    let sx, sy;
    if (this.mode === "dir") { sx = (this.state === "walk" ? this.frame : 0) * this.fw; sy = this.dir * this.fh; }
    else { sx = this.frame * this.fw; sy = 0; }
    if (this.mode === "strip" && this.flip) { ctx.save(); ctx.translate(dx + this.fw, dy); ctx.scale(-1, 1); ctx.drawImage(img, sx, sy, this.fw, this.fh, 0, 0, this.fw, this.fh); ctx.restore(); }
    else ctx.drawImage(img, sx, sy, this.fw, this.fh, dx, dy, this.fw, this.fh);
  }
}
