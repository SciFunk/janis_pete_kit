// Shipping bin: put sellable items in; paid out overnight.
import { Items } from "./items.js";
import { Settings } from "./settings.js";
import { Confirm } from "../ui/settings.js";
import { Input } from "../engine/input.js";
import { Screen } from "../engine/screen.js";
import { drawText, drawPanel, fillRect } from "../ui/text.js";
import { drawSlot, SLOT, PAD } from "../ui/hotbar.js";
import { ROW } from "./inventory.js";

export const Shipping = {
  world: null, isOpen: false, hover: -1,
  init(world) {
    this.world = world;
    world.hooks.update.push(() => { if (this.isOpen) this.update(); });
  },
  open() { this.isOpen = true; this.justOpened = true; this.skipConfirm = false; this.world.locks++; },
  close() { this.isOpen = false; this.world.locks--; },

  rect() {
    const inv = this.world.player.inventory, rows = Math.ceil(inv.slots.length / ROW);
    const w = ROW * (SLOT + PAD) + PAD * 2 + 8, h = rows * (SLOT + PAD) + 60;
    return { x: Math.floor((Screen.vw - w) / 2), y: Math.floor((Screen.vh - h) / 2), w: w, h: h, rows: rows };
  },
  slotAt(mx, my) {
    const r = this.rect(), inv = this.world.player.inventory;
    const x0 = r.x + 4 + PAD, y0 = r.y + 44;
    const c = Math.floor((mx - x0) / (SLOT + PAD)), rr = Math.floor((my - y0) / (SLOT + PAD));
    if (c < 0 || c >= ROW || rr < 0 || rr >= r.rows) return -1;
    const i = rr * ROW + c; return i < inv.slots.length ? i : -1;
  },
  update() {
    if (this.justOpened) { this.justOpened = false; return; }
    if (Confirm.update()) return;
    if (Input.justPressed("Escape", "KeyE", "Tab", "Space")) { this.close(); return; }
    const m = Input.mouse, inv = this.world.player.inventory;
    this.hover = this.slotAt(m.x, m.y);
    if ((m.pressed || m.rpressed) && this.hover >= 0) {
      const s = inv.slots[this.hover]; if (!s) return;
      const d = Items.get(s.id);
      if (!d || !d.sell || d.type === "tool") { this.world.toast("Can't ship that"); return; }
      const n = m.rpressed ? 1 : s.n, slot = this.hover;
      const act = () => {
        const cur = inv.slots[slot]; if (!cur || cur.id !== s.id) return;
        const t = inv.take(slot, Math.min(n, cur.n));
        this.world.shippingValue += d.sell * t.n;
        this.world.shipped.push([t.id, t.n]);
      };
      if (this.skipConfirm || !Settings.shouldConfirm("shipping")) act();
      else Confirm.ask("Ship " + Items.name(s.id) + " x" + n + " for " + d.sell * n + "g (paid overnight)?", act, { owner: this });
    }
  },
  draw() {
    if (!this.isOpen) return;
    const r = this.rect(), inv = this.world.player.inventory;
    fillRect(0, 0, Screen.vw, Screen.vh, "rgba(0,0,0,0.45)");
    drawPanel(r.x, r.y, r.w, r.h);
    drawText("Shipping bin", r.x + 8, r.y + 6, { size: 8, bold: true, color: "#f4e4c1" });
    drawText("Click an item to ship it (right-click: one). Paid out tonight.", r.x + 8, r.y + 18, { size: 5.5, color: "#e8dcc8" });
    drawText("In the bin: " + this.world.shippingValue + "g", r.x + 8, r.y + 29, { size: 7, bold: true, color: "#ffd86b" });
    const x0 = r.x + 4 + PAD, y0 = r.y + 44;
    for (let i = 0; i < inv.slots.length; i++) {
      const x = x0 + (i % ROW) * (SLOT + PAD), y = y0 + Math.floor(i / ROW) * (SLOT + PAD);
      drawSlot(x, y, inv.slots[i], false);
      if (i === this.hover) fillRect(x, y, SLOT, SLOT, "rgba(255,255,255,0.18)");
    }
    if (this.hover >= 0 && inv.slots[this.hover]) {
      const s = inv.slots[this.hover], d = Items.get(s.id);
      drawText(Items.name(s.id) + (d && d.sell ? "  " + d.sell + "g each" : ""), r.x + 8, r.y + r.h - 12, { size: 6.5, color: "#fff" });
    }
    Confirm.draw();
    if (false) {
    }
    drawText("Esc to close", r.x + r.w - 8, r.y + r.h - 12, { size: 5.5, align: "right", color: "#c9b48a" });
  },
};
