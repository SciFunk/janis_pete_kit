// World: current map, entities, camera, map transitions, collision queries, and the small
// "services" other systems call (toast, say, sfx, prompts). One instance (exported).
import { Assets } from "../engine/assets.js";
import { Screen } from "../engine/screen.js";
import { Audio } from "../engine/audio.js";
import { GameMap } from "./map.js";
import { TS } from "./tileset.js";
import { Clock } from "../systems/time.js";
import { Weather } from "../systems/weather.js";
import { Toasts, Prompt } from "../ui/menu.js";
import { Dialogue } from "../ui/dialogue.js";

export const World = {
  map: null, maps: {}, defs: {},
  player: null, npcs: [], allNpcs: [], drops: [], effects: [],
  entities: [],               // extra y-sorted, updated things owned by a system (puzzle animals, drops)
  cam: { x: 0, y: 0 },
  fade: 0, fadeAnim: null,
  locks: 0,                   // >0 while UI/transitions own input
  hooks: { update: [], draw: [], drawFront: [], onMapChange: [], newDay: [] },
  shippingValue: 0, shipped: [],
  homeMap: "farmhouse",
  shakes: new Map(),

  async mapDef(id) {
    if (!this.defs[id]) this.defs[id] = await Assets.loadJson("data/maps/" + id + ".json");
    return this.defs[id];
  },

  async getMap(id) {
    if (!this.maps[id]) {
      const def = await this.mapDef(id);
      // editor edits (data/maps/edits/<id>.json): removed original props + added ones, kept apart
      // from the generated map so tools/build_maps.py can regenerate it
      if (!def.edits) {
        let ed = null;
        if (window.KIT) { try { ed = JSON.parse(localStorage.getItem("kit.edits." + id) || "null"); } catch (e) { ed = null; } }
        else { try { ed = await Assets.loadJson("data/maps/edits/" + id + ".json"); } catch (e) { /* none */ } }
        def.edits = ed || { added: [], removed: [] };
        for (const i of def.edits.removed) if (def.props && def.props[i]) def.props[i].removed = true;
        const ed2 = def.edits; ed2.tiles = ed2.tiles || []; ed2.paint = ed2.paint || []; ed2.floor = ed2.floor || []; ed2.wall = ed2.wall || [];
        // the editor can grow a map (edits.size): pad the terrain with void, then the tile edits fill it in
        if (ed2.size && (ed2.size[0] > def.w || ed2.size[1] > def.h)) {
          const nw = Math.max(def.w, ed2.size[0] | 0), nh = Math.max(def.h, ed2.size[1] | 0);
          def.terrain = def.terrain.map((r) => (r + "x".repeat(nw)).slice(0, nw));
          while (def.terrain.length < nh) def.terrain.push("x".repeat(nw));
          def.w = nw; def.h = nh;
        }
        for (const [x, y, ch] of ed2.tiles) { const row = def.terrain[y]; if (row !== undefined && x >= 0 && x < row.length) def.terrain[y] = row.slice(0, x) + ch + row.slice(x + 1); }
        if (ed2.music !== undefined) def.music = ed2.music;                      // the kit's song pick
        if (ed2.start) def.spawns = Object.assign({}, def.spawns, { start: ed2.start, bed: ed2.start });   // a starter layout moved the room
        def.layers = def.layers || {};
        if (ed2.door && def.indoor) {                                           // front door moved: exit warp + the painted door
          const [dx, dy] = ed2.door;
          if (def.warps && def.warps.length) { def.warps[0].x = dx; def.warps[0].y = dy; }
          def.layers.paint = (def.layers.paint || []).filter((t) => !(t[2] === "town_interiors" && (t[3] === 88 || t[3] === 120))).concat([[dx, dy, "town_interiors", 88, 0], [dx, dy + 1, "town_interiors", 120, 0]]);
        }
        def.layers.paint = (def.layers.paint || []).concat(ed2.paint); def.floorTiles = ed2.floor; def.wallTiles = ed2.wall;
      }
      if (def.tileset && def.tileset !== "outdoors" && !Assets.img[def.tileset]) await Assets.image(def.tileset, "assets/tilesets/" + def.tileset + ".png");
      // lazy-load any sprite sheet the map's props need
      const need = new Set();
      for (const inst of (def.props || []).concat(def.edits.added)) {
        const pd = Assets.data.props[inst.name]; const sh = inst.sheet || (pd && pd.sheet); if (sh && !Assets.img[sh]) need.add(sh);
        if (pd && pd.seasons) for (const k in pd.seasons) if (!Assets.img[pd.seasons[k]]) need.add(pd.seasons[k]);
      }
      for (const t of def.edits.paint) if (t[2] && !Assets.img[t[2]]) need.add(t[2]);
      for (const t of def.edits.floor.concat(def.edits.wall)) if (typeof t[2] === "string" && !Assets.img[t[2].split(":")[0]]) need.add(t[2].split(":")[0]);
      for (const f of [def.floor, def.wallpaper]) if (typeof f === "string" && !Assets.img[f.split(":")[0]]) need.add(f.split(":")[0]);
      if ((def.edits.floor.length || def.terrain.some((r) => r.indexOf("f") >= 0)) && !Assets.img.floors) need.add("floors");
      if ((def.edits.wall.length || def.terrain.some((r) => r.indexOf("W") >= 0)) && !Assets.img.walls) need.add("walls");
      await Promise.all([...need].map((sh) => this.loadSheet(sh)));
      this.maps[id] = new GameMap(def);
      for (const a of def.edits.added) { const p = this.maps[id].addProp(a.name, a); p.edit = a; }
      if (this.pendingMapState && this.pendingMapState[id]) { this.maps[id].applyState(this.pendingMapState[id]); delete this.pendingMapState[id]; }
    }
    return this.maps[id];
  },

  async loadSheet(name) {
    const isBuilding = /^(imp_|tree_|gen_house|witchy_|cabins_|logcabins_|plankcabins_|stonecabins_|neighborcabins_|farmhouses_|fountains$|well$|mill$|shipping_bin$|barn$|coop$|shed$|greenhouse$|witch_)/.test(name);
    const dirs = name.startsWith("animal_") ? ["animals"] : isBuilding ? ["buildings", "trees", "tilesets"] : ["tilesets", "buildings", "trees", "characters", "items", "animals", "ui"];
    for (const dir of dirs) {
      try { await Assets.image(name, "assets/" + dir + "/" + name + ".png"); return; } catch (e) { /* try next */ }
    }
    console.warn("no sheet found for", name);
  },

  // Immediate switch (no fade). tx/ty in tiles; player placed at bottom-center of that tile.
  async setMap(id, tx, ty, dir) {
    const m = await this.getMap(id);
    if (m.season !== Clock.seasonName) { m.season = Clock.seasonName; m.rebuildGround(); }
    this.map = m;
    if (this.player) {
      this.player.x = tx * TS + TS / 2; this.player.y = ty * TS + TS;
      if (dir !== undefined) this.player.dir = dir;
    }
    this.drops = []; this.effects = [];
    for (const h of this.hooks.onMapChange) h(m);
    if (m.music !== undefined) Audio.play(m.music ? "assets/music/" + m.music : null);
    this.updateCamera();
  },

  fadeTo(target, dur) {
    return new Promise((resolve) => { this.fadeAnim = { from: this.fade, to: target, t: 0, dur: dur, resolve: resolve }; });
  },

  // Fade out, switch, fade in.
  async goto(id, tx, ty, dir, viaDoor) {
    if (this.transitioning) return;
    this.transitioning = true; this.locks++;
    Audio.sfx("door");
    await this.fadeTo(1, 0.3);
    // leaving an interior: land just below the door of whichever building leads here, so buildings
    // can be moved or swapped (editor) without the interior's exit warp going stale
    // entering an interior through a door: arrive just above its exit warp, whatever the door said
    if (viaDoor && this.map && !this.map.indoor) {
      const target = await this.getMap(id);
      if (target.indoor) { const wp = target.warps.find((w) => w.to === this.map.id); if (wp) { tx = wp.x; ty = wp.y - 1; dir = 2; } }
    }
    if (this.map && this.map.indoor && this.map.warps.some((wp) => wp.to === id && wp.tx === tx && wp.ty === ty)) {   // only real exit warps, not teleports
      const target = await this.getMap(id);
      for (const p of target.props) {
        if (p.door && p.door.to === this.map.id) { const d = p.doorTile; if (d) { tx = d[0]; ty = d[1] + 1; dir = 0; } break; }
      }
    }
    await this.setMap(id, tx, ty, dir);
    await this.fadeTo(0, 0.3);
    this.locks--; this.transitioning = false;
  },

  inputLocked() { return this.locks > 0 || Dialogue.open || !!Prompt.active; },

  blocked(x, y, w, h, who) {
    if (this.map.rectBlocked(x, y, w, h)) return true;
    for (const n of this.npcs) {
      if (n === who || !n.solid) continue;
      const b = n.box(n.x, n.y);
      if (x < b[0] + b[2] && x + w > b[0] && y < b[1] + b[3] && y + h > b[1]) return true;
    }
    for (const e of this.entities) {
      if (e === who || !e.solid || !e.box) continue;
      const b = e.box(e.px, e.py);
      if (x < b[0] + b[2] && x + w > b[0] && y < b[1] + b[3] && y + h > b[1]) return true;
    }
    if (who !== this.player && this.player) {
      const b = this.player.box(this.player.x, this.player.y);
      if (x < b[0] + b[2] && x + w > b[0] && y < b[1] + b[3] && y + h > b[1]) return true;
    }
    return false;
  },

  // ---- services ----
  toast(text, itemId) { Toasts.add(text, itemId); },
  say(text, opts) { Dialogue.say(text, Object.assign({ playerName: this.player.displayName }, opts || {})); },
  ask(text, options, cb) { Prompt.ask(text, options, cb); },
  sfx(name) { Audio.sfx(name); },
  shake(prop, secs) { this.shakes.set(prop, secs); },
  askSleep() {
    this.ask("Go to sleep for the night?", ["Yes", "No"], (i) => { if (i === 0 && this.onSleep) this.onSleep(); });
  },
  openShipping() { if (this.onShip) this.onShip(); },
  openShop(kind) { if (this.onShop) this.onShop(kind); },
  openBoard() { if (this.onBoard) this.onBoard(); else this.say("Nothing posted yet."); },

  update(dt) {
    if (this.fadeAnim) {
      const f = this.fadeAnim; f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      this.fade = f.from + (f.to - f.from) * k;
      if (k >= 1) { this.fadeAnim = null; f.resolve(); }
    }
    Toasts.update(dt);
    if (Dialogue.open) { Dialogue.update(dt); return; }
    if (Prompt.active) { Prompt.update(); return; }
    if (!this.inputLocked()) Clock.update(dt);
    if (this.player) this.player.update(dt, this);
    for (const n of this.npcs) n.update(dt, this);
    for (const c of this.map.critters) c.update(dt, this);
    for (const e of this.entities) e.update(dt, this);
    for (const d of this.drops) d.update(dt, this);
    this.drops = this.drops.filter((d) => !d.dead);
    for (const [p, t] of this.shakes) { if (t - dt <= 0) this.shakes.delete(p); else this.shakes.set(p, t - dt); }
    Weather.update(dt, !this.map.indoor);
    for (const h of this.hooks.update) h(dt);
    // warps: player's feet tile
    if (this.player && !this.inputLocked()) {
      const wp = this.map.warpAt(this.player.tx, this.player.ty);
      if (wp) this.goto(wp.to, wp.tx, wp.ty, wp.dir);
    }
    this.updateCamera();
  },

  updateCamera() {
    if (this.freeCam) { this.cam.x = this.freeCam.x; this.cam.y = this.freeCam.y; return; }   // tools/map_shot.py
    // the editor's side panel covers the right 320 px: centre and clamp within what's left of the window
    const panel = window.Editor && window.Editor.active ? Math.ceil(320 / Screen.scale) : 0;
    const vw = Screen.vw - panel, vh = Screen.vh, mw = this.map.w * TS, mh = this.map.h * TS;
    let cx = this.player.x - vw / 2, cy = this.player.y - 16 - vh / 2;
    if (mw <= vw) cx = (mw - vw) / 2; else cx = Math.max(0, Math.min(mw - vw, cx));
    if (mh <= vh) cy = (mh - vh) / 2; else cy = Math.max(0, Math.min(mh - vh, cy));
    this.cam.x = Math.floor(cx); this.cam.y = Math.floor(cy);
  },

  draw() {
    const ctx = Screen.bctx, vw = Screen.vw, vh = Screen.vh, cx = this.cam.x, cy = this.cam.y;
    Screen.clear("#000");
    this.map.drawGround(ctx, cx, cy, vw, vh);
    for (const h of this.hooks.draw) h(ctx, this.map, cx, cy, vw, vh);     // ground-level systems (hoed dirt, crops)
    // y-sorted: props + characters + drops
    const list = [];
    for (const p of this.map.props) {
      if (p.px + p.sw < cx || p.py + p.sh < cy || p.px > cx + vw || p.py > cy + vh) continue;
      if (!p.solidRect && p.kind === "furniture") { p.draw(ctx, cx, cy); continue; }     // rugs and other walk-over things lie on the floor
      list.push(p);
    }
    for (const n of this.npcs) list.push(n);
    for (const c of this.map.critters) list.push(c);
    for (const e of this.entities) list.push(e);
    for (const d of this.drops) list.push(d);
    if (this.player && !window.__hidePlayer) list.push(this.player);
    list.sort((a, b) => a.baseY - b.baseY);
    for (const e of list) {
      const sh = this.shakes.get(e);
      if (sh) { const ox = Math.round(Math.sin(sh * 60) * 1.5); e.draw(ctx, cx - ox, cy); }
      else e.draw(ctx, cx, cy);
    }
    this.map.drawFront(ctx, cx, cy, vw, vh);
    for (const h of this.hooks.drawFront) h(ctx, this.map, cx, cy, vw, vh);
    Weather.draw(ctx, !this.map.indoor);
    // night
    if (!this.map.indoor) {
      const d = Clock.darkness();
      if (d > 0) { ctx.fillStyle = "rgba(8,10,50," + (d * 0.55).toFixed(3) + ")"; ctx.fillRect(0, 0, vw, vh); }
    }
    if (this.fade > 0) { ctx.fillStyle = "rgba(0,0,0," + this.fade.toFixed(3) + ")"; ctx.fillRect(0, 0, vw, vh); }
  },

  // ---- persistence of per-map state (removed props, farm tiles) ----
  saveMaps() {
    const out = {};
    for (const id in this.maps) out[id] = this.maps[id].saveState();
    return out;
  },
  loadMaps(d) { this.pendingMapState = d || {}; for (const id in this.maps) if (d && d[id]) this.maps[id].applyState(d[id]); },
};
