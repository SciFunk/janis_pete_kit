// Notice-board quests: generated from game state, pointing at buildings/people that already exist.
// Quest: { id, type: "deliver"|"gather"|"visit"|"talk"|"gift", item, n, npc, map, reward, expires (dayIndex),
//          title, text, arrive, accepted, complete, completedDay }
//  deliver  bring n of item to npc (talk to them)        gather  bring n of item to the board
//  visit    go to map (the nudge: posted when a place hasn't been visited for a few days)
//  talk     talk to npc                                  gift    give npc something they like or love
// Flavour lines and tuning live in data/quests.json (Assets.data.quests).
import { Clock } from "./time.js";
import { Items } from "./items.js";
import { Farming } from "./farming.js";
import { Friendship } from "./friendship.js";
import { Assets } from "../engine/assets.js";

export const Quests = {
  world: null, list: [], lastGenDay: -1, done: 0, visits: {},
  init(world) {
    this.world = world;
    world.hooks.onMapChange.push((m) => { this.visits[m.id] = Clock.dayIndex(); this.tryVisit(m.id); });
  },
  cfg() { return Assets.data.quests || { stale_days: 3, first_nudge_day: 4, places: {}, talk: [], gift: [], rewards: {}, friendship: {} }; },
  npcById(id) { return this.world.allNpcs.find((n) => n.id === id); },
  npcName(id) { const n = this.npcById(id); return n ? n.def.name : id; },
  placeName(mid) { const d = this.world.defs && this.world.defs[mid]; return d ? d.name : (Assets.data.mapNames && Assets.data.mapNames[mid]) || mid; },

  active() { return this.list.filter((q) => q.accepted && !q.complete); },
  posted() { return this.list.filter((q) => !q.accepted && !q.complete); },

  newDay() {
    const day = Clock.dayIndex();
    this.list = this.list.filter((q) => q.complete ? q.completedDay >= day - 1 : q.expires >= day);
    this.nudge(day);
    let guard = 0;
    while (this.posted().length < 2 && guard++ < 4) this.generate(day);
    this.lastGenDay = day;
  },

  // the nudge: one quest at a time that sends the player to the place she has been away from longest.
  // A place counts as stale after cfg.stale_days without a visit; places never visited count from
  // cfg.first_nudge_day so the first days aren't a tour.
  nudge(day) {
    const c = this.cfg();
    if (this.list.some((q) => q.type === "visit" && !q.complete)) return null;
    const here = this.world.map ? this.world.map.id : null;
    let best = null, bestGap = -1;
    for (const mid in c.places) {
      if (mid === here) continue;
      const last = this.visits[mid];
      if (last === undefined && day < c.first_nudge_day) continue;
      const gap = last === undefined ? day : day - last;
      if (gap < c.stale_days) continue;
      if (gap > bestGap || (gap === bestGap && Math.random() < 0.5)) { best = mid; bestGap = gap; }
    }
    if (!best) return null;
    const pl = c.places[best], asker = this.npcById(pl.asker);
    const [lo, hi] = c.rewards.visit || [40, 90];
    const q = { type: "visit", map: best, npc: asker ? asker.id : null, reward: lo + Math.floor(Math.random() * (hi - lo + 1)), title: pl.title, text: pl.text, arrive: pl.arrive };
    return this.post(q, day, 5) ? q : null;
  },

  generate(day) {
    const c = this.cfg();
    const npcs = this.world.allNpcs.filter((n) => n.def && n.def.schedule && !n.def.shop);
    const rng = () => Math.random();
    const kinds = ["gather_material"];
    const seasonal = Object.keys(Farming.crops).filter((cid) => Farming.crops[cid].seasons.indexOf(Clock.seasonName) >= 0 && Items.get(Farming.crops[cid].seed) && Items.get(Farming.crops[cid].seed).buy);
    if (seasonal.length && npcs.length) kinds.push("deliver_crop");
    if (npcs.length) kinds.push("talk", "gift");
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
    } else if (kind === "talk") {
      const npc = npcs[Math.floor(rng() * npcs.length)], lines = c.talk.length ? c.talk : ["\"Come find me.\""];
      const [lo, hi] = c.rewards.talk || [30, 50];
      q = { type: "talk", npc: npc.id, reward: lo + Math.floor(rng() * (hi - lo + 1)), title: npc.def.name + " wants a word",
        text: lines[Math.floor(rng() * lines.length)] + " - " + npc.def.name };
    } else if (kind === "gift") {
      const npc = npcs[Math.floor(rng() * npcs.length)], lines = c.gift.length ? c.gift : ["\"Something nice would help.\""];
      const [lo, hi] = c.rewards.gift || [60, 100];
      q = { type: "gift", npc: npc.id, reward: lo + Math.floor(rng() * (hi - lo + 1)), title: npc.def.name + " could use cheering up",
        text: lines[Math.floor(rng() * lines.length)] + " Bring something they'd like. - " + npc.def.name };
    } else {
      const mats = [["wood", 25, 3], ["stone", 20, 3], ["fiber", 15, 2]];
      const [item, n, per] = mats[Math.floor(rng() * mats.length)];
      q = { type: "gather", item: item, n: n, npc: null, reward: n * per + 40,
        title: "Wanted: " + n + " " + Items.name(item),
        text: "The town needs " + n + " " + Items.name(item) + " for repairs. Bring them to the notice board." };
    }
    return this.post(q, day, 4 + Math.floor(rng() * 4));
  },

  post(q, day, days) {
    if (this.list.some((o) => !o.complete && (o.title === q.title || (q.npc && o.npc === q.npc && o.type === q.type)))) return false;   // no twin notices
    q.id = "q" + day + "_" + Math.floor(Math.random() * 1e6);
    q.expires = day + days; q.accepted = false; q.complete = false;
    this.list.push(q); return true;
  },

  accept(q) { q.accepted = true; this.world.toast("Quest accepted: " + q.title); },

  // what the HUD line says
  progress(q) {
    const inv = this.world.player.inventory;
    if (q.type === "deliver") return "Bring " + Math.min(inv.count(q.item), q.n) + "/" + q.n + " " + Items.name(q.item) + " to " + this.npcName(q.npc);
    if (q.type === "gather") return "Gather " + Math.min(inv.count(q.item), q.n) + "/" + q.n + " " + Items.name(q.item);
    if (q.type === "visit") return "Go to the " + this.placeName(q.map);
    if (q.type === "talk") return "Talk to " + this.npcName(q.npc);
    if (q.type === "gift") return "Give " + this.npcName(q.npc) + " something they'd like";
    return q.title;
  },
  ready(q) { return (q.type === "deliver" || q.type === "gather") && this.world.player.inventory.count(q.item) >= q.n; },

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
  // talking to the NPC a "talk" quest names completes it (instead of the normal greeting)
  tryTalk(npc) {
    for (const q of this.active()) {
      if (q.type !== "talk" || q.npc !== npc.id) continue;
      this.finish(q); Friendship.add(npc.id, this.cfg().friendship.talk || 40);
      this.world.say("There you are. That's all I wanted, really. Here, for the walk: " + q.reward + "g.", { speaker: npc.def.name });
      return true;
    }
    return false;
  },
  // a liked or loved gift completes a "gift" quest for that NPC (after the usual gift reaction)
  tryGift(npc, reaction) {
    if (reaction !== "love" && reaction !== "like") return false;
    for (const q of this.active()) {
      if (q.type !== "gift" || q.npc !== npc.id) continue;
      this.finish(q); Friendship.add(npc.id, this.cfg().friendship.gift || 30);
      this.world.toast("Quest complete: " + q.title + "  +" + q.reward + "g");
      return true;
    }
    return false;
  },
  // arriving on the map a "visit" quest names completes it
  tryVisit(mid) {
    for (const q of this.active()) {
      if (q.type !== "visit" || q.map !== mid) continue;
      this.finish(q); if (q.npc) Friendship.add(q.npc, this.cfg().friendship.visit || 30);
      this.world.toast((q.arrive || "Quest complete.") + "  +" + q.reward + "g");
      return true;
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

  save() { return { list: this.list, lastGenDay: this.lastGenDay, done: this.done, visits: this.visits }; },
  load(d) { if (d) { this.list = d.list || []; this.lastGenDay = d.lastGenDay; this.done = d.done || 0; this.visits = d.visits || {}; } },
};
