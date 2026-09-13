// Player verbs: use the selected tool/item on a tile, or interact with what's in front of you.
import { Items } from "./items.js";
import { Farming } from "./farming.js";
import { Drop } from "../entities/drop.js";
import { TS } from "../world/tileset.js";
import { Clock } from "./time.js";
import { Puzzle } from "./puzzle.js";

const TOOL_ENERGY = 2;

export const Actions = {
  world: null,
  init(world) { this.world = world; },

  spawnDrops(drops, tx, ty) {
    for (const id in drops) {
      let n = drops[id];
      for (let i = 0; i < n; i++) this.world.drops.push(new Drop(id, 1, tx * TS + 8, ty * TS + 8));
    }
  },

  // Which tile a tool/interaction targets: the mouse tile if it's within 1 tile of the player,
  // otherwise the tile the player faces.
  targetTile(mouse) {
    const p = this.world.player;
    if (mouse) {
      const mx = Math.floor((mouse.x + this.world.cam.x) / TS), my = Math.floor((mouse.y + this.world.cam.y) / TS);
      if (Math.abs(mx - p.tx) <= 1 && Math.abs(my - p.ty) <= 1) { if (mx !== p.tx || my !== p.ty) p.faceToward(mx, my); return [mx, my]; }
    }
    return p.facingTile();
  },

  useSelected(mouse) {
    const w = this.world, p = w.player, map = w.map;
    const id = p.inventory.selectedId;
    const def = id ? Items.get(id) : null;
    const [tx, ty] = this.targetTile(mouse);
    if (!def) return this.interactAt(tx, ty);
    if (def.type === "tool") return this.useTool(def.tool, tx, ty);
    if (Puzzle.active && Puzzle.useItem(id, tx, ty)) return true;     // cave rooms: drop / throw the item
    if (def.type === "seed") {
      if (Farming.canPlant(map, tx, ty, def.crop)) {
        Farming.plant(map, tx, ty, def.crop); p.inventory.remove(id, 1); w.sfx("plant");
        return true;
      }
      const t = Farming.tile(map, tx, ty);
      if (t && !t.crop) w.toast("Not in season");
      return this.interactAt(tx, ty);
    }
    if (def.edible) {
      if (p.energy < p.maxEnergy) { p.energy = Math.min(p.maxEnergy, p.energy + def.edible); p.inventory.remove(id, 1); w.toast("Ate " + def.name); }
      return true;
    }
    return this.interactAt(tx, ty);
  },

  useTool(tool, tx, ty) {
    const w = this.world, p = w.player, map = w.map;
    if (p.energy <= 0) { w.toast("Too tired..."); return false; }
    p.busy = 0.32; p.toolAnim = { tool: tool, t: 0.32, tx: tx, ty: ty };
    const prop = map.propAt(tx, ty);
    let did = false;
    if (prop && prop.def.tool === tool && prop.hp > 0) {
      prop.hp -= 1; did = true;
      w.shake(prop, 0.25);
      if (prop.hp <= 0) { map.removeProp(prop); this.spawnDrops(prop.def.drops || {}, tx, ty); w.sfx("break"); }
      else w.sfx("hit");
    } else if (tool === "hoe") {
      if (Farming.till(map, tx, ty)) { did = true; w.sfx("hoe"); }
    } else if (tool === "can") {
      if (map.t(tx, ty) === 119) { p.water = p.waterMax; w.toast("Refilled watering can"); return true; }
      if (p.water <= 0) { w.toast("Watering can is empty"); return false; }
      if (Farming.water(map, tx, ty)) { did = true; p.water -= 1; w.sfx("water"); }
    } else if (tool === "pickaxe") {
      if (Farming.unTill(map, tx, ty)) did = true;
    } else if (tool === "scythe") {
      const t = Farming.tile(map, tx, ty);
      if (t && t.crop) {
        const c = Farming.crops[t.crop.id];
        if (t.crop.dead) { Farming.clearCrop(map, tx, ty); did = true; }
        else if (c.scythe && Farming.isHarvestable(t.crop)) { const h = Farming.harvest(map, tx, ty); this.spawnDrops({ [h.id]: h.n }, tx, ty); did = true; }
      }
      return true; // scythe costs no energy
    }
    if (did) p.energy -= TOOL_ENERGY;
    return did;
  },

  // Space/E/right-click: talk, harvest, pick up, enter, use
  interact() {
    const p = this.world.player;
    const [tx, ty] = p.facingTile();
    return this.interactAt(tx, ty);
  },

  interactAt(tx, ty) {
    const w = this.world, p = w.player, map = w.map;
    if (Puzzle.active && Puzzle.interact(tx, ty)) return true;       // animals, levers, drops, release
    // NPC in front?
    for (const n of w.npcs) {
      const near = (n.tx === tx && n.ty === ty) || Math.hypot(n.x - (tx * TS + 8), n.y - (ty * TS + 16)) < 20;
      if (!near) continue;
      if (n.talk) { n.talk(w); return true; }
      if (n.interact) { n.interact(w); return true; }
    }
    // crop harvest
    const t = Farming.tile(map, tx, ty);
    if (t && t.crop && Farming.isHarvestable(t.crop) && !Farming.crops[t.crop.id].scythe) {
      const h = Farming.harvest(map, tx, ty);
      if (p.inventory.canAdd(h.id, h.n)) { p.inventory.add(h.id, h.n); w.toast(Items.name(h.id) + (h.n > 1 ? " x" + h.n : ""), h.id); w.sfx("harvest"); }
      else this.spawnDrops({ [h.id]: h.n }, tx, ty);
      return true;
    }
    // prop with an interaction
    const prop = map.propAt(tx, ty);
    if (prop && prop.def.interact) {
      const kind = prop.def.interact;
      if (kind === "sleep") { w.askSleep(); return true; }
      if (kind === "ship") { w.openShipping(); return true; }
      if (kind === "shop") {
        const which = prop.shop || prop.def.shop || "general";
        if (which === "general") {                       // Fresh Finds: mornings till noon, then again from an hour before dusk
          const m = Clock.minutes, reopen = Clock.duskStart - 60;
          if (m >= 12 * 60 && m < reopen) { w.say("Fig has the shutters down. \"Back at " + Clock.hm(reopen) + ". Come by in the morning, or after.\""); return true; }
        }
        w.openShop(which); return true;
      }
      if (kind === "sign") { w.say(prop.note || "..."); return true; }
      if (kind === "board") { w.openBoard(); return true; }
    }
    if (prop && prop.door && prop.doorTile && prop.doorTile[0] === tx && prop.doorTile[1] === ty) {
      w.goto(prop.door.to, prop.door.tx, prop.door.ty, prop.door.dir, true); return true;
    }
    if (prop && prop.note) { w.say(prop.note); return true; }   // a building/prop with a description
    return false;
  },
};
