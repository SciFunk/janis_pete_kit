// Notice-board quests: generated from game state, pointing at buildings/people that already exist.
// Quest: { id, type: "deliver"|"gather", item, n, npc (deliver), reward, expires (dayIndex), title, text, accepted }
import { Clock } from "./time.js";
import { Items } from "./items.js";
import { Farming } from "./farming.js";
import { Friendship } from "./friendship.js";

export const Quests = {
  world: null, list: [], lastGenDay: -1, done: 0,
  init(world) { this.world = world; },

  active() { return this.list.filter((q) => q.accepted && !q.complete); },
  posted() { return this.list.filter((q) => !q.accepted && !q.complete); },

  newDay() {
    const day = Clock.dayIndex();
    this.list = this.list.filter((q) => q.complete ? q.completedDay >= day - 1 : q.expires >= day);
    if (this.posted().length < 2) this.generate(day);
    this.lastGenDay = day;
  },

  generate(day) {
    const npcs = this.world.allNpcs.filter((n) => n.def && n.def.schedule && !n.def.shop);
    const rng = () => Math.random();
    const kinds = [];
    // deliver a crop that's in season
    const seasonal = Object.keys(Farming.crops).filter((c) => Farming.crops[c].seasons.indexOf(Clock.seasonName) >= 0 && Items.get(Farming.crops[c].seed) && Items.get(Farming.crops[c].seed).buy);
    if (seasonal.length && npcs.length) kinds.push("deliver_crop");
    kinds.push("gather_material");
    const kind = kinds[Math.floor(rng() * kinds.length)];
    let q;
    if (kind === "deliver_crop") {
      const npc = npcs[Math.floor(rng() * npcs.length)];
      const cid = seasonal[Math.floor(rng() * seasonal.length)];
      const item = Farming.crops[cid].harvest, n = 2 + Math.floor(rng() * 4);
      const value = (Items.get(item).sell || 20) * n;
      q = { type: "deliver", item: item, n: n, npc: npc.id, reward: Math.round(value * 1.6 + 60),
        title: npc.def.name + " wants " + Items.name(item),
        text: "\"Could someone bring me " + n + " " + Items.name(item) + "? I'll pay well.\" - " + npc.def.name };
    } else {
      const mats = [["wood", 25, 3], ["stone", 20, 3], ["fiber", 15, 2]];
      const [item, n, per] = mats[Math.floor(rng() * mats.length)];
      q = { type: "gather", item: item, n: n, npc: null, reward: n * per + 40,
        title: "Wanted: " + n + " " + Items.name(item),
        text: "The town needs " + n + " " + Items.name(item) + " for repairs. Bring them to the notice board." };
    }
    if (this.list.some((o) => !o.complete && o.title === q.title)) { // don't post the same notice twice
      if (!this._retried) { this._retried = true; this.generate(day); this._retried = false; }
      return;
    }
    q.id = "q" + day + "_" + Math.floor(rng() * 1e6);
    q.expires = day + 4 + Math.floor(rng() * 4);
    q.accepted = false; q.complete = false;
    this.list.push(q);
  },

  accept(q) { q.accepted = true; this.world.toast("Quest accepted: " + q.title); },

  // try to complete deliver quests for this NPC; returns true if one completed
  tryDeliver(npc) {
    const p = this.world.player;
    for (const q of this.active()) {
      if (q.type !== "deliver" || q.npc !== npc.id) continue;
      if (p.inventory.has(q.item, q.n)) {
        p.inventory.remove(q.item, q.n);
        this.finish(q);
        Friendship.add(npc.id, 60);
        this.world.say("Oh, the " + Items.name(q.item) + "! Thank you so much. Here, " + q.reward + "g for your trouble.", { speaker: npc.def.name });
        return true;
      }
    }
    return false;
  },

  // gather quests are handed in at the board
  tryHandIn() {
    const p = this.world.player;
    for (const q of this.active()) {
      if (q.type !== "gather") continue;
      if (p.inventory.has(q.item, q.n)) { p.inventory.remove(q.item, q.n); this.finish(q); this.world.toast("Quest complete! +" + q.reward + "g"); return true; }
    }
    return false;
  },

  finish(q) { q.complete = true; q.completedDay = Clock.dayIndex(); this.world.player.gold += q.reward; this.done += 1; },

  save() { return { list: this.list, lastGenDay: this.lastGenDay, done: this.done }; },
  load(d) { if (d) { this.list = d.list || []; this.lastGenDay = d.lastGenDay; this.done = d.done || 0; } },
};
