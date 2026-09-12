// Dropped item on the ground: small bounce, then flies to the player when close.
import { Items } from "../systems/items.js";

export class Drop {
  constructor(id, n, x, y) {
    this.id = id; this.n = n;
    this.x = x; this.y = y; this.z = 0;
    const a = Math.random() * Math.PI * 2, sp = 20 + Math.random() * 25;
    this.vx = Math.cos(a) * sp; this.vy = Math.sin(a) * sp * 0.6; this.vz = 60 + Math.random() * 30;
    this.t = 0; this.dead = false;
  }
  get baseY() { return this.y; }

  update(dt, world) {
    this.t += dt;
    if (this.t < 0.9) {
      this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt; this.vz -= 300 * dt;
      if (this.z < 0) { this.z = 0; this.vz = -this.vz * 0.4; this.vx *= 0.6; this.vy *= 0.6; }
      return;
    }
    const p = world.player, dx = p.x - this.x, dy = (p.y - 10) - this.y, d = Math.hypot(dx, dy);
    if (d < 40 && world.player.inventory.canAdd(this.id, this.n)) {
      const sp = 140 * dt;
      if (d < 6) { world.player.inventory.add(this.id, this.n); this.dead = true; world.toast(Items.name(this.id) + (this.n > 1 ? " x" + this.n : ""), this.id); world.sfx("pickup"); }
      else { this.x += dx / d * sp; this.y += dy / d * sp; }
    }
  }

  draw(ctx, camX, camY) {
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath(); ctx.ellipse(this.x - camX, this.y - camY, 5, 2, 0, 0, Math.PI * 2); ctx.fill();
    Items.drawIcon(ctx, this.id, this.x - 8 - camX, this.y - 14 - this.z - camY);
  }
}
