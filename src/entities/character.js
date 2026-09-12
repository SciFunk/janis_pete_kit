// Character: a 16x32-frame sprite with 4 direction rows (down/right/up/left), a feet-anchored
// position, a small collision box at the feet, and axis-separated movement against the world.
import { Assets } from "../engine/assets.js";
import { TS } from "../world/tileset.js";

export const DOWN = 0, RIGHT = 1, UP = 2, LEFT = 3;
export const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];

export class Character {
  constructor(opts) {
    this.name = opts.name || "";
    this.sheet = opts.sheet;             // Assets.img key
    this.x = opts.x || 0; this.y = opts.y || 0;   // feet center, px
    this.dir = opts.dir === undefined ? DOWN : opts.dir;
    this.speed = opts.speed || 72;
    this.frame = 0; this.animT = 0; this.moving = false;
    this.boxW = 12; this.boxH = 8;
    this.fw = 16; this.fh = 32;
    this.emote = null; this.emoteT = 0;
    this.solid = true;
  }

  get tx() { return Math.floor(this.x / TS); }
  get ty() { return Math.floor((this.y - 1) / TS); }
  get baseY() { return this.y; }

  box(x, y) { return [x - this.boxW / 2, y - this.boxH, this.boxW, this.boxH]; }

  facingTile(dist) {
    const d = DIRS[this.dir]; dist = dist || 1;
    return [this.tx + d[0] * dist, this.ty + d[1] * dist];
  }

  faceToward(tx, ty) {
    const dx = tx - this.tx, dy = ty - this.ty;
    if (Math.abs(dx) > Math.abs(dy)) this.dir = dx > 0 ? RIGHT : LEFT; else this.dir = dy > 0 ? DOWN : UP;
  }

  // try to move by (dx,dy) px; returns true if any movement happened. When an axis is blocked
  // but a free spot exists a few pixels to the side (a doorway, a gap between trees), slide
  // toward it so one-tile openings don't need pixel-perfect alignment.
  move(dx, dy, world) {
    let moved = false;
    if (dx !== 0) {
      const nx = this.x + dx;
      const b = this.box(nx, this.y);
      if (!world.blocked(b[0], b[1], b[2], b[3], this)) { this.x = nx; moved = true; }
      else if (this.slide(dx, 0, world)) moved = true;
    }
    if (dy !== 0) {
      const ny = this.y + dy;
      const b = this.box(this.x, ny);
      if (!world.blocked(b[0], b[1], b[2], b[3], this)) { this.y = ny; moved = true; }
      else if (this.slide(0, dy, world)) moved = true;
    }
    return moved;
  }

  slide(dx, dy, world) {
    const along = dx !== 0;
    const speed = Math.max(0.8, Math.abs(along ? dx : dy));
    for (let k = 1; k <= 7; k++) for (const s of [-1, 1]) {
      const nx = this.x + dx + (along ? 0 : s * k), ny = this.y + dy + (along ? s * k : 0);
      const b = this.box(nx, ny);
      if (!world.blocked(b[0], b[1], b[2], b[3], this)) {
        const step = Math.min(k, speed);
        if (along) this.y += s * step; else this.x += s * step;
        return true;
      }
    }
    return false;
  }

  setDirFromDelta(dx, dy) {
    if (dx === 0 && dy === 0) return;
    if (Math.abs(dx) >= Math.abs(dy)) this.dir = dx > 0 ? RIGHT : LEFT; else this.dir = dy > 0 ? DOWN : UP;
  }

  animate(dt) {
    if (this.moving) { this.animT += dt; this.frame = Math.floor(this.animT * 7) % 4; }
    else { this.frame = 0; this.animT = 0; }
    if (this.emote) { this.emoteT -= dt; if (this.emoteT <= 0) this.emote = null; }
  }

  showEmote(kind, secs) { this.emote = kind; this.emoteT = secs || 2.2; this.emoteStart = performance.now(); }

  draw(ctx, camX, camY) {
    const img = Assets.img[this.sheet];
    if (!img) return;
    // frame size comes from the sheet: standard 64-wide sheets are 16x32; anything wider is a
    // 4x4 sheet with bigger cells (the character builder exports 24x36 so hats aren't clipped)
    // (an NPC def may pin the frame size for animal-layout sheets: 32x32 frames, rows 0-3 = directions,
    // more pose rows below; see "frame" in data/npcs.json)
    if (this.frameSize && img.width === this.frameSize[0] * 4) { this.fw = this.frameSize[0]; this.fh = this.frameSize[1]; }
    else { this.fw = img.width === 64 ? 16 : img.width / 4; this.fh = img.width === 64 ? 32 : img.height / 4; }
    const dx = Math.round(this.x - this.fw / 2 - camX), dy = Math.round(this.y - this.fh - camY);
    ctx.drawImage(img, this.frame * this.fw, this.dir * this.fh, this.fw, this.fh, dx, dy, this.fw, this.fh);
    if (this.emote) this.drawEmote(ctx, dx, dy);
  }

  // Emotes sheet: 16x16 cells, 4 columns; row = emote index / 4 (Stardew constants: 8 ?, 12 angry,
  // 16 !, 20 heart, 24 sleep, 28 sad, 32 happy, 36 x, 40 pause/..., 52 videogame, 56 music, 60 blush)
  drawEmote(ctx, dx, dy) {
    const em = Assets.img.emotes; if (!em) return;
    const row = Math.floor(this.emote / 4);
    const t = (performance.now() - this.emoteStart) / 1000;
    const col = t < 0.4 ? Math.min(3, Math.floor(t / 0.1)) : 3;
    ctx.drawImage(em, col * 16, row * 16, 16, 16, dx, dy - 16, 16, 16);
  }
}
