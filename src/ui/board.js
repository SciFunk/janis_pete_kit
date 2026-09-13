// Notice board menu + the small active-quest list on the HUD.
import { Screen } from "../engine/screen.js";
import { Input } from "../engine/input.js";
import { drawText, drawPanel, fillRect, wrapText } from "./text.js";
import { Quests } from "../systems/quests.js";
import { Items } from "../systems/items.js";
import { Clock } from "../systems/time.js";

export const Board = {
  world: null, isOpen: false, hover: -1, scroll: 0,
  init(world) { this.world = world; world.hooks.update.push(() => { if (this.isOpen) this.update(); }); },
  open() { if (Quests.tryHandIn()) return; this.isOpen = true; this.justOpened = true; this.scroll = 0; this.world.locks++; },
  rows() { return Math.max(1, Math.floor((this.rect().h - 34) / 40)); },
  close() { this.isOpen = false; this.world.locks--; },

  rect() { const w = Math.min(Screen.vw - 8, 300), h = Math.min(Screen.vh - 8, 190); return { x: Math.floor((Screen.vw - w) / 2), y: Math.floor((Screen.vh - h) / 2), w: w, h: h }; },
  entries() { return Quests.posted().concat(Quests.active()); },

  update() {
    if (this.justOpened) { this.justOpened = false; return; }
    if (Input.justPressed("Escape", "KeyE", "Tab", "Space")) { this.close(); return; }
    const m = Input.mouse, r = this.rect(); this.hover = -1;
    const list = this.entries(), rows = this.rows();
    if (m.wheel) this.scroll = Math.max(0, Math.min(Math.max(0, list.length - rows), this.scroll + Math.sign(m.wheel)));
    for (let i = this.scroll; i < Math.min(list.length, this.scroll + rows); i++) {
      const y = r.y + 22 + (i - this.scroll) * 40;
      if (m.x >= r.x + 6 && m.x < r.x + r.w - 6 && m.y >= y && m.y < y + 38) this.hover = i;
    }
    if (m.pressed && this.hover >= 0) { const q = list[this.hover]; if (!q.accepted) Quests.accept(q); }
  },

  draw() {
    if (!this.isOpen) return;
    const r = this.rect();
    fillRect(0, 0, Screen.vw, Screen.vh, "rgba(0,0,0,0.45)");
    drawPanel(r.x, r.y, r.w, r.h);
    drawText("Notice board", r.x + 8, r.y + 6, { size: 8, bold: true, color: "#f4e4c1" });
    const list = this.entries();
    if (!list.length) drawText("Nothing posted today.", r.x + 8, r.y + 26, { size: 7, color: "#e8dcc8" });
    const rows = this.rows();
    list.slice(this.scroll, this.scroll + rows).forEach((q, k) => {
      const i = k + this.scroll, y = r.y + 22 + k * 40;
      fillRect(r.x + 6, y, r.w - 12, 38, i === this.hover ? "rgba(255,220,120,0.2)" : "rgba(255,255,255,0.06)");
      if (q.item) Items.drawIconUI(q.item, r.x + 10, y + 3, 16);
      else drawText(q.type === "visit" ? "\u2192" : q.type === "talk" ? "\u2026" : q.type === "gift" ? "\u2665" : "!", r.x + 14, y + 6, { size: 9, bold: true, color: "#ffd86b" });
      drawText(q.title, r.x + 30, y + 3, { size: 7, bold: true, color: "#fff" });
      wrapText(q.text, r.w - 100, 5.5).slice(0, 2).forEach((l, j) => drawText(l, r.x + 30, y + 13 + j * 8, { size: 5.5, color: "#e8dcc8" }));
      drawText(q.reward + "g", r.x + r.w - 12, y + 3, { size: 7, bold: true, align: "right", color: "#ffd86b" });
      drawText(q.accepted ? "accepted" : "click to accept", r.x + r.w - 12, y + 26, { size: 5, align: "right", color: q.accepted ? "#9fd88a" : "#c9b48a" });
      drawText((q.expires - Clock.dayIndex()) + " days left", r.x + r.w - 12, y + 14, { size: 5, align: "right", color: "#c9b48a" });
    });
    if (list.length > rows) drawText("scroll for more (" + (this.scroll + 1) + "-" + Math.min(list.length, this.scroll + rows) + " of " + list.length + ")", r.x + 8, r.y + r.h - 12, { size: 5.5, color: "#c9b48a" });
    drawText("Esc to close", r.x + r.w - 8, r.y + r.h - 12, { size: 5.5, align: "right", color: "#c9b48a" });
  },

  // HUD: active quests at top-left
  drawHud() {
    const list = Quests.active(); if (!list.length) return;
    let y = 6;
    for (const q of list) {
      const txt = Quests.progress(q);
      drawPanel(4, y, 6 + txt.length * 3.6, 14, { inner: false, fill: "rgba(40,24,12,0.75)" });
      drawText(txt, 8, y + 3, { size: 6, color: Quests.ready(q) ? "#9fd88a" : "#f4e4c1" });
      y += 16;
    }
  },
};
