// Hotbar (12 slots, bottom center) + item-name toast.
import { Screen } from "../engine/screen.js";
import { Input } from "../engine/input.js";
import { drawText, drawPanel, fillRect } from "./text.js";
import { Items } from "../systems/items.js";
import { ROW } from "../systems/inventory.js";

export const SLOT = 20, PAD = 2;

export function hotbarRect() {
  const w = ROW * (SLOT + PAD) + PAD * 2, h = SLOT + PAD * 3;
  return { x: Math.floor((Screen.vw - w) / 2), y: Screen.vh - h - 2, w: w, h: h };
}

export function drawSlot(x, y, slot, selected) {
  fillRect(x, y, SLOT, SLOT, selected ? "#f3d67a" : "#8a5a2b");
  fillRect(x + 1, y + 1, SLOT - 2, SLOT - 2, selected ? "#c98d3c" : "#5c3a1c");
  if (slot) {
    Items.drawIconUI(slot.id, x + 2, y + 2, 16);
    if (slot.n > 1) drawText(String(slot.n), x + SLOT - 1, y + SLOT - 8, { size: 5.5, align: "right", color: "#fff", bold: true });
  }
}

export function drawHotbar(inv) {
  const r = hotbarRect();
  drawPanel(r.x, r.y, r.w, r.h, { inner: false });
  for (let i = 0; i < ROW; i++) {
    const x = r.x + PAD + i * (SLOT + PAD), y = r.y + PAD;
    drawSlot(x, y, inv.slots[i], i === inv.selected);
    const label = i === 9 ? "0" : i === 10 ? "-" : i === 11 ? "=" : String(i + 1);
    drawText(label, x + 1, y - 1, { size: 4.5, color: "#f4e4c1" });
  }
  const sel = inv.selectedSlot;
  if (sel) {
    const d = Items.get(sel.id);
    let name = Items.name(sel.id);
    if (d && d.tool === "can") name += "  (" + (window.World.player.water) + "/" + window.World.player.waterMax + ")";
    drawText(name, Screen.vw / 2, r.y - 10, { size: 6.5, align: "center", color: "#fff", bold: true });
  }
}

// hotbar input: number keys + wheel; returns true if consumed a click on the bar
export function hotbarInput(inv) {
  const keys = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0", "Minus", "Equal"];
  for (let i = 0; i < keys.length; i++) if (Input.justPressed(keys[i])) inv.select(i);
  if (Input.mouse.wheel) inv.cycle(Input.mouse.wheel > 0 ? 1 : -1);
  const r = hotbarRect(), m = Input.mouse;
  if (m.x >= r.x && m.y >= r.y && m.x < r.x + r.w && m.y < r.y + r.h) {
    if (m.pressed) { const i = Math.floor((m.x - r.x - PAD) / (SLOT + PAD)); if (i >= 0 && i < ROW) inv.select(i); }
    return true;
  }
  return false;
}
