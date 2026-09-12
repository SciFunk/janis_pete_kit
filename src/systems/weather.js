// Daily weather: sunny or rain (snow in winter shown as rain particles for now). Rain waters crops.
import { Clock } from "./time.js";
import { Screen } from "../engine/screen.js";

export const Weather = {
  today: "sun", drops: [],
  get raining() { return this.today === "rain" || this.today === "storm"; },

  roll() {
    const s = Clock.season;
    const chance = s === 0 ? 0.25 : s === 1 ? 0.15 : s === 2 ? 0.3 : 0.35;
    this.today = Math.random() < chance ? "rain" : "sun";
    this.drops = [];
  },

  update(dt, outdoors) {
    if (!this.raining || !outdoors) { this.drops = []; return; }
    const vw = Screen.vw, vh = Screen.vh;
    while (this.drops.length < 120) this.drops.push({ x: Math.random() * (vw + 40), y: Math.random() * vh, v: 220 + Math.random() * 80 });
    for (const d of this.drops) {
      d.y += d.v * dt; d.x -= d.v * 0.25 * dt;
      if (d.y > vh) { d.y = -8; d.x = Math.random() * (vw + 40); }
    }
  },

  draw(ctx, outdoors) {
    if (!this.raining || !outdoors) return;
    ctx.fillStyle = "rgba(20,30,70,0.18)"; ctx.fillRect(0, 0, Screen.vw, Screen.vh);
    ctx.strokeStyle = Clock.season === 3 ? "rgba(240,240,255,0.8)" : "rgba(160,190,255,0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const d of this.drops) { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 1.5, d.y + 6); }
    ctx.stroke();
  },

  save() { return { today: this.today }; },
  load(d) { if (d) this.today = d.today; },
};
