"""Build the Art Artifacts dashboard: assets/drafts/index.html (open it in a browser).

One page for every draft:
  - Badges and icons from PixelLab (assets/drafts/pixellab_jobs.json, images in assets/drafts/pixellab/).
  - Outcome illustrations made by hand in the free Gemini app, Nano Banana 2
    (assets/drafts/gemini_outcome_prompts.json, images saved in assets/drafts/gemini/level_XX/).
  - Scrapbook pictures, one per callback, also made by hand in Gemini
    (assets/drafts/gemini_scrapbook_prompts.json, images saved in assets/drafts/gemini/scrapbook/).

Each card shows its drafts; click one to pick it, then "Copy my picks" and paste to Claude.
Outcome cards also carry the prompt for each draft, the file name to save it as, and the reference
images to attach. The page finds saved images by itself (PNG, JPG or WEBP): after saving one, just reload.

Usage (from the repo root):
  python scripts/art_dashboard.py           # rebuild the page, print outcome progress
  python scripts/art_dashboard.py --status  # progress only
The PixelLab script rebuilds the page on every run. Rebuild by hand after the agent adds outcome prompts.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DRAFTS = ROOT / "assets" / "drafts"
PIXELLAB_JOBS = DRAFTS / "pixellab_jobs.json"
OUTCOME_PROMPTS = DRAFTS / "gemini_outcome_prompts.json"
GEMINI_DIR = DRAFTS / "gemini"
SCRAPBOOK_PROMPTS = DRAFTS / "gemini_scrapbook_prompts.json"
SCRAPBOOK_DIR = GEMINI_DIR / "scrapbook"
PROGRESS = ROOT / "logs" / "gemini_prompts_progress.json"
EXTS = (".png", ".jpg", ".jpeg", ".webp")
# Also accept a doubled extension (file.png.jpg) in case a save dialog adds one to a typed name.
EXTS = EXTS + tuple(a + b for a in EXTS for b in EXTS if a != b)


def pixellab_groups():
    if not PIXELLAB_JOBS.exists():
        return {}
    spec = json.loads(PIXELLAB_JOBS.read_text("utf-8"))
    groups = {}
    for j in spec["jobs"]:
        g = spec["groups"][j["group"]]
        variants = j.get("variants", g.get("variants", spec.get("defaults", {}).get("variants", 1)))
        groups.setdefault(j["group"], []).append({"key": j["key"], "subject": j["subject"], "variants": variants})
    return groups


def outcome_rows():
    if not OUTCOME_PROMPTS.exists():
        return []
    spec = json.loads(OUTCOME_PROMPTS.read_text("utf-8"))
    rows = []
    for level, items in sorted(spec["levels"].items()):
        for it in items:
            stem = Path(it["file"]).stem
            n = int(it.get("drafts", 3))
            variations = (it.get("variations") or [])[:n] + [""] * max(0, n - len(it.get("variations") or []))
            saved = sum(1 for v in range(1, n + 1) if any((GEMINI_DIR / level / f"{stem}_v{v}{e}").exists() for e in EXTS))
            rows.append({
                "level": level, "venue": it["venue"], "venue_name": it.get("venue_name", it["venue"]),
                "result": it["result"], "guests": it.get("guests", []), "stem": stem, "drafts": n,
                "prompt": it["prompt"], "variations": variations, "saved": saved,
                "refs": [r.replace("\\", "/") for r in it["refs"]],
            })
    return rows


def scrapbook_rows():
    if not SCRAPBOOK_PROMPTS.exists():
        return []
    rows = []
    for it in json.loads(SCRAPBOOK_PROMPTS.read_text("utf-8"))["pages"]:
        stem = Path(it["file"]).stem
        n = int(it.get("drafts", 3))
        variations = (it.get("variations") or [])[:n] + [""] * max(0, n - len(it.get("variations") or []))
        saved = sum(1 for v in range(1, n + 1) if any((SCRAPBOOK_DIR / f"{stem}_v{v}{e}").exists() for e in EXTS))
        rows.append({
            "id": it["id"], "title": it.get("title", it["id"]), "friend": it.get("friend", ""),
            "first_level": it.get("first_level", ""), "people": it.get("people", []), "stem": stem, "drafts": n,
            "prompt": it["prompt"], "variations": variations, "saved": saved,
            "refs": [r.replace("\\", "/") for r in it["refs"]],
        })
    return rows


PAGE = r"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Art Artifacts</title>
<style>
:root { --bg:#2e2624; --bar:#3f3533; --label:#d9b8a8; --panel:#f3e4d0; --panel2:#e6d0b8; --ink:#3f3533; --soft:#7d6a60; --accent:#d9822b; --good:#6f8f5a; --bad:#c0452f; --gold:#f2c14e; --blue:#5d7985; }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--panel); font:15px/1.45 "Trebuchet MS",system-ui,sans-serif; }
header { position:sticky; top:0; z-index:3; background:var(--bar); padding:10px 16px; display:flex; flex-wrap:wrap; gap:8px 16px; align-items:center; }
h1 { margin:0; font-size:20px; color:var(--label); letter-spacing:.04em; }
.tabs { display:flex; gap:6px; }
.tabs button { background:transparent; color:var(--label); border:2px solid var(--label); }
.tabs button.on { background:var(--label); color:var(--bar); }
.stat { color:var(--label); font-size:14px; } .stat b { color:var(--panel); }
progress { width:120px; height:10px; accent-color:var(--good); }
header label { color:var(--label); cursor:pointer; font-size:14px; }
button { background:var(--accent); color:#fff; border:0; border-radius:6px; padding:6px 11px; font:inherit; font-size:13px; cursor:pointer; }
button.ghost { background:var(--panel2); color:var(--ink); }
main { padding:16px; max-width:1200px; margin:0 auto; }
.hidden { display:none !important; }
h2 { color:var(--label); font-size:16px; letter-spacing:.06em; text-transform:uppercase; margin:22px 0 10px; display:flex; gap:12px; align-items:baseline; flex-wrap:wrap; }
h2 small { font-size:13px; color:var(--soft); letter-spacing:0; text-transform:none; }
.grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:14px; }
.card { background:var(--panel); color:var(--ink); border-radius:10px; padding:12px; }
.card.picked { outline:3px solid var(--good); }
.card.next { outline:3px solid var(--gold); }
.card h3 { margin:0; font-size:15px; }
.card p.sub { margin:2px 0 10px; font-size:12px; color:var(--soft); }
.vars { display:flex; gap:10px; flex-wrap:wrap; }
.var { flex:1 1 120px; display:flex; flex-direction:column; align-items:center; gap:5px; border:2px solid transparent; border-radius:8px; padding:6px; cursor:pointer; background:none; color:inherit; font:inherit; }
.var:hover { border-color:var(--panel2); }
.var.sel { border-color:var(--good); background:#e9efe0; }
.var .art { width:100%; display:grid; place-items:center; border-radius:6px; overflow:hidden; color:var(--soft); font-size:12px; text-align:center;
  background:repeating-conic-gradient(#f3e4d0 0 25%, #e6d0b8 0 50%) 0 0/16px 16px; }
.sq .art { aspect-ratio:1; } .wide .art { aspect-ratio:3/2; }
.var img { width:100%; height:100%; object-fit:contain; image-rendering:pixelated; }
.wide .var img { object-fit:cover; image-rendering:auto; }
.var span { font-size:12px; }
.dark .var .art { background:var(--bg); }
.how { background:var(--bar); border-radius:10px; padding:10px 16px; color:var(--label); font-size:14px; }
.how ol { margin:6px 0; padding-left:20px; }
.code { font-family:Consolas,monospace; font-size:12.5px; background:var(--panel2); color:var(--ink); padding:2px 6px; border-radius:4px; }
.ocard { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1.25fr); gap:14px; }
.top { display:flex; flex-wrap:wrap; gap:6px 10px; align-items:center; margin-bottom:6px; }
.pill { font-size:12px; padding:2px 8px; border-radius:99px; color:#fff; }
.perfect { background:var(--good); } .partial { background:var(--accent); } .fail { background:var(--bad); }
.prompt { white-space:pre-wrap; font-size:12.5px; background:#fff8ee; border:1px solid var(--panel2); border-radius:6px; padding:8px; max-height:140px; overflow:auto; margin:6px 0; }
.dlist { display:flex; flex-direction:column; gap:5px; margin:6px 0; font-size:12.5px; }
.dlist div { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
.refs { display:flex; flex-wrap:wrap; gap:6px; margin-top:4px; }
.refs a { display:block; width:78px; text-align:center; font-size:10.5px; color:var(--soft); text-decoration:none; word-break:break-all; }
.refs img { width:78px; height:52px; object-fit:cover; border-radius:4px; display:block; }
.empty { color:var(--label); padding:20px 0; }
.lvlhead { cursor:pointer; user-select:none; padding:6px 8px; margin-left:-8px; border-radius:6px; }
.lvlhead:hover { background:var(--bar); }
.lvlhead .arrow { display:inline-block; width:14px; transition:transform .15s; }
.lvlhead.closed .arrow { transform:rotate(-90deg); }
.lvlhead .lcount { color:var(--label); }
.lvlhead.complete .lcount { color:var(--good); }
.current { margin-bottom:8px; }
.clabel { font-size:12px; color:var(--soft); margin-bottom:3px; }
.cimg { aspect-ratio:3/2; border-radius:6px; overflow:hidden; border:2px dashed var(--soft); }
.cimg img { width:100%; height:100%; object-fit:cover; display:block; }
.sqcard .cimg { aspect-ratio:1; }
.sqcard .sq .var img { object-fit:cover; image-rendering:auto; }
.page { font-style:italic; font-size:13px; color:var(--ink); background:var(--panel2); border-radius:6px; padding:6px 8px; margin:0 0 6px; }
.slist { display:grid; gap:14px; margin-top:14px; }
@media (max-width:760px) { .ocard { grid-template-columns:1fr; } .grid { grid-template-columns:1fr; } }
</style></head><body>
<header>
  <h1>ART ARTIFACTS</h1>
  <div class="tabs"><button data-tab="pixellab">Badges &amp; icons</button><button data-tab="outcomes">Outcomes</button><button data-tab="scrapbook">Scrapbook</button></div>
  <span class="stat" id="stat"></span>
  <progress id="bar" value="0" max="1"></progress>
  <span class="stat"><b id="picks">0</b> picked</span>
  <label class="only-pl"><input type="checkbox" id="dark"> dark background</label>
  <label class="only-oc"><input type="checkbox" id="hide"> hide finished</label>
  <button id="collapse" class="ghost only-oc">Collapse / expand all</button>
  <button id="reload" class="ghost">Reload</button>
  <button id="copy">Copy my picks</button>
  <span class="stat" id="toast"></span>
</header>
<main>
  <section id="pixellab"></section>
  <section id="outcomes">
    <div class="how">
      <b>Outcome drafts, by hand in the free Gemini app (Nano Banana 2).</b> For each draft:
      <ol>
        <li>Open a <b>new chat</b> in Gemini. Attach the card's reference images (click one to open it full size).</li>
        <li>Click <b>copy prompt</b> for that draft (v1, v2…), paste and send. Ask for fixes in the same chat if needed.</li>
        <li>Download it into <span class="code">assets/drafts/gemini/&lt;level&gt;/</span> and name it with <b>copy name</b> (no extension: the save dialog adds .png or .jpg).</li>
        <li>Click <b>Reload</b>. The draft appears; the gold card is the next one to do.</li>
      </ol>
    </div>
    <div id="olist"></div>
  </section>
  <section id="scrapbook">
    <div class="how">
      <b>Scrapbook pictures, by hand in the free Gemini app (Nano Banana 2).</b> One square picture per Scrapbook page (<span class="code">scrap_&lt;id&gt;.png</span>, 320×320 in the game). For each draft:
      <ol>
        <li>Open a <b>new chat</b> in Gemini. Attach the card's reference images (click one to open it full size).</li>
        <li>Click <b>copy prompt</b> for that draft (v1, v2…), paste and send. Ask for fixes in the same chat if needed.</li>
        <li>Download it into <span class="code">assets/drafts/gemini/scrapbook/</span> and name it with <b>copy name</b> (no extension).</li>
        <li>Click <b>Reload</b>. The draft appears; the gold card is the next one to do.</li>
      </ol>
    </div>
    <div id="slist" class="slist"></div>
  </section>
</main>
<script>
const DATA = __DATA__;
const BASE_EXTS = [".png", ".jpg", ".jpeg", ".webp"];
const EXTS = [...BASE_EXTS, ...BASE_EXTS.flatMap((a) => BASE_EXTS.filter((b) => b !== a).map((b) => a + b))];
const KEY = "lets-eat-draft-picks";
let picks = {};
try { picks = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(picks)); } catch (e) {} };
const $ = (s, el = document) => el.querySelector(s);
const toast = (t) => { const e = $("#toast"); e.textContent = t; setTimeout(() => (e.textContent = ""), 1800); };
const copy = async (text, what) => { try { await navigator.clipboard.writeText(text); toast(what + " copied"); } catch (e) { prompt("Copy:", text); } };
const stamp = Date.now();
const counts = { pixellab: [0, 0], outcomes: [0, 0], scrapbook: [0, 0] };

/** Prompt, per-draft copy buttons and reference thumbnails, shared by Outcomes and Scrapbook cards. */
function fillPrompt(card, r) {
  $(".prompt", card).textContent = r.prompt;
  const dl = $(".dlist", card);
  r.variations.forEach((extra, i) => {
    const name = `${r.stem}_v${i + 1}`;
    const d = document.createElement("div");
    d.innerHTML = `<b>v${i + 1}</b><button class="cp">copy prompt</button><button class="ghost cn">copy name</button><span class="code"></span><span class="ex" style="color:var(--soft)"></span>`;
    $(".code", d).textContent = name;
    $(".ex", d).textContent = extra;
    $(".cp", d).onclick = () => copy(extra ? `${r.prompt}\n\n${extra}` : r.prompt, `v${i + 1} prompt`);
    $(".cn", d).onclick = () => copy(name, "file name");
    dl.append(d);
  });
  const refs = $(".refs", card);
  for (const ref of r.refs) {
    const src = "../" + ref.replace(/^assets\//, "");
    const a = document.createElement("a"); a.href = src; a.target = "_blank";
    const img = new Image(); img.src = src; img.alt = "";
    a.append(img, document.createTextNode(ref.split("/").pop()));
    refs.append(a);
  }
}

/** Load base + first extension that exists into slot; calls onload(true/false). */
function loadInto(slot, base, exts, done) {
  const img = new Image();
  let i = 0;
  const tryNext = () => { if (i >= exts.length) return done(false); img.src = `${base}${exts[i++]}?t=${stamp}`; };
  img.onload = () => { slot.replaceChildren(img); done(true); };
  img.onerror = tryNext;
  img.alt = base.split("/").pop();
  tryNext();
}

/** A row of draft slots for one card; picking toggles picks[key]. */
function draftRow(card, key, bases, exts, shape, tab) {
  const row = document.createElement("div"); row.className = "vars " + shape;
  const refresh = () => {
    card.classList.toggle("picked", !!picks[key]);
    row.querySelectorAll(".var").forEach((b) => b.classList.toggle("sel", picks[key] === b.dataset.v));
    $("#picks").textContent = Object.keys(picks).length;
  };
  bases.forEach((base, i) => {
    const v = `v${i + 1}`;
    const b = document.createElement("button"); b.className = "var"; b.dataset.v = v;
    b.innerHTML = `<div class="art">not made yet</div><span>${v}</span>`;
    counts[tab][1]++;
    loadInto($(".art", b), base, exts, (ok) => { if (ok) { counts[tab][0]++; card.dataset.saved = (+card.dataset.saved || 0) + 1; settle(); } });
    b.onclick = () => { if (picks[key] === v) delete picks[key]; else picks[key] = v; save(); refresh(); };
    row.append(b);
  });
  refresh();
  return row;
}

// ---- Badges & icons (PixelLab)
const pl = $("#pixellab");
if (!Object.keys(DATA.pixellab).length) pl.innerHTML = `<p class="empty">No PixelLab jobs yet.</p>`;
for (const [group, jobs] of Object.entries(DATA.pixellab)) {
  const h = document.createElement("h2"); h.textContent = group; pl.append(h);
  const grid = document.createElement("div"); grid.className = "grid"; pl.append(grid);
  for (const job of jobs) {
    const card = document.createElement("div"); card.className = "card";
    card.innerHTML = `<h3></h3><p class="sub"></p>`;
    $("h3", card).textContent = job.key; $("p", card).textContent = job.subject;
    const bases = Array.from({ length: job.variants }, (_, i) => `pixellab/${group}/${job.key}_v${i + 1}`);
    card.append(draftRow(card, job.key, bases, [".png"], "sq", "pixellab"));
    grid.append(card);
  }
}

// ---- Outcomes (Gemini, by hand)
const ol = $("#olist");
const ocards = [];
if (!DATA.outcomes.length) ol.innerHTML = `<p class="empty">No outcome prompts yet: the art generator agent writes them.</p>`;
const byLevel = {};
const levelBodies = {};
let collapsed = new Set();
try { collapsed = new Set(JSON.parse(localStorage.getItem(KEY + ":collapsed") || "[]")); } catch (e) {}
function setCollapsed(level, on) {
  if (on) collapsed.add(level); else collapsed.delete(level);
  try { localStorage.setItem(KEY + ":collapsed", JSON.stringify([...collapsed])); } catch (e) {}
  const lb = levelBodies[level];
  if (lb) { lb.body.classList.toggle("hidden", on); lb.h.classList.toggle("closed", on); }
}
for (const r of DATA.outcomes) (byLevel[r.level] ||= []).push(r);
for (const [level, rows] of Object.entries(byLevel)) {
  const h = document.createElement("h2"); h.className = "lvlhead"; h.dataset.level = level;
  h.innerHTML = `<span class="arrow">▾</span><span class="lname"></span><small class="lmeta"></small><small class="lcount"></small>`;
  $(".lname", h).textContent = level.replace("_", " ");
  $(".lmeta", h).textContent = `${rows.length} outcomes · ${rows[0].guests.join(", ")}`;
  const body = document.createElement("div"); body.className = "lvlbody";
  h.onclick = () => setCollapsed(level, !collapsed.has(level));
  ol.append(h, body);
  levelBodies[level] = { h, body };
  for (const r of rows) {
    const card = document.createElement("div"); card.className = "card ocard"; card.id = `${r.level}-${r.venue}`;
    card.dataset.need = r.drafts;
    card.innerHTML = `
      <div>
        <div class="top"><h3></h3><span class="pill"></span></div>
        <div class="prompt"></div>
        <div class="dlist"></div>
        <div style="font-size:12px;color:var(--soft)">Attach these references:</div>
        <div class="refs"></div>
      </div>
      <div class="slots"></div>`;
    $("h3", card).textContent = r.venue_name;
    const pill = $(".pill", card); pill.textContent = r.result; pill.classList.add(r.result);
    fillPrompt(card, r);
    const bases = Array.from({ length: r.drafts }, (_, i) => `gemini/${r.level}/${r.stem}_v${i + 1}`);
    $(".slots", card).append(draftRow(card, `${r.level}:${r.venue}`, bases, EXTS, "wide", "outcomes"));
    // The approved image already in assets/art (level 1 today), shown for comparison; hidden if there is none.
    const cur = document.createElement("div"); cur.className = "current hidden";
    cur.innerHTML = `<div class="clabel">in the game now</div><div class="cimg"></div>`;
    loadInto($(".cimg", cur), `../art/${r.stem}`, [".jpg", ".png"], (ok) => ok && cur.classList.remove("hidden"));
    $(".slots", card).prepend(cur);
    card.dataset.level = r.level;
    body.append(card); ocards.push(card);
  }
}

// ---- Scrapbook (Gemini, by hand)
const sl = $("#slist");
const scards = [];
if (!DATA.scrapbook.length) sl.innerHTML = `<p class="empty">No Scrapbook prompts yet: the art generator agent writes them.</p>`;
for (const r of DATA.scrapbook) {
  const card = document.createElement("div"); card.className = "card ocard sqcard"; card.id = `scrap-${r.id}`;
  card.dataset.need = r.drafts;
  card.innerHTML = `
    <div>
      <div class="top"><h3></h3><span class="pill partial"></span></div>
      <p class="sub"></p>
      <p class="page"></p>
      <div class="prompt"></div>
      <div class="dlist"></div>
      <div style="font-size:12px;color:var(--soft)">Attach these references:</div>
      <div class="refs"></div>
    </div>
    <div class="slots"></div>`;
  $("h3", card).textContent = r.title;
  $(".pill", card).textContent = r.friend;
  $(".sub", card).textContent = `first in ${r.first_level.replace("_", " ")} · in the picture: ${r.people.join(", ")}`;
  $(".page", card).textContent = r.page || "";
  if (!r.page) $(".page", card).remove();
  fillPrompt(card, r);
  const bases = Array.from({ length: r.drafts }, (_, i) => `gemini/scrapbook/${r.stem}_v${i + 1}`);
  $(".slots", card).append(draftRow(card, `scrapbook:${r.id}`, bases, EXTS, "sq", "scrapbook"));
  const cur = document.createElement("div"); cur.className = "current hidden";
  cur.innerHTML = `<div class="clabel">in the game now</div><div class="cimg"></div>`;
  loadInto($(".cimg", cur), `../art/${r.stem}`, [".png", ".jpg"], (ok) => ok && cur.classList.remove("hidden"));
  $(".slots", card).prepend(cur);
  sl.append(card); scards.push(card);
}

// ---- header, tabs
let tab = "pixellab";
try { tab = localStorage.getItem(KEY + ":tab") || (DATA.outcomes.length ? "outcomes" : "pixellab"); } catch (e) {}
if (!counts[tab]) tab = "pixellab";
function markNext(cards) {
  cards.forEach((c) => c.classList.remove("next"));
  const next = cards.find((c) => (+c.dataset.saved || 0) < +c.dataset.need);
  if (next) next.classList.add("next");
  return next;
}
function settle() {
  const [d, t] = counts[tab];
  $("#stat").innerHTML = `<b>${d}</b> / <b>${t}</b> ${tab === "pixellab" ? "drawn" : "saved"}`;
  $("#bar").max = t || 1; $("#bar").value = d;
  markNext(scards);
  const next = markNext(ocards);
  for (const [level, lb] of Object.entries(levelBodies)) {
    const cs = ocards.filter((c) => c.dataset.level === level);
    const got = cs.reduce((n, c) => n + (+c.dataset.saved || 0), 0), need = cs.reduce((n, c) => n + +c.dataset.need, 0);
    $(".lcount", lb.h).textContent = `${got} / ${need} saved` + (next && next.dataset.level === level ? " · next up here" : "");
    lb.h.classList.toggle("complete", got >= need);
  }
  const hide = $("#hide").checked;
  [...ocards, ...scards].forEach((c) => c.classList.toggle("hidden", hide && (+c.dataset.saved || 0) >= +c.dataset.need));
}
function show(t) {
  tab = t;
  try { localStorage.setItem(KEY + ":tab", t); } catch (e) {}
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === t));
  $("#pixellab").classList.toggle("hidden", t !== "pixellab");
  $("#outcomes").classList.toggle("hidden", t !== "outcomes");
  $("#scrapbook").classList.toggle("hidden", t !== "scrapbook");
  document.querySelectorAll(".only-pl").forEach((e) => e.classList.toggle("hidden", t !== "pixellab"));
  $("label.only-oc").classList.toggle("hidden", t === "pixellab");
  $("#collapse").classList.toggle("hidden", t !== "outcomes");
  settle();
}
document.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => show(b.dataset.tab)));
$("#dark").onchange = (e) => document.body.classList.toggle("dark", e.target.checked);
$("#hide").onchange = settle;
$("#reload").onclick = () => location.reload();
$("#collapse").onclick = () => { const all = Object.keys(levelBodies); const close = all.some((l) => !collapsed.has(l)); all.forEach((l) => setCollapsed(l, close)); };
Object.keys(levelBodies).forEach((l) => setCollapsed(l, collapsed.has(l)));
$("#copy").onclick = () => copy("Draft picks: " + JSON.stringify(picks), "picks (paste them to Claude)");
show(tab);
</script></body></html>
"""


def build():
    rows = outcome_rows()
    pages = scrapbook_rows()
    page_text = {}
    rules = ROOT / "scripts" / "rules.json"
    if rules.exists():
        page_text = {k: v.get("page", "") for k, v in json.loads(rules.read_text("utf-8")).get("callbacks", {}).items()}
    for p in pages:
        p["page"] = page_text.get(p["id"], "")
    data = {
        "pixellab": pixellab_groups(),
        "outcomes": [{k: v for k, v in r.items() if k != "saved"} for r in rows],
        "scrapbook": [{k: v for k, v in p.items() if k != "saved"} for p in pages],
    }
    DRAFTS.mkdir(parents=True, exist_ok=True)
    if pages:
        SCRAPBOOK_DIR.mkdir(parents=True, exist_ok=True)
    for level in {r["level"] for r in rows}:
        (GEMINI_DIR / level).mkdir(parents=True, exist_ok=True)
    page = DRAFTS / "index.html"
    page.write_text(PAGE.replace("__DATA__", json.dumps(data, ensure_ascii=False)), "utf-8")
    print(f"dashboard {page.relative_to(ROOT)}")
    return rows


def status(rows):
    prog = json.loads(PROGRESS.read_text("utf-8")) if PROGRESS.exists() else {}
    levels = sorted({r["level"] for r in rows})
    need = sum(r["drafts"] for r in rows)
    got = sum(r["saved"] for r in rows)
    nxt = next((r for r in rows if r["saved"] < r["drafts"]), None)
    print(f"outcome prompts: {len(levels)} levels, {len(rows)} outcomes, {need} drafts planned "
          f"(agent {prog.get('state', 'not started')}, last level {prog.get('last_level_done', '-')}, "
          f"next {prog.get('next_level', '-')}, at {prog.get('at', '-')})")
    print(f"outcome drafts saved: {got}/{need}; next up: {nxt['level'] + ' ' + nxt['venue_name'] if nxt else 'none'}")
    pages = scrapbook_rows()
    if pages:
        snext = next((p for p in pages if p["saved"] < p["drafts"]), None)
        print(f"scrapbook drafts saved: {sum(p['saved'] for p in pages)}/{sum(p['drafts'] for p in pages)} "
              f"({len(pages)} pages); next up: {snext['title'] if snext else 'none'}")


def main():
    if "--status" in sys.argv:
        status(outcome_rows())
        return
    status(build())


if __name__ == "__main__":
    main()
