// HUD: energy bar (bottom-right) and the date/time/gold box just left of it, above the hotbar's right end.
import { Screen } from "../engine/screen.js";
import { drawText, drawPanel, fillRect } from "./text.js";
import { Clock } from "../systems/time.js";
import { World } from "../world/world.js";

export function drawHud() {
  const vw = Screen.vw, vh = Screen.vh;
  const p = World.player;
  // clock box
  const bw = 78, bh = 40, bx = vw - bw - 22, by = vh - bh - 6;
  drawPanel(bx, by, bw, bh);
  const seasonName = Clock.seasonName.charAt(0).toUpperCase() + Clock.seasonName.slice(1);
  drawText(Clock.dateString() + "  " + seasonName, bx + 5, by + 4, { size: 6.5, color: "#f4e4c1" });
  drawText(Clock.timeString(), bx + 5, by + 14, { size: 9, bold: true, color: "#fff" });
  drawText(p.gold + "g", bx + 5, by + 28, { size: 7, color: "#ffd86b", bold: true });
  drawText(World.map.name, bx + bw - 5, by + 29, { size: 5.5, color: "#c9b48a", align: "right" });
  // energy
  const ew = 8, eh = 60, ex = vw - ew - 6, ey = vh - eh - 6;
  fillRect(ex - 1, ey - 1, ew + 2, eh + 2, "#3a2414");
  fillRect(ex, ey, ew, eh, "#1a120a");
  const frac = Math.max(0, p.energy / p.maxEnergy);
  const col = frac > 0.5 ? "#59c93b" : frac > 0.2 ? "#e0b830" : "#d9432e";
  fillRect(ex, ey + eh * (1 - frac), ew, eh * frac, col);
  drawText("E", ex + 1, ey - 8, { size: 6, color: "#fff" });
}
