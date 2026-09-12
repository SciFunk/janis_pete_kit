// In-game editor (F6). A DOM side panel with five brushes:
//   Props     every prop in data/props.json; click a tile to place, right-click a prop to remove,
//             X toggles whether the hovered prop blocks walking
//   Terrain   paint the ground chars (grass, dirt, water, plaza, void, floor, wall); autotiling
//             follows the change
//   Tile      stamp any 16x16 tile from any sheet on top of the ground (optionally solid);
//             right-click erases a stamped tile
//   Floor / Wallpaper   per-tile floor pattern / wallpaper for interiors
// Everything is kept per map in data/maps/edits/<map>.json ({added, removed, tiles, paint, floor,
// wall}) which World.getMap applies on top of the generated map, so tools/build_maps.py can keep
// regenerating the base maps. Saving needs the dev server (play.bat).
import { Screen } from "../engine/screen.js";
import { Input } from "../engine/input.js";
import { Assets } from "../engine/assets.js";

// furniture categories, in dropdown order (keys match tools/furniture_cats.py)
const CATS = [["beds", "Beds"], ["seats", "Chairs & sofas"], ["tables", "Tables & desks"], ["storage", "Shelves & cabinets"], ["kitchen", "Kitchen"], ["bathroom", "Bathroom"], ["lamps", "Lamps & candles"], ["fireplaces", "Fireplaces"], ["rugs", "Rugs"], ["wall", "Wall art & windows"], ["plants", "Plants & flowers"], ["screens", "TVs, music & games"], ["statues", "Statues & toys"], ["pets", "Pets & fish"], ["machines", "Machines"], ["shop", "Shop counters"], ["outdoor", "Garden & outdoor"], ["decor", "Little things"], ["structure", "Doors, stairs & walls"]];
import { TS } from "../world/tileset.js";

const TERRAIN = [["g", "grass"], ["d", "dirt"], ["w", "water"], ["p", "plaza stone"], ["x", "void"], ["f", "floor (interior)"], ["W", "wall (interior)"]];

export const Editor = {
  active: false, world: null, panel: null, list: null, sel: null, hover: null, dirty: false,
  filter: "", kind: "all", mode: "props", terrain: "g", tileSheet: "outdoors_spring", tileIdx: 0, tileSolid: false,
  floorIdx: 0, wallIdx: 0, floorSheet: "floors", wallSheet: "walls", lastPaint: null, index: null,
  brush: 1, set: "all", cat: "all", listEnts: [], listPos: 0,

  init(world) { this.world = world; },

  toggle() {
    this.active = !this.active;
    if (this.active) { this.buildPanel(); this.panel.style.display = "flex"; this.setMode(this.mode); if (window.KIT && !Screen.forceScale) this.zoomFit(); }
    else if (this.panel) this.panel.style.display = "none";
  },

  // ---------------------------------------------------------------- DOM panel
  buildPanel() {
    if (this.panel) return;
    const p = document.createElement("div"); p.id = "editor";
    p.style.cssText = "position:fixed;right:0;top:0;bottom:0;width:320px;background:#1f170f;color:#f0e6d2;font:12px 'Segoe UI',sans-serif;display:flex;flex-direction:column;border-left:2px solid #5a3f2a;z-index:10";
    p.innerHTML = `
      <div style="padding:8px;border-bottom:1px solid #5a3f2a">
        <b style="color:#ffd86b">Editor</b> <span id="ed-map" style="color:#a09080"></span>
        <div style="margin-top:6px;display:flex;gap:3px;flex-wrap:wrap" id="ed-modes"></div>
        <div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap">
          <button id="ed-save">Save (F7)</button><button id="ed-revert">Reload map</button><button id="ed-close">Close (F6)</button>
          <button id="ed-zoomout" title="zoom out">&minus;</button><button id="ed-zoomin" title="zoom in">+</button>
        </div>
        <div id="ed-status" style="color:#9fd88a;min-height:14px;margin-top:4px"></div>
        <div id="ed-help" style="color:#a09080;margin-top:4px"></div>
      </div>
      <div id="ed-tools" style="padding:6px;border-bottom:1px solid #5a3f2a"></div>
      <div id="ed-list" style="flex:1;overflow:auto;display:flex;flex-wrap:wrap;gap:3px;padding:6px;align-content:flex-start"></div>
      <div id="ed-info" style="padding:6px;border-top:1px solid #5a3f2a;color:#c9b48a;min-height:30px"></div>`;
    document.body.appendChild(p);
    const modes = p.querySelector("#ed-modes");
    const modeList = window.KIT ? [["props", "Furniture"], ["floor", "Floor"], ["wall", "Wallpaper"]] : [["props", "Props"], ["terrain", "Terrain"], ["tile", "Tile"], ["floor", "Floor"], ["wall", "Wallpaper"]];
    for (const [m, label] of modeList) {
      const b = document.createElement("button"); b.textContent = label; b.dataset.mode = m; b.onclick = () => this.setMode(m); modes.appendChild(b);
    }
    p.querySelectorAll("button").forEach((b) => { b.style.cssText = "background:#3a2a1c;color:#f0e6d2;border:1px solid #8a5a2b;padding:2px 6px;cursor:pointer"; });
    p.querySelector("#ed-save").onclick = () => this.save();
    p.querySelector("#ed-revert").onclick = () => this.reload();
    p.querySelector("#ed-close").onclick = () => this.toggle();
    p.querySelector("#ed-zoomout").onclick = () => this.zoom(-1);
    p.querySelector("#ed-zoomin").onclick = () => this.zoom(1);
    p.addEventListener("keydown", (e) => e.stopPropagation());
    p.addEventListener("keyup", (e) => e.stopPropagation());
    p.addEventListener("contextmenu", (e) => e.preventDefault());
    this.panel = p; this.list = p.querySelector("#ed-list");
    this.list.addEventListener("scroll", () => { if (this.mode === "props" && this.list.scrollTop + this.list.clientHeight > this.list.scrollHeight - 200) this.renderMore(); });
  },

  status(t) { if (this.panel) this.panel.querySelector("#ed-status").textContent = t; },
  info(t) { if (this.panel) this.panel.querySelector("#ed-info").textContent = t; },
  btn(label, on, cb) { const b = document.createElement("button"); b.textContent = label; b.style.cssText = "background:" + (on ? "#8a5a2b" : "#3a2a1c") + ";color:#f0e6d2;border:1px solid #8a5a2b;padding:2px 6px;cursor:pointer"; b.onclick = cb; return b; },

  async setMode(m) {
    this.mode = m; this.sel = null; this.lastPaint = null;
    this.panel.querySelectorAll("#ed-modes button").forEach((b) => { b.style.background = b.dataset.mode === m ? "#8a5a2b" : "#3a2a1c"; });
    const tools = this.panel.querySelector("#ed-tools"), help = this.panel.querySelector("#ed-help"); tools.innerHTML = ""; this.list.innerHTML = "";
    this.refreshHeader();
    if (m === "props") {
      help.textContent = window.KIT ? "Click a picture, then click the floor to place it. Right click removes. X over a rug makes it walkable. Esc deselects." : "Left click: place (or, with nothing selected, inspect a prop: id / note / door) · Right click: remove · X: toggle walkable · S: swap hovered building's sprite for the selected one (keeps its door) · N: new interior for hovered building · Esc: deselect.";
      const f = document.createElement("input"); f.placeholder = "search (e.g. chair, elle, tanga)"; f.value = this.filter; f.style.cssText = "width:60%;background:#3a2a1c;color:#f0e6d2;border:1px solid #8a5a2b;padding:3px";
      f.oninput = (e) => { this.filter = e.target.value.toLowerCase(); this.refreshList(); };
      const k = document.createElement("select"); k.style.cssText = "background:#3a2a1c;color:#f0e6d2;border:1px solid #8a5a2b";
      if (window.KIT && this.kind === "all") this.kind = "furniture";      // a design kit is a house: furniture only
      for (const o of (window.KIT ? ["furniture"] : ["all", "furniture", "building", "tree", "animal", "prop", "debris"])) { const op = document.createElement("option"); op.value = o; op.textContent = o; if (o === this.kind) op.selected = true; k.appendChild(op); }
      k.onchange = (e) => { this.kind = e.target.value; this.refreshList(); };
      const ct = document.createElement("select"); ct.style.cssText = "background:#3a2a1c;color:#f0e6d2;border:1px solid #8a5a2b;max-width:170px"; ct.title = "what kind of thing";
      for (const [key, label] of [["all", "everything"]].concat(this.cats())) { const op = document.createElement("option"); op.value = key; op.textContent = label; if (key === this.cat) op.selected = true; ct.appendChild(op); }
      ct.onchange = (e) => { this.cat = e.target.value; this.refreshList(); };
      if (window.KIT) { tools.append(f, " ", ct); }
      else {
        const st = document.createElement("select"); st.style.cssText = "background:#3a2a1c;color:#f0e6d2;border:1px solid #8a5a2b;max-width:150px"; st.title = "furniture pack";
        for (const [key, label] of [["all", "every pack"]].concat(this.sets())) { const op = document.createElement("option"); op.value = key; op.textContent = label; if (key === this.set) op.selected = true; st.appendChild(op); }
        st.onchange = (e) => { this.set = e.target.value; this.refreshList(); };
        tools.append(f, " ", k, " ", ct, " ", st);
      }
      this.refreshList();
    } else if (m === "terrain") {
      help.textContent = "Click / drag to paint the ground. Edges and shores re-autotile as you go.";
      for (const [ch, label] of TERRAIN) tools.appendChild(this.btn(label, this.terrain === ch, () => { this.terrain = ch; this.setMode("terrain"); }));
      this.info("brush: " + this.terrain);
    } else if (m === "tile") {
      help.textContent = "Pick a sheet, click a tile in it, then click / drag on the map. Right-click erases a stamped tile.";
      if (!this.index) { try { this.index = await Assets.loadJson("data/asset_index.json"); } catch (e) { this.index = []; } }
      const sel = document.createElement("select"); sel.style.cssText = "max-width:200px;background:#3a2a1c;color:#f0e6d2;border:1px solid #8a5a2b";
      const keys = this.index.filter((e) => e.folder === "tilesets" || e.folder === "items").map((e) => e.name);
      for (const kk of keys) { const op = document.createElement("option"); op.value = kk; op.textContent = kk; if (kk === this.tileSheet) op.selected = true; sel.appendChild(op); }
      sel.onchange = (e) => { this.tileSheet = e.target.value; this.tileIdx = 0; this.showSheet(); };
      const solid = document.createElement("label"); solid.style.marginLeft = "8px"; const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = this.tileSolid; cb.onchange = (e) => { this.tileSolid = e.target.checked; };
      solid.append(cb, " blocks walking");
      tools.append(sel, solid); this.showSheet();
    } else if (m === "floor" || m === "wall") {
      help.textContent = m === "floor" ? "Pick a floor pattern, then click / drag on the floor. Brush = how many tiles at once; Fill does the whole room." : "Pick a wallpaper, then click / drag on the walls. Brush = how many tiles at once; Fill does the whole room.";
      await this.showPatterns(m);
      const bs = document.createElement("select"); bs.style.cssText = "background:#3a2a1c;color:#f0e6d2;border:1px solid #8a5a2b;margin-left:6px"; bs.title = "brush size";
      for (const n of [1, 2, 3, 4]) { const op = document.createElement("option"); op.value = n; op.textContent = "brush " + n + "x" + n; if (n === this.brush) op.selected = true; bs.appendChild(op); }
      bs.onchange = (e) => { this.brush = +e.target.value; };
      tools.append(bs, " ", this.btn("Fill the whole room", false, () => this.fillRoom(m)));
    }
  },

  // sheet picker for the Tile brush: the whole sheet at 1x in the scrolling list area
  async showSheet() {
    this.list.innerHTML = ""; const key = this.tileSheet;
    if (!Assets.img[key]) { this.status("loading " + key + "…"); await this.world.loadSheet(key); this.status(""); }
    const img = Assets.img[key]; if (!img) { this.status("no sheet " + key); return; }
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; c.style.cssText = "image-rendering:pixelated;cursor:crosshair;background:#3a2a1c";
    const g = c.getContext("2d"); g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0);
    const cols = Math.floor(img.width / TS);
    const mark = () => { g.clearRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0); g.strokeStyle = "#ffd86b"; g.lineWidth = 1; g.strokeRect((this.tileIdx % cols) * TS + 0.5, Math.floor(this.tileIdx / cols) * TS + 0.5, TS - 1, TS - 1); };
    c.onclick = (e) => { const r = c.getBoundingClientRect(); const tx = Math.floor((e.clientX - r.left) / TS), ty = Math.floor((e.clientY - r.top) / TS); this.tileIdx = ty * cols + tx; mark(); this.info(key + " tile " + this.tileIdx + " (" + tx + "," + ty + ")"); };
    mark(); this.list.appendChild(c); this.info(key + " tile " + this.tileIdx);
  },

  async showPatterns(m) {
    this.list.innerHTML = "";
    if (!this.index) { try { this.index = await Assets.loadJson("data/asset_index.json"); } catch (e) { this.index = []; } }
    const tools = this.panel.querySelector("#ed-tools"); tools.innerHTML = "";
    const prefix = m === "floor" ? "floors" : "walls", cur = m === "floor" ? this.floorSheet : this.wallSheet;
    const sel = document.createElement("select"); sel.style.cssText = "max-width:220px;background:#3a2a1c;color:#f0e6d2;border:1px solid #8a5a2b";
    for (const e of this.index.filter((x) => x.folder === "tilesets" && x.name.startsWith(prefix))) { const o = document.createElement("option"); o.value = e.name; o.textContent = e.name; if (e.name === cur) o.selected = true; sel.appendChild(o); }
    sel.onchange = (e) => { if (m === "floor") { this.floorSheet = e.target.value; this.floorIdx = 0; } else { this.wallSheet = e.target.value; this.wallIdx = 0; } this.showPatterns(m); };
    tools.appendChild(sel);
    const key = cur;
    if (!Assets.img[key]) { await this.world.loadSheet(key); }
    const img = Assets.img[key]; if (!img) { this.status("no sheet " + key); return; }
    const cw = m === "floor" ? 32 : 16, ch = m === "floor" ? 32 : 48, cols = Math.floor(img.width / cw), n = cols * Math.floor(img.height / ch);
    for (let i = 0; i < n; i++) {
      const c = document.createElement("canvas"); c.width = cw; c.height = ch; c.style.cssText = "image-rendering:pixelated;cursor:pointer;width:" + (cw * 2) + "px;height:" + (ch * 2) + "px;border:2px solid " + ((m === "floor" ? this.floorIdx : this.wallIdx) === i ? "#ffd86b" : "transparent");
      const g = c.getContext("2d"); g.imageSmoothingEnabled = false; g.drawImage(img, (i % cols) * cw, Math.floor(i / cols) * ch, cw, ch, 0, 0, cw, ch);
      c.onclick = () => { if (m === "floor") this.floorIdx = i; else this.wallIdx = i; [...this.list.children].forEach((x, j) => x.style.borderColor = j === i ? "#ffd86b" : "transparent"); this.info(key + " #" + i); };
      this.list.appendChild(c);
    }
    this.info(key + " #" + (m === "floor" ? this.floorIdx : this.wallIdx));
  },

  entries() {
    const cat = Assets.data.props, out = [];
    for (const id in cat) {
      const d = cat[id]; const k = d.kind || "prop";
      if (this.kind !== "all" && k !== this.kind) continue;
      if (window.KIT && k !== "furniture") continue;
      if (this.set !== "all" && this.setOf(id) !== this.set) continue;
      if (this.cat !== "all" && k === "furniture" && (d.cat || "decor") !== this.cat) continue;
      if (this.filter && id.indexOf(this.filter) < 0) continue;
      out.push([id, d]);
    }
    return out;
  },

  // what a piece of furniture is (props.json "cat", written by tools/build_asset_index.py from tools/furniture_cats.py)
  cats() {
    const cnt = new Map();
    for (const id in Assets.data.props) { const d = Assets.data.props[id]; if ((d.kind || "prop") !== "furniture") continue; const c = d.cat || "decor"; cnt.set(c, (cnt.get(c) || 0) + 1); }
    return CATS.filter(([k]) => cnt.get(k)).map(([k, label]) => [k, label + " (" + cnt.get(k) + ")"]);
  },
  // furniture packs, from the prop id prefixes (at_<pack>, fur_, obf_, plants_, ...)
  setOf(id) { return id.startsWith("at_") ? id.split("_").slice(0, 2).join("_") : id.split("_")[0]; },
  sets() {
    const NAMES = { fur: "Vanilla furniture", at_vanfurn: "Vanilla furniture (AT)", at_npcfurn: "Villagers' furniture", at_opulence: "Opulence", at_pink: "Pretty pink", at_chestdeco: "Chests & deco", at_craftables: "Craftables & machines", obf: "Orangeblossom", plants: "Plants", tv: "TVs", aimon: "Aimon's interiors", lumi: "Lumisteria", kitchen: "Kitchen clutter", spring: "Hime", bookcases: "Bookcases", frog: "Terrarium", fish: "Fish pond", bed: "Beds", outdoor: "Outdoor furniture" };
    const cnt = new Map();
    for (const id in Assets.data.props) { const d = Assets.data.props[id]; if ((d.kind || "prop") !== "furniture") continue; const s = this.setOf(id); cnt.set(s, (cnt.get(s) || 0) + 1); }
    return [...cnt.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, (NAMES[k] || k) + " (" + n + ")"]);
  },

  async refreshList() {
    if (!this.list || this.mode !== "props") return;
    this.list.innerHTML = ""; this.list.scrollTop = 0;
    this.listEnts = this.entries(); this.listPos = 0;
    this.status(this.listEnts.length + " props");
    await this.renderMore();
  },
  // the next chunk of the current list (called again as the list scrolls near its bottom)
  async renderMore() {
    if (this.rendering || this.listPos >= this.listEnts.length) return;
    this.rendering = true;
    const ents = this.listEnts.slice(this.listPos, this.listPos + 120); this.listPos += ents.length;
    const need = new Set(); for (const [, d] of ents) if (!Assets.img[d.sheet]) need.add(d.sheet);
    if (need.size) { this.status("loading " + need.size + " sheets…"); await Promise.all([...need].map((s) => this.world.loadSheet(s))); this.status(this.listEnts.length + " props"); }
    for (const [id, d] of ents) {
      const c = document.createElement("canvas"); c.width = 48; c.height = 48; c.title = id;
      c.style.cssText = "background:#3a2a1c;border:2px solid " + (this.sel === id ? "#ffd86b" : "transparent") + ";cursor:pointer;image-rendering:pixelated";
      const img = Assets.img[d.sheet];
      if (img) { const g = c.getContext("2d"); g.imageSmoothingEnabled = false; const z = Math.min(44 / d.sw, 44 / d.sh, 2); g.drawImage(img, d.sx, d.sy, d.sw, d.sh, (48 - d.sw * z) / 2, (48 - d.sh * z) / 2, d.sw * z, d.sh * z); }
      c.onclick = () => { this.select(id); };
      this.list.appendChild(c);
    }
    this.rendering = false;
    if (this.list.scrollHeight <= this.list.clientHeight + 40 && this.listPos < this.listEnts.length) this.renderMore();   // list not yet scrollable: keep filling
  },

  // ---------------------------------------------------------------- zoom
  zoom(d) {
    const s = Math.max(1, Math.min(8, (Screen.forceScale || Screen.scale) + d));
    Screen.forceScale = s; Screen.resize(); Input.scale = Screen.scale; this.world.updateCamera();
  },
  zoomFit() {   // the whole map as large as fits beside the panel
    const m = this.world.map, W = window.innerWidth - 330, H = window.innerHeight - 20;
    const s = Math.max(1, Math.min(8, Math.floor(Math.min(W / (m.w * TS), H / (m.h * TS)))));
    Screen.forceScale = s; Screen.resize(); Input.scale = Screen.scale; this.world.updateCamera();
  },
  fillRoom(m) {
    const map = this.world.map, want = m === "floor" ? 102 : 87;
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) if (map.t(x, y) === want) { if (m === "floor") this.paintFloor(x, y); else this.paintWall(x, y); }
    this.status("filled every " + (m === "floor" ? "floor" : "wall") + " tile");
  },

  select(id) {
    this.sel = id;
    const d = Assets.data.props[id];
    this.info(id + "  " + (d.sw / TS) + "x" + (d.sh / TS) + " tiles · solid " + (d.solid === undefined ? "all" : d.solid) + (d.door ? " · door " + d.door : ""));
    [...this.list.children].forEach((c) => { c.style.borderColor = c.title === id ? "#ffd86b" : "transparent"; });
  },

  // ---------------------------------------------------------------- edits model
  edits() {
    const m = this.world.map;
    if (!m.def.edits) m.def.edits = { added: [], removed: [] };
    const e = m.def.edits; e.tiles = e.tiles || []; e.paint = e.paint || []; e.floor = e.floor || []; e.wall = e.wall || [];
    return e;
  },
  touch() { this.dirty = true; this.refreshHeader(); },

  // an added prop's instance object IS its entry in edits.added (p.edit), so removal is by identity
  place(id, tx, ty) {
    const m = this.world.map;
    const a = { name: id, x: tx, y: ty };
    const p = m.addProp(id, a);
    if (!p) return;
    p.edit = a; this.edits().added.push(a); this.touch();
  },

  remove(p) {
    const m = this.world.map, e = this.edits();
    if (p.edit) e.added = e.added.filter((a) => a !== p.edit);
    else if (p.index < 10000) { if (e.removed.indexOf(p.index) < 0) e.removed.push(p.index); }
    m.removeProp(p); this.touch();
  },

  toggleSolid(p) {
    const m = this.world.map;
    if (p.edit) { p.edit.solid = p.edit.solid === false ? undefined : false; p.solidRect = p.edit.solid === false ? null : p.computeSolid(); }
    else {
      const e = this.edits(); if (p.index < 10000 && e.removed.indexOf(p.index) < 0) e.removed.push(p.index);
      const inst = { name: p.name, x: p.x, y: p.y, solid: p.solidRect ? false : undefined }; if (p.id) inst.id = p.id; if (p.note) inst.note = p.note; if (p.door) inst.door = p.door; if (p.shop) inst.shop = p.shop; if (p.sheet !== p.def.sheet) inst.sheet = p.sheet;
      m.removeProp(p); const np = m.addProp(p.name, inst); np.edit = inst; e.added.push(inst);
    }
    m.rebuildSolid(); this.touch();
  },

  // turn an original (generated) prop into an editable one: remembered as removed + re-added
  // with the same fields, so its id / door / note can be changed and survive regeneration
  adopt(p) {
    if (p.edit) return p;
    const m = this.world.map, e = this.edits();
    if (p.index < 10000 && e.removed.indexOf(p.index) < 0) e.removed.push(p.index);
    const inst = { name: p.name, x: p.x, y: p.y }; if (p.id) inst.id = p.id; if (p.note) inst.note = p.note; if (p.door) inst.door = p.door; if (p.shop) inst.shop = p.shop; if (p.sheet !== p.def.sheet) inst.sheet = p.sheet; if (!p.solidRect && p.computeSolid()) inst.solid = false;
    m.removeProp(p); const np = m.addProp(p.name, inst); np.edit = inst; e.added.push(inst); this.touch();
    return np;
  },

  // swap a placed prop's sprite for another prop definition, keeping its position, id, door and note
  swap(p, newName) {
    if (newName === p.name) return;
    const m = this.world.map, np = this.adopt(p), e = this.edits();
    const inst = np.edit; inst.name = newName; delete inst.sheet;
    m.removeProp(np); const q = m.addProp(newName, inst); if (!q) { e.added = e.added.filter((a) => a !== inst); return; }
    q.edit = inst; this.touch(); this.inspect(q);
    this.status("swapped to " + newName + (inst.door ? " (door to " + inst.door.to + " kept)" : ""));
  },

  // form for one placed prop: id, note, door target
  async inspect(p) {
    this.cur = p;
    if (!this.mapIndex) { try { this.mapIndex = await Assets.loadJson("data/maps/index.json"); } catch (e) { this.mapIndex = []; } }
    const el = this.panel.querySelector("#ed-info"); el.innerHTML = "";
    const row = (label, node) => { const d = document.createElement("div"); d.style.margin = "2px 0"; d.append(label + " ", node); el.appendChild(d); };
    const title = document.createElement("div"); title.innerHTML = "<b>" + p.name + "</b> at " + p.x + "," + p.y + (p.edit ? "" : " <small>(generated; editing adopts it)</small>"); el.appendChild(title);
    const inp = (v) => { const i = document.createElement("input"); i.value = v || ""; i.style.cssText = "width:150px;background:#3a2a1c;color:#f0e6d2;border:1px solid #8a5a2b;padding:1px 3px"; return i; };
    const idIn = inp(p.id), noteIn = inp(p.note);
    const doorSel = document.createElement("select"); doorSel.style.cssText = "max-width:160px;background:#3a2a1c;color:#f0e6d2;border:1px solid #8a5a2b";
    const none = document.createElement("option"); none.value = ""; none.textContent = "(no door)"; doorSel.appendChild(none);
    for (const mi of this.mapIndex.filter((x) => x.indoor).concat(this.mapIndex.filter((x) => !x.indoor))) { const o = document.createElement("option"); o.value = mi.id; o.textContent = (mi.indoor ? "" : "[outdoor] ") + mi.id; doorSel.appendChild(o); }
    doorSel.value = p.door ? p.door.to : "";
    if (p.door && !this.mapIndex.some((x) => x.id === p.door.to)) { const o = document.createElement("option"); o.value = p.door.to; o.textContent = p.door.to; doorSel.appendChild(o); doorSel.value = p.door.to; }
    row("id", idIn); row("note", noteIn);
    if (p.def.door) row("door to", doorSel);
    const apply = this.btn("Apply", false, () => {
      const np = this.adopt(p), inst = np.edit;
      if (idIn.value.trim()) inst.id = idIn.value.trim(); else delete inst.id;
      if (noteIn.value.trim()) inst.note = noteIn.value.trim(); else delete inst.note;
      if (p.def.door) { if (doorSel.value) { const tgt = this.entryFor(doorSel.value); inst.door = Object.assign({ to: doorSel.value }, tgt); } else delete inst.door; }
      np.id = inst.id || null; np.note = inst.note || null; np.door = inst.door || null;
      this.touch(); this.status("applied; F7 to save"); this.inspect(np);
    });
    const help = document.createElement("div"); help.style.cssText = "color:#a09080;margin-top:4px";
    help.textContent = (p.def.door ? "S with a palette building selected: swap the sprite, keep the door. N: make a new interior for it. " : "") + "Right-click removes.";
    el.append(apply, help);
  },

  // where a door into map `id` should put the player: its "start" spawn, else the generated default
  entryFor(id) {
    const d = this.world.defs[id];
    if (d && d.spawns && d.spawns.start) return { tx: d.spawns.start[0], ty: d.spawns.start[1], dir: 2 };
    return { tx: 7, ty: 10, dir: 2 };
  },

  // create a fresh interior map (same layout as tools/build_maps.py interior()) and link the building to it
  async newInterior(p) {
    if (!p.def.door) { this.status("that prop has no door"); return; }
    const base = (p.id || p.name).replace(/[^a-z0-9_]/gi, "_").toLowerCase();
    const id = window.prompt("New interior map id (letters/digits/_):", base + "_inside"); if (!id) return;
    const size = window.prompt("Room size in tiles, W x H (floor is 4 rows shorter than H):", "16x13"); if (!size) return;
    const mm = /^(\d+)\s*x\s*(\d+)$/i.exec(size.trim()); if (!mm) { this.status("bad size"); return; }
    const W = Math.max(8, +mm[1]), H = Math.max(8, +mm[2]);
    const rows = [];
    for (let y = 0; y < H; y++) { let r = ""; for (let x = 0; x < W; x++) r += (x === 0 || x === W - 1 || y === 0 || y === H - 1) ? "x" : (y <= 3 ? "W" : "f"); rows.push(r); }
    const ex = Math.floor(W / 2) - 1, start = [ex, H - 3];
    const door = p.doorTile || [p.x, p.y + p.th - 1];
    const def = { id: id, name: (p.note || p.id || id).split(".")[0], w: W, h: H, indoor: true, tileset: "town_interiors", music: "chill_03.mus", floor: 0, wallpaper: 0,
      terrain: rows, props: [], warps: [{ x: ex, y: H - 2, to: this.world.map.id, tx: door[0], ty: door[1] + 1, dir: 0 }], spawns: { start: start } };
    try {
      let r = await fetch("/__save/data/maps/" + id + ".json", { method: "POST", body: JSON.stringify(def, null, 1) }); if (!r.ok) throw new Error(r.status);
      if (!this.mapIndex) { try { this.mapIndex = await Assets.loadJson("data/maps/index.json"); } catch (e) { this.mapIndex = []; } }
      if (!this.mapIndex.some((x) => x.id === id)) this.mapIndex.push({ id: id, name: def.name, indoor: true });
      r = await fetch("/__save/data/maps/index.json", { method: "POST", body: JSON.stringify(this.mapIndex, null, 1) }); if (!r.ok) throw new Error(r.status);
    } catch (err) { this.status("could not write the map (" + err.message + "): is play.bat running?"); return; }
    this.world.defs[id] = def;
    const np = this.adopt(p); np.edit.door = { to: id, tx: start[0], ty: start[1], dir: 2 }; np.door = np.edit.door;
    this.touch(); this.status("made " + id + " and linked the door; F7 to save, then walk in (Space at the door)"); this.inspect(np);
  },

  // replace-or-append a [x, y, ...] record in one of the tile lists
  put(list, x, y, rest) {
    const i = list.findIndex((r) => r[0] === x && r[1] === y);
    if (i >= 0) list[i] = [x, y].concat(rest); else list.push([x, y].concat(rest));
  },

  paintTerrain(x, y) {
    const m = this.world.map; if (!m.inBounds(x, y)) return;
    if (m.t(x, y) === this.terrain.charCodeAt(0)) return;
    m.setTerrain(x, y, this.terrain); this.put(this.edits().tiles, x, y, [this.terrain]); this.touch();
  },
  paintTile(x, y) {
    const m = this.world.map; if (!m.inBounds(x, y)) return;
    const cur = m.paint.get(x + "," + y);
    if (cur && cur.sheet === this.tileSheet && cur.idx === this.tileIdx && cur.solid === this.tileSolid) return;
    m.setPaint(x, y, this.tileSheet, this.tileIdx, this.tileSolid); this.put(this.edits().paint, x, y, [this.tileSheet, this.tileIdx, this.tileSolid ? 1 : 0]); this.touch();
  },
  eraseTile(x, y) {
    const m = this.world.map, e = this.edits();
    if (!m.paint.has(x + "," + y)) return;
    m.clearPaint(x, y); e.paint = e.paint.filter((r) => !(r[0] === x && r[1] === y)); this.touch();
  },
  paintFloor(x, y) {
    const m = this.world.map; if (!m.inBounds(x, y) || m.t(x, y) !== 102) return;
    const v = this.floorSheet === "floors" ? this.floorIdx : this.floorSheet + ":" + this.floorIdx;
    if (m.floorTiles.get(x + "," + y) === v) return;
    m.setFloorTile(x, y, v); this.put(this.edits().floor, x, y, [v]); this.touch();
  },
  paintWall(x, y) {
    const m = this.world.map; if (!m.inBounds(x, y) || m.t(x, y) !== 87) return;
    const v = this.wallSheet === "walls" ? this.wallIdx : this.wallSheet + ":" + this.wallIdx;
    if (m.wallTiles.get(x + "," + y) === v) return;
    m.setWallTile(x, y, v); this.put(this.edits().wall, x, y, [v]); this.touch();
  },

  refreshHeader() { if (this.panel && this.world.map) this.panel.querySelector("#ed-map").textContent = "· " + this.world.map.id + (this.dirty ? " (unsaved)" : ""); },

  async save() {
    const m = this.world.map, e = this.edits();
    const body = JSON.stringify({ added: e.added.map((a) => { const o = Object.assign({}, a); if (o.solid === undefined) delete o.solid; return o; }), removed: e.removed, tiles: e.tiles, paint: e.paint, floor: e.floor, wall: e.wall }, null, 1);
    if (window.KIT) {                       // design kit: kept in this browser; kit.html packs it into the zip
      try { localStorage.setItem("kit.edits." + m.id, body); this.dirty = false; this.refreshHeader(); this.status("saved in this browser (pack it up from the kit page when you're done)"); }
      catch (err) { this.status("save failed: " + err.message); }
      return;
    }
    try {
      const r = await fetch("/__save/data/maps/edits/" + m.id + ".json", { method: "POST", body: body });
      if (!r.ok) throw new Error(r.status);
      this.dirty = false; this.refreshHeader(); this.status("saved data/maps/edits/" + m.id + ".json");
    } catch (err) { this.status("save failed (" + err.message + "): is play.bat running?"); }
  },

  async reload() {
    const w = this.world, id = w.map.id, p = w.player;
    delete w.maps[id]; delete w.defs[id];
    await w.setMap(id, p.tx, p.ty, p.dir);
    this.dirty = false; this.refreshHeader(); this.status("map reloaded from disk");
  },

  // ---------------------------------------------------------------- per-frame
  hoverTile() {
    const m = Input.mouse, w = this.world;
    if (m.x < 0 || m.y < 0 || m.x >= Screen.vw || m.y >= Screen.vh) return null;
    return [Math.floor((m.x + w.cam.x) / TS), Math.floor((m.y + w.cam.y) / TS)];
  },

  update() {
    if (!this.active) return false;
    const w = this.world, m = w.map;
    if (Input.justPressed("F7")) this.save();
    if (Input.justPressed("Escape")) { this.sel = null; if (this.mode === "props") [...this.list.children].forEach((c) => c.style.borderColor = "transparent"); }
    const t = this.hoverTile(); this.hover = t;
    if (!t) return true;
    const overPanel = Input.mouse.x * Screen.scale > window.innerWidth - 320;
    if (overPanel) return true;
    if (!Input.mouse.down) this.lastPaint = null;
    const dragTo = Input.mouse.down && (!this.lastPaint || this.lastPaint[0] !== t[0] || this.lastPaint[1] !== t[1]);
    if (this.mode === "props") {
      if (Input.mouse.pressed && this.sel) {
        const d = Assets.data.props[this.sel], sheets = [d.sheet].concat(d.seasons ? Object.values(d.seasons) : []).filter((x) => !Assets.img[x]);
        if (sheets.length) Promise.all(sheets.map((x) => w.loadSheet(x))).then(() => this.place(this.sel, t[0], t[1]));
        else this.place(this.sel, t[0], t[1]);
      } else if (Input.mouse.pressed) { const p = m.propAt(t[0], t[1]); if (p) this.inspect(p); }
      if (Input.mouse.rpressed) { const p = m.propAt(t[0], t[1]); if (p) this.remove(p); }
      if (Input.justPressed("KeyX")) { const p = m.propAt(t[0], t[1]); if (p) this.toggleSolid(p); }
      if (Input.justPressed("KeyS") && this.sel) { const p = m.propAt(t[0], t[1]); if (p) this.swap(p, this.sel); }
      if (Input.justPressed("KeyN")) { const p = m.propAt(t[0], t[1]); if (p) this.newInterior(p); }
    } else if (Input.mouse.pressed || dragTo) {      // a click paints even if the button is up again by this frame
      this.lastPaint = t;
      if (this.mode === "terrain") this.paintTerrain(t[0], t[1]);
      else if (this.mode === "tile") this.paintTile(t[0], t[1]);
      else for (let dy = 0; dy < this.brush; dy++) for (let dx = 0; dx < this.brush; dx++) {
        if (this.mode === "floor") this.paintFloor(t[0] + dx, t[1] + dy);
        else if (this.mode === "wall") this.paintWall(t[0] + dx, t[1] + dy);
      }
    }
    if (this.mode === "tile" && Input.mouse.rpressed) this.eraseTile(t[0], t[1]);
    return true;
  },

  draw() {
    if (!this.active || !this.hover) return;
    const s = Screen.scale, c = Screen.ctx, w = this.world, t = this.hover;
    const px = (t[0] * TS - w.cam.x) * s, py = (t[1] * TS - w.cam.y) * s;
    c.save(); c.imageSmoothingEnabled = false;
    if (this.mode === "props" && this.sel) {
      const d = Assets.data.props[this.sel], img = Assets.img[d.sheet];
      if (img) { c.globalAlpha = 0.6; c.drawImage(img, d.sx, d.sy, d.sw, d.sh, px, py, d.sw * s, d.sh * s); c.globalAlpha = 1; }
      c.strokeStyle = "#ffd86b"; c.lineWidth = 1; c.strokeRect(px + 0.5, py + 0.5, d.sw * s, d.sh * s);
    } else if (this.mode === "props") {
      const p = w.map.propAt(t[0], t[1]);
      if (p) { c.strokeStyle = "#ff6b6b"; c.lineWidth = 1; c.strokeRect((p.px - w.cam.x) * s + 0.5, (p.py - w.cam.y) * s + 0.5, p.sw * s, p.sh * s);
        if (p.solidRect) { c.fillStyle = "rgba(255,80,80,0.25)"; c.fillRect((p.solidRect[0] * TS - w.cam.x) * s, (p.solidRect[1] * TS - w.cam.y) * s, p.solidRect[2] * TS * s, p.solidRect[3] * TS * s); }
        c.fillStyle = "#fff"; c.font = (10 * Math.max(1, s / 2)) + "px sans-serif"; c.fillText(p.name + (p.solidRect ? "" : " (walkable)"), px + 2, py - 4); }
      else { c.strokeStyle = "rgba(255,255,255,0.5)"; c.strokeRect(px + 0.5, py + 0.5, TS * s, TS * s); }
    } else if (this.mode === "tile") {
      const img = Assets.img[this.tileSheet];
      if (img) { const cols = Math.floor(img.width / TS); c.globalAlpha = 0.7; c.drawImage(img, (this.tileIdx % cols) * TS, Math.floor(this.tileIdx / cols) * TS, TS, TS, px, py, TS * s, TS * s); c.globalAlpha = 1; }
      c.strokeStyle = "#ffd86b"; c.strokeRect(px + 0.5, py + 0.5, TS * s, TS * s);
    } else {
      const bsz = (this.mode === "floor" || this.mode === "wall") ? this.brush : 1;
      c.strokeStyle = "#ffd86b"; c.lineWidth = 1; c.strokeRect(px + 0.5, py + 0.5, TS * s * bsz, TS * s * bsz);
      c.fillStyle = "#fff"; c.font = (10 * Math.max(1, s / 2)) + "px sans-serif";
      c.fillText(this.mode === "terrain" ? this.terrain : this.mode === "floor" ? "floor #" + this.floorIdx : "wall #" + this.wallIdx, px + 2, py - 4);
    }
    c.restore();
  },
};
