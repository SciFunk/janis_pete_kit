// Settings panel (from the inventory menu's Settings button, or Esc closes it).
import { Screen } from "../engine/screen.js";
import { Input } from "../engine/input.js";
import { drawText, drawPanel, fillRect } from "./text.js";
import { Settings, STORE_NAMES } from "../systems/settings.js";

export const SettingsMenu = {
  world: null, isOpen: false, hit: [],
  init(world) { this.world = world; world.hooks.update.push(() => { if (this.isOpen) this.update(); }); },
  open() { if (this.isOpen) return; this.isOpen = true; this.justOpened = true; this.world.locks++; },
  close() { if (!this.isOpen) return; this.isOpen = false; this.world.locks--; },

  rect() { const w = Math.min(Screen.vw - 8, 260), h = Math.min(Screen.vh - 8, 150); return { x: Math.floor((Screen.vw - w) / 2), y: Math.floor((Screen.vh - h) / 2), w: w, h: h }; },

  update() {
    if (this.justOpened) { this.justOpened = false; return; }
    if (Input.justPressed("Escape", "KeyI", "Tab")) { this.close(); return; }
    const m = Input.mouse;
    if (!m.pressed) return;
    for (const h of this.hit) if (m.x >= h.x && m.y >= h.y && m.x < h.x + h.w && m.y < h.y + h.h) { h.act(); return; }
  },

  draw() {
    if (!this.isOpen) return;
    const r = this.rect(), d = Settings.get(); this.hit = [];
    fillRect(0, 0, Screen.vw, Screen.vh, "rgba(0,0,0,0.45)");
    drawPanel(r.x, r.y, r.w, r.h);
    drawText("Settings", r.x + 8, r.y + 6, { size: 8, bold: true, color: "#f4e4c1" });
    drawText("Ask before buying / selling:", r.x + 8, r.y + 24, { size: 6.5, color: "#e8dcc8" });
    const opts = [["always", "Always"], ["never", "Never"], ["some", "Only some stores"]];
    let x = r.x + 8;
    for (const [v, label] of opts) {
      const w = 12 + label.length * 4.2, on = d.confirmTrade === v;
      fillRect(x, r.y + 34, w, 14, on ? "#8a5a2b" : "#3a2414");
      drawText(label, x + w / 2, r.y + 37, { size: 6, align: "center", color: on ? "#fff" : "#c9b48a" });
      this.hit.push({ x: x, y: r.y + 34, w: w, h: 14, act: () => Settings.set("confirmTrade", v) });
      x += w + 4;
    }
    if (d.confirmTrade === "some") {
      let y = r.y + 54;
      for (const k in STORE_NAMES) {
        const on = !!d.confirmStores[k];
        fillRect(r.x + 10, y, 10, 10, on ? "#9fd88a" : "#3a2414");
        drawText(STORE_NAMES[k], r.x + 26, y + 1, { size: 6, color: "#fff" });
        this.hit.push({ x: r.x + 8, y: y - 1, w: r.w - 16, h: 12, act: () => { d.confirmStores[k] = !on; Settings.save(); } });
        y += 13;
      }
    }
    const cb = { x: r.x + r.w - 46, y: r.y + r.h - 22, w: 38, h: 16 };
    fillRect(cb.x, cb.y, cb.w, cb.h, "#3a2414"); drawText("Close", cb.x + cb.w / 2, cb.y + 4, { size: 5.5, align: "center", color: "#f4e4c1" });
    this.hit.push(Object.assign({ act: () => this.close() }, cb));
    drawText("Esc closes. Settings are remembered on this computer.", r.x + 8, r.y + r.h - 16, { size: 5, color: "#a09080" });
  },
};

// Yes/no confirmation used by the shops: draws over the shop, remembers "don't ask again this visit".
export const Confirm = {
  active: null,   // { text, onYes, onNo, skipKey }
  ask(text, onYes, opts) { this.active = { text: text, onYes: onYes, onNo: (opts && opts.onNo) || null, dontAsk: false, owner: opts && opts.owner }; this.hit = []; },
  update() {
    if (!this.active) return false;
    const m = Input.mouse, a = this.active;
    if (Input.justPressed("Escape")) { this.active = null; return true; }
    if (Input.justPressed("Enter", "KeyY")) { this.finish(true); return true; }
    if (Input.justPressed("KeyN")) { this.finish(false); return true; }
    if (m.pressed) for (const h of this.hit || []) if (m.x >= h.x && m.y >= h.y && m.x < h.x + h.w && m.y < h.y + h.h) { h.act(); break; }
    return true;
  },
  finish(yes) {
    const a = this.active; this.active = null;
    if (a.dontAsk && a.owner) a.owner.skipConfirm = true;
    if (yes) a.onYes(); else if (a.onNo) a.onNo();
  },
  draw() {
    if (!this.active) return;
    const a = this.active, w = Math.min(Screen.vw - 8, 210), h = 62, x = Math.floor((Screen.vw - w) / 2), y = Math.floor((Screen.vh - h) / 2);
    this.hit = [];
    fillRect(0, 0, Screen.vw, Screen.vh, "rgba(0,0,0,0.35)");
    drawPanel(x, y, w, h);
    drawText(a.text, x + w / 2, y + 8, { size: 6.5, align: "center", color: "#fff" });
    fillRect(x + 10, y + 24, 9, 9, a.dontAsk ? "#9fd88a" : "#3a2414");
    drawText("Don't ask again during this visit", x + 24, y + 25, { size: 5.5, color: "#e8dcc8" });
    this.hit.push({ x: x + 8, y: y + 22, w: w - 16, h: 13, act: () => { a.dontAsk = !a.dontAsk; } });
    const yes = { x: x + w / 2 - 50, y: y + 40, w: 44, h: 14 }, no = { x: x + w / 2 + 6, y: y + 40, w: 44, h: 14 };
    fillRect(yes.x, yes.y, yes.w, yes.h, "#4a6b3a"); drawText("Yes (Enter)", yes.x + 22, yes.y + 3, { size: 5.5, align: "center", color: "#fff" });
    fillRect(no.x, no.y, no.w, no.h, "#6b3a3a"); drawText("No (Esc)", no.x + 22, no.y + 3, { size: 5.5, align: "center", color: "#fff" });
    this.hit.push(Object.assign({ act: () => this.finish(true) }, yes), Object.assign({ act: () => this.finish(false) }, no));
  },
};
