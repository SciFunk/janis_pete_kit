// Inventory menu (I / Esc): full grid, click to pick up / drop / swap; trash slot. Also the
// simple modal helpers: toasts, "say" dialogue box (single page), yes/no prompt.
import { Screen } from "../engine/screen.js";
import { Input } from "../engine/input.js";
import { drawText, drawPanel, fillRect, wrapText } from "./text.js";
import { Items } from "../systems/items.js";
import { SLOT, PAD, drawSlot } from "./hotbar.js";
import { ROW } from "../systems/inventory.js";

export const InventoryMenu = {
  open: false, held: null, hover: -1,

  toggle() { this.open = !this.open; if (!this.open && this.held) { this.putBack(); } },
  putBack() { if (this.held) { window.World.player.inventory.add(this.held.id, this.held.n); this.held = null; } },

  rect() {
    const inv = window.World.player.inventory;
    const rows = Math.ceil(inv.slots.length / ROW);
    const w = ROW * (SLOT + PAD) + PAD * 2 + 8, h = rows * (SLOT + PAD) + PAD * 2 + 34 + 20;
    return { x: Math.floor((Screen.vw - w) / 2), y: Math.floor((Screen.vh - h) / 2), w: w, h: h, rows: rows };
  },

  slotAt(mx, my) {
    const r = this.rect(), inv = window.World.player.inventory;
    const x0 = r.x + 4 + PAD, y0 = r.y + 22;
    const c = Math.floor((mx - x0) / (SLOT + PAD)), rr = Math.floor((my - y0) / (SLOT + PAD));
    if (c < 0 || c >= ROW || rr < 0 || rr >= r.rows) return -1;
    const i = rr * ROW + c; return i < inv.slots.length ? i : -1;
  },

  update() {
    if (!this.open) return;
    const inv = window.World.player.inventory, m = Input.mouse;
    this.hover = this.slotAt(m.x, m.y);
    const r = this.rect();
    const trash = { x: r.x + r.w - 26, y: r.y + r.h - 22, w: 20, h: 16 };
    const saveBtn = { x: r.x + 50, y: r.y + r.h - 22, w: 34, h: 16 }, quitBtn = { x: r.x + 90, y: r.y + r.h - 22, w: 56, h: 16 };
    const setBtn = { x: r.x + r.w - 80, y: r.y + r.h - 22, w: 48, h: 16 };
    const hit = (b) => m.x >= b.x && m.y >= b.y && m.x < b.x + b.w && m.y < b.y + b.h;
    if (m.pressed) {
      if (hit(trash)) {
        if (this.held && !Items.isTool(this.held.id)) this.held = null;
      } else if (hit(saveBtn)) {
        if (window.Save && window.Save.write()) window.World.toast("Game saved");
      } else if (hit(setBtn)) {
        this.toggle(); if (window.SettingsMenu) window.SettingsMenu.open();
      } else if (hit(quitBtn)) {
        if (window.Save) window.Save.write();
        this.toggle();
        window.World.started = false; window.Title.show(true);
      } else if (this.hover >= 0) {
        const s = inv.slots[this.hover];
        if (this.held) {
          if (s && s.id === this.held.id && Items.stackable(s.id)) { s.n += this.held.n; this.held = null; }
          else { inv.slots[this.hover] = this.held; this.held = s; }
        } else if (s) { this.held = s; inv.slots[this.hover] = null; }
      }
    }
    if (m.rpressed && this.hover >= 0) { // right click: take one / put one
      const s = inv.slots[this.hover];
      if (!this.held && s && s.n > 1) { this.held = { id: s.id, n: 1 }; s.n -= 1; }
      else if (this.held && (!s || (s.id === this.held.id && Items.stackable(s.id)))) {
        if (!s) inv.slots[this.hover] = { id: this.held.id, n: 1 }; else s.n += 1;
        this.held.n -= 1; if (this.held.n <= 0) this.held = null;
      }
    }
  },

  draw() {
    if (!this.open) return;
    const inv = window.World.player.inventory, r = this.rect();
    fillRect(0, 0, Screen.vw, Screen.vh, "rgba(0,0,0,0.45)");
    drawPanel(r.x, r.y, r.w, r.h);
    drawText("Inventory", r.x + 8, r.y + 6, { size: 8, bold: true, color: "#f4e4c1" });
    const KEYS = [["WASD", "walk"], ["Space / E", "talk, open, use"], ["click / C", "tool in hand"], ["1-0", "slot"], ["Tab / I", "bag"], ["L", "friends & hearts"], ["Esc", "close"], ["F6", "editor"]];
    const ky0 = r.y + 22 + r.rows * (SLOT + PAD) + 1;
    KEYS.forEach(([k, what], i) => { const kx = r.x + 8 + (i % 4) * ((r.w - 16) / 4), ky = ky0 + Math.floor(i / 4) * 9; drawText(k, kx, ky, { size: 5.5, bold: true, color: "#ffd86b" }); drawText(what, kx + k.length * 3.3 + 3, ky, { size: 5.5, color: "#e8dcc8" }); });
    const x0 = r.x + 4 + PAD, y0 = r.y + 22;
    for (let i = 0; i < inv.slots.length; i++) {
      const x = x0 + (i % ROW) * (SLOT + PAD), y = y0 + Math.floor(i / ROW) * (SLOT + PAD);
      drawSlot(x, y, inv.slots[i], i === inv.selected);
      if (i === this.hover) { fillRect(x, y, SLOT, SLOT, "rgba(255,255,255,0.18)"); }
    }
    // trash
    const trash = { x: r.x + r.w - 26, y: r.y + r.h - 22 };
    fillRect(trash.x, trash.y, 20, 16, "#3a2414");
    drawText("trash", trash.x + 10, trash.y + 3, { size: 5, align: "center", color: "#e8b0a0" });
    drawText(window.World.player.gold + "g", r.x + 8, r.y + r.h - 16, { size: 7, bold: true, color: "#ffd86b" });
    fillRect(r.x + 50, r.y + r.h - 22, 34, 16, "#3a2414"); drawText("Save", r.x + 67, r.y + r.h - 18, { size: 5.5, align: "center", color: "#f4e4c1" });
    fillRect(r.x + 90, r.y + r.h - 22, 56, 16, "#3a2414"); drawText("Save & quit", r.x + 118, r.y + r.h - 18, { size: 5.5, align: "center", color: "#f4e4c1" });
    fillRect(r.x + r.w - 80, r.y + r.h - 22, 48, 16, "#3a2414"); drawText("Settings", r.x + r.w - 56, r.y + r.h - 18, { size: 5.5, align: "center", color: "#f4e4c1" });
    // hover tooltip
    if (this.hover >= 0 && inv.slots[this.hover] && !this.held) {
      const s = inv.slots[this.hover], d = Items.get(s.id);
      const lines = [Items.name(s.id)];
      if (d && d.desc) lines.push.apply(lines, wrapText(d.desc, 110, 6));
      if (d && d.sell) lines.push("Sells for " + d.sell + "g");
      const m = Input.mouse, tw = 120, th = 8 + lines.length * 9;
      const tx = Math.min(Screen.vw - tw - 2, m.x + 8), ty = Math.max(2, m.y - th - 2);
      drawPanel(tx, ty, tw, th, { inner: false });
      lines.forEach((l, i) => drawText(l, tx + 5, ty + 4 + i * 9, { size: i === 0 ? 7 : 6, bold: i === 0, color: i === 0 ? "#fff" : "#e8dcc8" }));
    }
    if (this.held) { Items.drawIconUI(this.held.id, Input.mouse.x - 8, Input.mouse.y - 8, 16); if (this.held.n > 1) drawText(String(this.held.n), Input.mouse.x + 8, Input.mouse.y, { size: 5.5, bold: true }); }
  },
};

// ---- toasts ----
export const Toasts = {
  list: [],
  add(text, itemId) { this.list.push({ text: text, item: itemId || null, t: 2.6 }); if (this.list.length > 4) this.list.shift(); },
  update(dt) { for (const t of this.list) t.t -= dt; this.list = this.list.filter((t) => t.t > 0); },
  draw() {
    let y = Screen.vh - 60;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const t = this.list[i]; const a = Math.min(1, t.t / 0.4);
      const w = 22 + t.text.length * 4.2;
      Screen.ctx.globalAlpha = a;
      drawPanel(4, y, w, 18, { inner: false });
      if (t.item) Items.drawIconUI(t.item, 6, y + 1, 16);
      drawText(t.text, t.item ? 24 : 8, y + 5, { size: 6.5, color: "#fff" });
      Screen.ctx.globalAlpha = 1;
      y -= 21;
    }
  },
};

// ---- modal prompt (yes/no) ----
export const Prompt = {
  active: null, // {text, options:[...], sel, cb}
  ask(text, options, cb) { this.active = { text: text, options: options, sel: 0, cb: cb }; },
  update() {
    const a = this.active; if (!a) return;
    if (Input.justPressed("ArrowUp", "KeyW")) a.sel = (a.sel + a.options.length - 1) % a.options.length;
    if (Input.justPressed("ArrowDown", "KeyS")) a.sel = (a.sel + 1) % a.options.length;
    if (Input.justPressed("Escape")) { this.active = null; a.cb(-1); return; }
    if (Input.justPressed("Enter", "Space", "KeyE")) { this.active = null; a.cb(a.sel); return; }
    const r = this.rect(); const m = Input.mouse;
    for (let i = 0; i < a.options.length; i++) {
      const oy = r.y + r.th + 6 + i * 12;
      if (m.x >= r.x && m.x < r.x + r.w && m.y >= oy && m.y < oy + 12) { a.sel = i; if (m.pressed) { this.active = null; a.cb(i); return; } }
    }
  },
  rect() {
    const a = this.active; const w = 170;
    const lines = wrapText(a.text, w - 16, 7);
    const th = 8 + lines.length * 10;
    const h = th + 8 + a.options.length * 12 + 4;
    return { x: Math.floor((Screen.vw - w) / 2), y: Math.floor((Screen.vh - h) / 2), w: w, h: h, lines: lines, th: th };
  },
  draw() {
    const a = this.active; if (!a) return;
    const r = this.rect();
    drawPanel(r.x, r.y, r.w, r.h);
    r.lines.forEach((l, i) => drawText(l, r.x + 8, r.y + 6 + i * 10, { size: 7, color: "#fff" }));
    a.options.forEach((o, i) => {
      const oy = r.y + r.th + 6 + i * 12;
      if (i === a.sel) fillRect(r.x + 4, oy, r.w - 8, 11, "rgba(255,220,120,0.25)");
      drawText((i === a.sel ? "> " : "  ") + o, r.x + 10, oy + 2, { size: 7, color: i === a.sel ? "#ffe9a8" : "#e8dcc8" });
    });
  },
};
