import { Character } from "./character.js";
import { Input } from "../engine/input.js";
import { Inventory } from "../systems/inventory.js";
import { Assets } from "../engine/assets.js";
import { TS } from "../world/tileset.js";

export class Player extends Character {
  constructor(opts) {
    super(opts);
    this.gold = opts.gold || 500;
    this.energy = 270; this.maxEnergy = 270;
    this.busy = 0;              // seconds during which input is ignored (tool swing etc.)
    this.speed = 74;
    this.displayName = opts.displayName || "Farmer";
    this.inventory = new Inventory(36);
    this.water = 40; this.waterMax = 40;
    this.toolAnim = null;
  }

  update(dt, world) {
    this.moving = false;
    if (this.toolAnim) { this.toolAnim.t -= dt; if (this.toolAnim.t <= 0) this.toolAnim = null; }
    if (this.busy > 0) { this.busy -= dt; this.animate(dt); return; }
    if (!world.inputLocked()) {
      const { dx, dy } = Input.axis();
      if (dx || dy) {
        const len = Math.hypot(dx, dy);
        const sp = this.speed * dt * (Input.isDown("ShiftLeft") ? 1.5 : 1);
        const mx = dx / len * sp, my = dy / len * sp;
        this.setDirFromDelta(dx, dy);
        this.moving = this.move(mx, my, world);
      }
    }
    this.animate(dt);
  }

  draw(ctx, camX, camY) {
    super.draw(ctx, camX, camY);
    // tool feedback: the tool icon swings over the target tile
    const a = this.toolAnim;
    if (a) {
      const tools = Assets.img.tools, def = Assets.data.items && Assets.data.items[a.tool], ic = def && def.icon;
      if (!tools || !ic || typeof ic !== "object") return;
      const w = ic.w || 16, h = ic.h || 16;           // same pixel box as the inventory icon
      const k = 1 - a.t / 0.32;
      const x = a.tx * TS - camX + (16 - w) / 2, y = a.ty * TS - camY - 6 - Math.sin(k * Math.PI) * 6 + (16 - h);
      ctx.drawImage(tools, ic.sx, ic.sy, w, h, Math.round(x), Math.round(y), w, h);
    }
  }

  save() {
    return { gold: this.gold, energy: this.energy, maxEnergy: this.maxEnergy, water: this.water, name: this.displayName,
      inv: this.inventory.save(), x: this.x, y: this.y, dir: this.dir, sheet: this.sheet };
  }
  load(d) {
    if (!d) return;
    this.gold = d.gold; this.energy = d.energy; this.maxEnergy = d.maxEnergy || 270; this.water = d.water;
    this.displayName = d.name || this.displayName; this.inventory.load(d.inv);
    this.x = d.x; this.y = d.y; this.dir = d.dir || 0; if (d.sheet) this.sheet = d.sheet;
  }
}
