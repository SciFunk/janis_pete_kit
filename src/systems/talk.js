// Dialogue selection rules (from the design notes):
//  * first meeting -> `intro`
//  * an NPC says today's line at most twice; after that they answer with an emote by friendship level
//  * today's line: a dated key (`spring_4`), else `rain` on rainy days, else the season pool, else
//    `friendly`/`reserved` generic pools; the random pick is fixed for the day
//  * higher friendship unlocks the `friendly` / `close` pools (mixed in at 3+ / 6+ hearts)
import { Clock } from "./time.js";
import { Weather } from "./weather.js";
import { Friendship } from "./friendship.js";
import { Items } from "./items.js";
import { Assets } from "../engine/assets.js";

const EMOTE = { dots: 40, happy: 32, music: 56, heart: 20, question: 8, sad: 28, exclaim: 16 };

function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

export const Talk = {
  lines: {},
  init(data) { this.lines = data; },

  pool(npc) {
    const L = this.lines[npc.id] || {}, G = this.lines._generic || {};
    const f = Friendship.get(npc.id), hearts = Friendship.hearts(npc.id);
    const dated = Clock.seasonName + "_" + Clock.day;
    if (!f.met && L.intro) return { key: "intro", lines: L.intro };
    if (L[dated]) return { key: dated, lines: L[dated] };
    if (Clock.dayIndex() < 7 && L.moving_in) return { key: "moving_in", lines: L.moving_in };
    if (Weather.raining && L.rain) return { key: "rain", lines: L.rain };
    let lines = [];
    if (L[Clock.seasonName]) lines = lines.concat(L[Clock.seasonName]);
    if (L.any) lines = lines.concat(L.any);
    if (hearts >= 3 && L.friendly) lines = lines.concat(L.friendly);
    if (hearts >= 6 && L.close) lines = lines.concat(L.close);
    if (!lines.length) lines = (npc.def.reserved ? G.reserved : G.friendly) || ["..."];
    return { key: "day", lines: lines };
  },

  todaysLine(npc) {
    const p = this.pool(npc);
    if (p.key === "intro") return p.lines.join("#$b#");
    const i = hashStr(npc.id + ":" + Clock.dayIndex() + ":" + p.key) % p.lines.length;
    return p.lines[i];
  },

  converse(world, npc) {
    if (world.quests && world.quests.tryDeliver(npc)) { Friendship.get(npc.id).met = true; return; }
    if (world.quests && world.quests.tryTalk(npc)) { Friendship.get(npc.id).met = true; Friendship.recordTalk(npc.id, Clock.dayIndex()); return; }
    const day = Clock.dayIndex();
    const before = Friendship.talkCount(npc.id, day);
    const wasMet = Friendship.get(npc.id).met;
    if (before >= 2 && wasMet) {
      const h = Friendship.hearts(npc.id);
      npc.showEmote(h >= 9 ? EMOTE.heart : h >= 6 ? EMOTE.music : h >= 3 ? EMOTE.happy : EMOTE.dots, 2.2);
      return;
    }
    const line = this.todaysLine(npc);
    Friendship.recordTalk(npc.id, day);
    npc.talking = true;
    world.say(line, { speaker: npc.def.name, portrait: this.portrait(npc), cb: () => { npc.talking = false; } });
  },

  portrait(npc) {
    return (x, y) => {
      const img = Assets.img[npc.sheet]; if (!img) return;
      const s = window.Screen ? window.Screen.scale : 1;
      const ctx = window.Screen.ctx;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, 16, 20, Math.round(x * s), Math.round(y * s), 32 * s, 40 * s);
    };
  },

  isGiftable(id) { const d = Items.get(id); return !!(d && d.type !== "tool"); },
  itemName(id) { return Items.name(id); },

  reaction(npc, itemId) {
    const d = npc.def, it = Items.get(itemId) || {};
    if ((d.loves || []).indexOf(itemId) >= 0) return "love";
    if ((d.hates || []).indexOf(itemId) >= 0) return "hate";
    if ((d.likes || []).indexOf(itemId) >= 0) return "like";
    if ((d.dislikes || []).indexOf(itemId) >= 0) return "dislike";
    // category-level tastes: e.g. likes: ["@crop"] / dislikes: ["@material"]
    if ((d.loves || []).indexOf("@" + it.type) >= 0) return "love";
    if ((d.likes || []).indexOf("@" + it.type) >= 0) return "like";
    if ((d.dislikes || []).indexOf("@" + it.type) >= 0) return "dislike";
    if ((d.hates || []).indexOf("@" + it.type) >= 0) return "hate";
    if (it.type === "material") return "dislike";
    return "neutral";
  },

  gift(world, npc, itemId) {
    const p = world.player;
    if (!p.inventory.remove(itemId, 1)) return;
    const r = this.reaction(npc, itemId);
    const pts = { love: 80, like: 45, neutral: 20, dislike: -20, hate: -40 }[r];
    Friendship.recordGift(npc.id, itemId, pts, r);
    const L = this.lines[npc.id] || {}, G = this.lines._generic || {};
    const line = L["gift_" + r] || G["gift_" + r] || "Thanks.";
    npc.showEmote(r === "love" ? EMOTE.heart : r === "like" ? EMOTE.happy : r === "neutral" ? EMOTE.dots : EMOTE.sad, 2.5);
    npc.talking = true;
    world.say(line.replace(/%item/g, Items.name(itemId)), { speaker: npc.def.name, portrait: this.portrait(npc), cb: () => { npc.talking = false; if (world.quests) world.quests.tryGift(npc, r); } });
  },
};
