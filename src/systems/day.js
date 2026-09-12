// End-of-day pipeline: fade, advance clock, grow crops, restore energy, autosave, wake in bed.
import { Clock } from "./time.js";
import { Farming } from "./farming.js";
import { Weather } from "./weather.js";
import { Save } from "./save.js";

export const Day = {
  world: null, sleeping: false,
  init(world) { this.world = world; },

  // Called when the player goes to bed (or collapses at 2am).
  async endDay(collapsed) {
    if (this.sleeping) return;
    this.sleeping = true;
    const w = this.world;
    w.locks++;
    w.sfx("sleep");
    await w.fadeTo(1, 0.6);
    const p = w.player;
    // shipping bin payout
    if (w.shippingValue > 0) { p.gold += w.shippingValue; w.toast("Shipped goods sold for " + w.shippingValue + "g"); w.shippingValue = 0; w.shipped = []; }
    Clock.newDay();
    Weather.roll();
    for (const id in w.maps) Farming.newDay(w.maps[id], Weather.raining);
    p.energy = collapsed ? Math.floor(p.maxEnergy / 2) : p.maxEnergy;
    p.water = p.waterMax;
    w.drops = [];
    // wake up in bed
    const bedMap = w.homeMap || "farmhouse";
    const bm = await w.getMap(bedMap);
    const bed = bm.spawns.bed || [3, 5];
    // seasonal outfit
    if (String(p.sheet).startsWith("vivienne_")) {   // the default sprite has seasonal outfits; custom sheets don't
      const outfit = "vivienne_" + Clock.seasonName;
      try { await (await import("../engine/assets.js")).Assets.image(outfit, "assets/characters/" + outfit + ".png"); p.sheet = outfit; } catch (e) { /* keep current */ }
    }
    await w.setMap(bedMap, bed[0], bed[1] + 1, 0);
    for (const h of w.hooks.newDay) h();
    Save.write();
    await w.fadeTo(0, 0.7);
    w.locks--;
    this.sleeping = false;
  },
};
