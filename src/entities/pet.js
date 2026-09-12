// Pet cat: wanders near a home point, sits sometimes, purrs when you interact.
// Sheet: 32x32 frames, 4 columns; rows down/right/up/left, then sit rows.
import { Assets } from "../engine/assets.js";
import { TS } from "../world/tileset.js";
import { Friendship } from "../systems/friendship.js";

export class Pet {
  constructor(opts) {
    this.id = "pet"; this.name = opts.name || "Cat"; this.sheet = opts.sheet || "cat_ragdoll";
    this.map = opts.map; this.hx = opts.x * TS + 16; this.hy = opts.y * TS + 16;
    this.x = this.hx; this.y = this.hy; this.dir = 0; this.frame = 0; this.animT = 0;
    this.state = "sit"; this.stateT = 2; this.tx_ = 0; this.ty_ = 0; this.solid = false;
    this.boxW = 12; this.boxH = 8; this.emote = null; this.emoteT = 0; this.talk = null;
  }
  get tx() { return Math.floor(this.x / TS); }
  get ty() { return Math.floor((this.y - 1) / TS); }
  get baseY() { return this.y; }
  box(x, y) { return [x - 6, y - 8, 12, 8]; }
  simulate() {}

  update(dt, world) {
    this.stateT -= dt;
    if (this.emote) { this.emoteT -= dt; if (this.emoteT <= 0) this.emote = null; }
    if (this.state === "walk") {
      const dx = this.tx_ - this.x, dy = this.ty_ - this.y, d = Math.hypot(dx, dy);
      if (d < 2 || this.stateT <= 0) { this.state = Math.random() < 0.5 ? "sit" : "idle"; this.stateT = 2 + Math.random() * 5; return; }
      const sp = 30 * dt, mx = dx / d * sp, my = dy / d * sp;
      if (Math.abs(dx) > Math.abs(dy)) this.dir = dx > 0 ? 1 : 3; else this.dir = dy > 0 ? 0 : 2;
      const b = this.box(this.x + mx, this.y + my);
      if (!world.map.rectBlocked(b[0], b[1], b[2], b[3])) { this.x += mx; this.y += my; this.animT += dt; this.frame = Math.floor(this.animT * 6) % 4; }
      else { this.state = "idle"; this.stateT = 1; }
    } else if (this.stateT <= 0) {
      this.state = "walk"; this.stateT = 4;
      this.tx_ = this.hx + (Math.random() - 0.5) * 120; this.ty_ = this.hy + (Math.random() - 0.5) * 80;
      this.frame = 0;
    }
  }

  interact(world) {
    this.emote = 20; this.emoteT = 2; this.emoteStart = performance.now();
    world.toast(this.name + " purrs.");
    Friendship.add("pet", 5);
    return true;
  }

  draw(ctx, camX, camY) {
    const img = Assets.img[this.sheet]; if (!img) return;
    let row = this.dir, col = this.state === "walk" ? this.frame : 0;
    if (this.state === "sit") { row = 4; col = Math.floor(performance.now() / 600) % 2; }
    const dx = Math.round(this.x - 16 - camX), dy = Math.round(this.y - 28 - camY);
    ctx.drawImage(img, col * 32, row * 32, 32, 32, dx, dy, 32, 32);
    if (this.emote) {
      const em = Assets.img.emotes; const t = (performance.now() - this.emoteStart) / 1000; const c = t < 0.4 ? Math.min(3, Math.floor(t / 0.1)) : 3;
      ctx.drawImage(em, c * 16, Math.floor(this.emote / 4) * 16, 16, 16, dx + 8, dy - 10, 16, 16);
    }
  }
}
