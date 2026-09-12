// Social panel (L): everyone you've met, hearts, birthday, discovered tastes.
import { Screen } from "../engine/screen.js";
import { Input } from "../engine/input.js";
import { drawText, drawPanel, fillRect } from "./text.js";
import { Friendship, HEART, MAX_HEARTS } from "../systems/friendship.js";
import { Items } from "../systems/items.js";
import { Assets } from "../engine/assets.js";

export const Social = {
  world: null, isOpen: false, scroll: 0,
  init(world) { this.world = world; world.hooks.update.push(() => { if (this.isOpen) this.update(); }); },
  toggle() { if (this.isOpen) { this.isOpen = false; this.world.locks--; } else { this.isOpen = true; this.world.locks++; } },
  update() { if (Input.justPressed("Escape", "KeyL", "Tab")) this.toggle(); if (Input.mouse.wheel) this.scroll = Math.max(0, this.scroll + Input.mouse.wheel); },

  drawHearts(x, y, hearts) {
    const s = Screen.scale, c = Screen.ctx;
    for (let i = 0; i < MAX_HEARTS; i++) {
      const fill = hearts >= i + 1 ? 1 : hearts >= i + 0.5 ? 0.5 : 0;
      const hx = x + i * 8;
      c.fillStyle = "#5a2a2a"; c.fillRect(hx * s, y * s, 6 * s, 5 * s);
      if (fill) { c.fillStyle = "#e84a5f"; c.fillRect(hx * s, y * s, 6 * s * fill, 5 * s); }
    }
  },

  draw() {
    if (!this.isOpen) return;
    const w = Math.min(Screen.vw - 8, 320), h = Math.min(Screen.vh - 8, 220);
    const r = { x: Math.floor((Screen.vw - w) / 2), y: Math.floor((Screen.vh - h) / 2), w: w, h: h };
    fillRect(0, 0, Screen.vw, Screen.vh, "rgba(0,0,0,0.45)");
    drawPanel(r.x, r.y, r.w, r.h);
    drawText("Friends", r.x + 8, r.y + 6, { size: 8, bold: true, color: "#f4e4c1" });
    const met = this.world.allNpcs.filter((n) => n.def && Friendship.get(n.id).met);
    if (!met.length) drawText("You haven't met anyone yet. Head east to town.", r.x + 8, r.y + 26, { size: 7, color: "#e8dcc8" });
    const rowH = 36;
    met.slice(this.scroll).forEach((n, i) => {
      const y = r.y + 22 + i * rowH; if (y + rowH > r.y + r.h - 6) return;
      fillRect(r.x + 6, y, r.w - 12, rowH - 3, "rgba(255,255,255,0.06)");
      const img = Assets.img[n.sheet];
      if (img) { const s = Screen.scale, fw = img.width === 64 ? 16 : img.width / 4, fh = img.width === 64 ? 32 : img.height / 4; Screen.ctx.imageSmoothingEnabled = false; Screen.ctx.drawImage(img, 0, 0, fw, fh, (r.x + 18 - fw / 2) * s, (y + 33 - fh) * s, fw * s, fh * s); }
      drawText(n.def.name, r.x + 32, y + 3, { size: 7.5, bold: true, color: "#fff" });
      const f = Friendship.get(n.id);
      this.drawHearts(r.x + 32, y + 14, Friendship.hearts(n.id));
      drawText(Math.floor(f.points / HEART) + "/" + MAX_HEARTS, r.x + 32 + 84, y + 13, { size: 5.5, color: "#c9b48a" });
      if (n.def.birthday) drawText("Birthday: " + n.def.birthday[0] + " " + n.def.birthday[1], r.x + 160, y + 3, { size: 6, color: "#e8dcc8" });
      const known = f.known || {};
      const loves = Object.keys(known).filter((k) => known[k] === "love").map((k) => Items.name(k));
      const likes = Object.keys(known).filter((k) => known[k] === "like").map((k) => Items.name(k));
      const dis = Object.keys(known).filter((k) => known[k] === "dislike" || known[k] === "hate").map((k) => Items.name(k));
      let ty = y + 12;
      if (loves.length) { drawText("Loves: " + loves.join(", "), r.x + 160, ty, { size: 5.5, color: "#ffb3c1" }); ty += 7; }
      if (likes.length) { drawText("Likes: " + likes.join(", "), r.x + 160, ty, { size: 5.5, color: "#c8e6a0" }); ty += 7; }
      if (dis.length) { drawText("Dislikes: " + dis.join(", "), r.x + 160, ty, { size: 5.5, color: "#c9b48a" }); ty += 7; }
      if (!loves.length && !likes.length && !dis.length) drawText("Tastes: unknown (try giving gifts)", r.x + 160, ty, { size: 5.5, color: "#a08a7a" });
      drawText(f.talkedDay === Friendship.dayIndex ? "talked today" : "", r.x + 32, y + 22, { size: 5, color: "#9fd88a" });
      drawText(f.giftedDay === Friendship.dayIndex ? "gift given today" : "", r.x + 90, y + 22, { size: 5, color: "#9fd88a" });
    });
    drawText("L / Esc to close", r.x + r.w - 8, r.y + r.h - 12, { size: 5.5, align: "right", color: "#c9b48a" });
  },
};
