import { Screen } from "./engine/screen.js";
import { Input } from "./engine/input.js";
import { Assets } from "./engine/assets.js";
import { Audio } from "./engine/audio.js";
import { startLoop } from "./engine/loop.js";
import { World } from "./world/world.js";
import { Player } from "./entities/player.js";
import { NPC } from "./entities/npc.js";
import { Pet } from "./entities/pet.js";
import { Clock } from "./systems/time.js";
import { Items } from "./systems/items.js";
import { Farming } from "./systems/farming.js";
import { Actions } from "./systems/actions.js";
import { Day } from "./systems/day.js";
import { Weather } from "./systems/weather.js";
import { Save } from "./systems/save.js";
import { Shipping } from "./systems/shipping.js";
import { Friendship } from "./systems/friendship.js";
import { Talk } from "./systems/talk.js";
import { Quests } from "./systems/quests.js";
import { Shop } from "./ui/shop.js";
import { Board } from "./ui/board.js";
import { Social } from "./ui/social.js";
import { Title } from "./ui/title.js";
import { Editor } from "./ui/editor.js";
import { SettingsMenu } from "./ui/settings.js";
import { Settings } from "./systems/settings.js";
import { drawHud } from "./ui/hud.js";
import { drawHotbar, hotbarInput } from "./ui/hotbar.js";
import { InventoryMenu, Toasts, Prompt } from "./ui/menu.js";
import { Dialogue } from "./ui/dialogue.js";
import { Puzzle, SPECIES } from "./systems/puzzle.js";

const MANIFEST = {
  images: {
    outdoors_spring: "assets/tilesets/outdoors_spring.png",
    outdoors_summer: "assets/tilesets/outdoors_summer.png",
    outdoors_fall: "assets/tilesets/outdoors_fall.png",
    outdoors_winter: "assets/tilesets/outdoors_winter.png",
    hoedirt: "assets/tilesets/hoedirt.png",
    fences: "assets/tilesets/fences.png",
    town_interiors: "assets/tilesets/town_interiors.png",
    furniture: "assets/tilesets/furniture.png",
    floors: "assets/tilesets/floors.png",
    walls: "assets/tilesets/walls.png",
    town_spring: "assets/tilesets/town_spring.png", town_summer: "assets/tilesets/town_summer.png", town_fall: "assets/tilesets/town_fall.png", town_winter: "assets/tilesets/town_winter.png",
    vivienne_spring: "assets/characters/vivienne_spring.png",
    farmhouses_woodbury: "assets/buildings/farmhouses_woodbury.png",
    shipping_bin: "assets/buildings/shipping_bin.png",
    cursors: "assets/ui/cursors.png",
    emotes: "assets/ui/emotes.png",
    tools: "assets/ui/tools.png",
    springobjects: "assets/items/springobjects.png",
    icons: "assets/items/icons.png",
    crop_atlas: "assets/crops/atlas.png",
    cat_ragdoll: "assets/animals/cat_ragdoll.png",
    mine: "assets/tilesets/mine.png",
  },
  json: {
    props: "data/props.json",
    crops: "data/crops.json",
    items: "data/items.json",
    npcs: "data/npcs.json",
    quests: "data/quests.json",
    dialogue: "data/dialogue.json",
    outfits: "data/outfits_catalog.json",
    learned: "data/learned_tiles.json",
  },
};

const STARTING_ITEMS = [["hoe", 1], ["can", 1], ["axe", 1], ["pickaxe", 1], ["scythe", 1], ["parsnip_seeds", 15]];
// the cave try-out: what the animals want, nothing else
const PUZZLE_ITEMS = [["parsnip", 6], ["parsnip_seeds", 6], ["fodder", 4], ["tulip", 2], ["trinket", 2]];

function handleInput() {
  const p = World.player;
  if (Input.justPressed("Escape")) {
    if (InventoryMenu.open) InventoryMenu.toggle();
    else if (!Dialogue.open && !Prompt.active && !World.inputLocked()) InventoryMenu.toggle();
  }
  if (Input.justPressed("KeyI", "Tab")) { if (!Dialogue.open && !Prompt.active && !Social.isOpen && (InventoryMenu.open || !World.inputLocked())) InventoryMenu.toggle(); }
  if (Input.justPressed("KeyL") && !Dialogue.open && !Prompt.active && !InventoryMenu.open && (Social.isOpen || !World.inputLocked())) Social.toggle();
  if (InventoryMenu.open) { InventoryMenu.update(); return; }
  if (Input.justPressed("F6") && !Dialogue.open && !Prompt.active) Editor.toggle();
  if (World.inputLocked()) return;
  if (Editor.update()) { hotbarInput(p.inventory); return; }   // editor owns the mouse; walking still works
  const onBar = hotbarInput(p.inventory);
  if (p.busy > 0) return;
  if (Input.justPressed("KeyC") || (Input.mouse.pressed && !onBar)) Actions.useSelected(Input.mouse.pressed ? Input.mouse : null);
  else if (Input.justPressed("Space", "KeyE", "Enter") || Input.mouse.rpressed) {
    if (!Actions.interact()) {
      const id = p.inventory.selectedId;
      if (id) Actions.useSelected(null);          // nothing to talk to or open: use what's in hand (tools included)
    }
  }
  // debug keys
  if (Input.justPressed("F1")) { Clock.minutes += 60; }
  if (Input.justPressed("F2")) { Day.endDay(false); }
  if (Input.justPressed("F3")) { p.gold += 1000; World.toast("+1000g (debug)"); }
  if (Input.justPressed("F4")) { Save.write(); World.toast("Saved"); }
}

function drawUI() {
  if (window.__hideUI) return;
  if (!window.KIT) { drawHud(); drawHotbar(World.player.inventory); }
  Puzzle.drawUI();
  Toasts.draw();
  Shipping.draw();
  Shop.draw();
  Board.draw();
  SettingsMenu.draw();
  Social.draw();
  Board.drawHud();
  Dialogue.draw();
  Prompt.draw();
  InventoryMenu.draw();
  Editor.draw();
}

// the walkable tile nearest the middle of a map (kit houses: where to put the player)
function floorSpot(m) {
  let best = null, bd = Infinity;
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    if (m.isSolid(x, y) || (m.indoor && m.t(x, y) !== 102)) continue;
    const d = (x - m.w / 2) ** 2 + (y - m.h / 2) ** 2; if (d < bd) { bd = d; best = [x, y]; }
  }
  return best;
}

// Begin play: either restore the save or set up a fresh farm.
async function startGame(useSave, name, look, opts) {
  const params = new URLSearchParams(location.search);
  const saved = useSave ? Save.read() : null;
  const sheet = look ? look.sheet : "vivienne_spring";
  if (!Assets.img[sheet]) await Assets.image(sheet, "assets/characters/" + sheet + ".png");
  World.player = new Player({ sheet: sheet, displayName: name || "Farmer" });
  Save.disabled = false; World.sandbox = false;
  if (opts && opts.puzzle) {
    // the cave try-out from the title screen: no save is read or written, eight rooms off a hub
    Save.disabled = true; World.sandbox = true; Puzzle.party = [];
    for (const [id, n] of PUZZLE_ITEMS) World.player.inventory.add(id, n);
    Clock.minutes = 10 * 60;
    await Promise.all(Object.values(SPECIES).map((s) => World.loadSheet(s.sheet)));
    const hub = await World.mapDef("cave_hub"); const st = hub.puzzle.start;
    await Promise.all(hub.puzzle.doors.map((d) => World.mapDef(d.to)));     // room names for the hub's doorway labels
    await World.setMap(params.get("map") || "cave_hub", parseInt(params.get("x") || st[0], 10), parseInt(params.get("y") || st[1], 10), 2);
    World.started = true;
    return;
  }
  if (saved) {
    Save.apply(saved);
    const p = World.player;
    if (p.sheet && !Assets.img[p.sheet]) await Assets.image(p.sheet, "assets/characters/" + p.sheet + ".png").catch(() => { p.sheet = "vivienne_spring"; });
    await World.setMap(World.startMap || "farm", Math.floor(p.x / 16), Math.floor(p.y / 16), p.dir);
    World.player.x = saved.player.x; World.player.y = saved.player.y; World.updateCamera();
  } else {
    Save.clear();
    for (const [id, n] of STARTING_ITEMS) World.player.inventory.add(id, n);
    const start = (opts && opts.map) || params.get("map") || "farm";
    if (params.get("time")) { const t = params.get("time"); Clock.minutes = parseInt(t.slice(0, -2), 10) * 60 + parseInt(t.slice(-2), 10); }
    await World.setMap(start, parseInt(params.get("x") || "32", 10), parseInt(params.get("y") || "14", 10), 0);
    let sp = World.map.spawns.start;
    if (!sp && opts && opts.map) {           // a design kit house has no start spawn: the bed's spot if it is still floor, else the middle of the floor
      const m = World.map, bed = m.spawns.bed;
      sp = (bed && m.inBounds(bed[0], bed[1]) && !m.isSolid(bed[0], bed[1])) ? bed : floorSpot(m);
    }
    if (sp && (start === "farm" || (opts && opts.map)) && !params.get("x")) { World.player.x = sp[0] * 16 + 8; World.player.y = sp[1] * 16 + 16; World.updateCamera(); }
  }
  for (const [id, n] of STARTING_ITEMS) if (Items.get(id) && Items.get(id).type === "tool" && !World.player.inventory.has(id, 1)) World.player.inventory.add(id, n);   // older saves: the basic tools
  Friendship.dayIndex = Clock.dayIndex();
  if (Quests.lastGenDay < 0) Quests.newDay();
  World.started = true;
}

// Hot reload for hand-drawn sprites: poll the dev server for changed PNGs in assets/characters and
// swap them in place, so saving from Aseprite shows up in the running game within a couple of seconds.
function watchArt(known, npcDefs) {
  setInterval(async () => {
    let m = null;
    try { const r = await fetch("/__mtimes?dir=assets/characters", { cache: "no-store" }); if (r.ok) m = await r.json(); } catch (e) { return; }
    if (!m) return;
    for (const f in m) {
      if (known[f] === m[f]) continue;
      const key = f.replace(/\.png$/, "");
      const isNpc = !!npcDefs[key];
      if (!Assets.img[key] && !isNpc) continue;
      try {
        const im = await Assets.loadImage("assets/characters/" + f + "?t=" + m[f]);
        Assets.img[key] = im;
        if (isNpc) { npcDefs[key].sheet = key; for (const n of World.allNpcs) if (n.id === key) n.sheet = key; }
        if (World.started) World.toast("Reloaded " + f);
      } catch (e) { /* half-written file; next poll */ }
    }
    known = m;
  }, 1500);
}

async function boot() {
  const canvas = document.getElementById("screen");
  Screen.init(canvas);
  Input.init(canvas);
  Input.scale = Screen.scale;
  window.addEventListener("resize", () => { Input.scale = Screen.scale; });
  Audio.init();
  await Assets.load(MANIFEST);
  Items.init(Assets.data.items);
  Farming.init(Assets.data.crops);
  Actions.init(World);
  Day.init(World);
  Shipping.init(World);
  Shop.init(World);
  Talk.init(Assets.data.dialogue);
  Quests.init(World); Board.init(World); Social.init(World); World.quests = Quests;
  World.onBoard = () => Board.open();
  World.onSleep = () => Day.endDay(false);
  World.onShip = () => Shipping.open();
  World.onShop = (kind) => Shop.open(kind);
  World.hooks.draw.push((ctx, map, cx, cy, vw, vh) => Farming.draw(ctx, map, cx, cy, vw, vh));

  // NPCs: load their sheets, create them all up front. A hand-drawn assets/characters/<npc id>.png
  // (see HOWTO.md, "Drawing your own NPC") wins over the placeholder sheet in npcs.json.
  const npcDefs = Assets.data.npcs;
  const devServer = ["127.0.0.1", "localhost"].includes(location.hostname);
  let artFiles = null;
  if (devServer) { try { const r = await fetch("/__mtimes?dir=assets/characters", { cache: "no-store" }); if (r.ok) artFiles = await r.json(); } catch (e) { /* static host */ } }
  if (artFiles) for (const id in npcDefs) if (artFiles[id + ".png"]) npcDefs[id].sheet = id;
  await Promise.all(Object.keys(npcDefs).map((id) => Assets.image(npcDefs[id].sheet, "assets/characters/" + npcDefs[id].sheet + ".png").catch(() => World.loadSheet(npcDefs[id].sheet))));   // animal-pack sheets live in assets/animals
  World.allNpcs = Object.keys(npcDefs).map((id) => new NPC(id, npcDefs[id]));
  World.allNpcs.push(new Pet({ map: "farm", x: 18, y: 14, name: "Cat" }));
  World.hooks.onMapChange.push((m) => { World.npcs = World.allNpcs.filter((n) => n.map === m.id); });
  World.hooks.update.push((dt) => { for (const n of World.allNpcs) n.simulate(dt, World); World.npcs = World.allNpcs.filter((n) => n.map === World.map.id); });
  World.hooks.newDay.push(() => { Friendship.dayIndex = Clock.dayIndex(); Quests.newDay(); for (const n of World.allNpcs) if (n.pickOutfit) n.pickOutfit(); });

  // save modules
  Save.register("clock", () => Clock.save(), (d) => Clock.load(d));
  Save.register("weather", () => Weather.save(), (d) => Weather.load(d));
  Save.register("player", () => World.player.save(), (d) => World.player.load(d));
  Save.register("maps", () => World.saveMaps(), (d) => World.loadMaps(d));
  Save.register("where", () => ({ map: World.map.id }), (d) => { World.startMap = d ? d.map : null; });
  Save.register("shipping", () => ({ v: World.shippingValue, list: World.shipped }), (d) => { if (d) { World.shippingValue = d.v; World.shipped = d.list || []; } });
  Save.register("friendship", () => Friendship.save(), (d) => Friendship.load(d));
  Save.register("quests", () => Quests.save(), (d) => Quests.load(d));

  // collapse at 2am; autosave
  Clock.onTenMinutes((m) => { if (m >= 26 * 60 && !Day.sleeping) { World.toast("You passed out..."); Day.endDay(true); } });
  setInterval(() => { if (World.started && !Day.sleeping) Save.write(); }, 30000);
  window.addEventListener("beforeunload", () => { if (World.started && !Day.sleeping) Save.write(); });

  Puzzle.init(World); window.Puzzle = Puzzle;
  if (artFiles) watchArt(artFiles, npcDefs);
  window.World = World; window.Clock = Clock; window.Assets = Assets; window.Farming = Farming; window.Items = Items; window.Save = Save; window.Day = Day;
  window.Screen = Screen; window.Audio_ = Audio; window.Friendship = Friendship; window.Talk = Talk; window.Shop = Shop; window.Quests = Quests; window.Title = Title; window.Editor = Editor; Editor.init(World); window.SettingsMenu = SettingsMenu; SettingsMenu.init(World); Settings.load();

  const params = new URLSearchParams(location.search);
  // looks: the default sprite plus anything saved from the character builder
  const looks = [{ name: "Vivienne (default)", sheet: "vivienne_spring" }];
  try { const custom = await Assets.loadJson("data/custom_characters.json"); for (const c of custom) looks.push(c); } catch (e) { /* none yet */ }
  await Promise.all(looks.map((l) => Assets.image(l.sheet, "assets/characters/" + l.sheet + ".png").catch(() => null)));
  Title.looks = looks.filter((l) => Assets.img[l.sheet]);
  Title.onStart = startGame;
  if (params.has("kit")) {
    // design kit (tools/make_kit.py): straight into the friend's house with the editor open, wearing
    // whatever they last saved in the character builder
    Title.active = false; window.KIT = { map: params.get("kit") };
    let kitLook = null;
    try { const kl = JSON.parse(localStorage.getItem("kit.look") || "null"); if (kl && kl.png) { await Assets.image("kit_look", kl.png); kitLook = { name: kl.name, sheet: "kit_look" }; } } catch (e) { /* none yet */ }
    await startGame(false, params.get("name") || "Friend", kitLook || (looks.length > 1 ? looks[looks.length - 1] : null), { map: params.get("kit") });
    Editor.toggle();
  } else if (params.has("new")) { Title.active = false; await startGame(false, params.get("name") || "Farmer"); }
  else Title.show(Save.exists());
  window.__ready = true;

  startLoop(
    (dt) => {
      if (Title.active) { Title.update(dt); Input.endFrame(); return; }
      if (!World.started) { Input.endFrame(); return; }
      handleInput(); World.update(dt); Input.endFrame();
    },
    () => {
      if (Title.active) { Title.draw(); return; }
      if (!World.started) return;
      World.draw(); Screen.present(); drawUI();
    }
  );
}

boot();
