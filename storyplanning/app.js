// ====== Storage & Data ======
const LS_KEY = "story-planner-data-v1";
const POS_KEY = "story-planner-positions-v1";

function uid() { return Math.random().toString(36).slice(2, 9); }

const DefaultData = {
  arcs: [],
  plotPoints: [],
  locations: [],
  characters: [],
  items: []
};

let DATA = loadData();
function loadData() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch(e) { console.warn("Load error", e); }
  return structuredClone(DefaultData);
}
function saveData() {
  localStorage.setItem(LS_KEY, JSON.stringify(DATA));
  buildDatalists();
  renderList();
  renderTimeline();
  renderTheory();
}

function exportData() {
  const content = `window.STORY_DATA = ${JSON.stringify(DATA, null, 2)};`;
  const blob = new Blob([content], {type: "text/javascript"});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = "data.js";
  a.click();
  URL.revokeObjectURL(a.href);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      let text = e.target.result;
      if (/window\.STORY_DATA\s*=/.test(text)) {
        // evaluate safely-ish
        const fn = new Function(text + "\n;return window.STORY_DATA;");
        const obj = fn();
        if (obj && typeof obj === "object") {
          DATA = obj;
          saveData();
          alert("Imported data.js successfully.");
        }
      } else {
        const obj = JSON.parse(text);
        DATA = obj;
        saveData();
        alert("Imported JSON successfully.");
      }
    } catch(err) {
      alert("Failed to import: " + err.message);
    }
  };
  reader.readAsText(file);
}

// ====== DOM helpers ======
const $ = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));

// ====== Tabs ======
$$(".tab").forEach(btn => btn.addEventListener("click", () => {
  $$(".tab").forEach(b => { b.classList.toggle("active", b===btn); b.setAttribute("aria-selected", b===btn); });
  const view = btn.dataset.view;
  $$(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + view));
  if (view === "timeline") renderTimeline();
  if (view === "theory") renderTheory();
}));

// ====== Admin listing & form ======
let activeType = "arcs";
let activeId = null;

const typeBtns = $$(".type-btn");
typeBtns.forEach(b => b.addEventListener("click", () => {
  typeBtns.forEach(bb => bb.classList.toggle("active", bb===b));
  activeType = b.dataset.type;
  activeId = null;
  $("#search-list").value = "";
  renderList();
  setupFormForType();
}));

$("#search-list").addEventListener("input", () => renderList());

function listOf(type) { return DATA[type] || []; }
function findById(type, id) { return listOf(type).find(x => x.id === id) || null; }
function findByName(type, name) { return listOf(type).find(x => (x.name||"").toLowerCase() === (name||"").toLowerCase()) || null; }

function renderList() {
  const wrap = $("#entity-list");
  wrap.innerHTML = "";
  const term = ($("#search-list").value || "").toLowerCase();
  const arr = listOf(activeType).slice().sort((a,b) => (a.name||"").localeCompare(b.name||""));
  arr.forEach(ent => {
    if (term && !(`${ent.name} ${ent.details||""}`.toLowerCase().includes(term))) return;
    const row = document.createElement("div");
    row.className = "entity-row" + (ent.id===activeId ? " active" : "");
    row.tabIndex = 0;
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = ent.name || "(untitled)";
    const actions = document.createElement("div");
    actions.innerHTML = `<span class="muted">${ent.type || ""}</span>`;
    row.appendChild(name); row.appendChild(actions);
    row.addEventListener("click", () => { activeId = ent.id; loadIntoForm(ent); renderList(); });
    wrap.appendChild(row);
  });
}

function setupFormForType() {
  $("#form-title").textContent = "Edit " + activeType.replace(/([A-Z])/g,' $1');
  activeId = null;
  $("#entity-form").reset();
  // toggle plotPoints section
  const ppSection = $$("#entity-form .only.plotPoints");
  ppSection.forEach(el => el.classList.toggle("show", activeType === "plotPoints"));
  // Relationship list empty
  $("#rel-list").innerHTML = "";
}

function newEntityOf(type) {
  const base = { id: uid(), type, name: "", details: "", relationships: [] };
  if (type === "plotPoints") base.order = (DATA.plotPoints?.length || 0);
  return base;
}

$("#btn-new").addEventListener("click", () => {
  const ent = newEntityOf(activeType);
  listOf(activeType).push(ent);
  activeId = ent.id;
  saveData();
  loadIntoForm(ent);
  renderList();
});

$("#btn-duplicate").addEventListener("click", () => {
  if (!activeId) return;
  const src = findById(activeType, activeId);
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = uid();
  copy.name = src.name + " (copy)";
  listOf(activeType).push(copy);
  activeId = copy.id;
  saveData();
  loadIntoForm(copy);
  renderList();
});

$("#btn-delete").addEventListener("click", () => {
  if (!activeId) return;
  if (!confirm("Delete this " + activeType + "?")) return;
  const arr = listOf(activeType);
  const idx = arr.findIndex(x => x.id === activeId);
  if (idx>=0) arr.splice(idx,1);
  activeId = null;
  saveData();
  setupFormForType();
  renderList();
});

function loadIntoForm(ent) {
  $("#entity-form").name.value = ent.name || "";
  $("#entity-form").details.value = ent.details || "";
  if (activeType === "plotPoints") {
    $("#entity-form").order.value = ent.order ?? 0;
    $("#entity-form").pp_arc.value = resolveName(ent.pp_arc, "arcs");
    $("#entity-form").pp_location.value = resolveName(ent.pp_location, "locations");
    $("#entity-form").pp_characters.value = (ent.pp_characters || []).map(id => resolveName(id, "characters")).join(", ");
  }
  // custom relationships
  renderRelList(ent, $("#rel-list"), false);
}
function resolveName(idOrName, type) {
  if (!idOrName) return "";
  const byId = (typeof idOrName === "string" && idOrName.length<=9) ? findById(type, idOrName) : null;
  if (byId) return byId.name;
  const maybe = findByName(type, idOrName);
  return maybe ? maybe.name : (idOrName.name || idOrName || "");
}

function renderRelList(ent, container, isDialog) {
  container.innerHTML = "";
  (ent.relationships || []).forEach((r, i) => {
    const row = document.createElement("div");
    row.className = isDialog ? "dlg-rel-item" : "rel-item";
    row.innerHTML = `
      <select data-k="type">
        <option value="arcs">Arc</option>
        <option value="plotPoints">Plot Point</option>
        <option value="locations">Location</option>
        <option value="characters">Character</option>
        <option value="items">Item</option>
      </select>
      <input data-k="name" placeholder="Target name" list="dlist-all">
      <input data-k="label" placeholder="Label">
      <button type="button" class="del">Remove</button>
    `;
    row.querySelector('[data-k="type"]').value = r.type;
    row.querySelector('[data-k="name"]').value = resolveName(r.to, r.type);
    row.querySelector('[data-k="label"]').value = r.label || "";
    row.querySelector(".del").addEventListener("click", () => {
      ent.relationships.splice(i,1);
      renderRelList(ent, container, isDialog);
      saveData();
    });
    // update on change
    row.querySelectorAll("select,input").forEach(input => input.addEventListener("change", () => {
      const type = row.querySelector('[data-k="type"]').value;
      const name = row.querySelector('[data-k="name"]').value;
      const label = row.querySelector('[data-k="label"]').value;
      const target = findByName(type, name);
      ent.relationships[i] = { type, to: target ? target.id : name, label };
      saveData();
    }));
    container.appendChild(row);
  });
}

$("#rel-add").addEventListener("click", () => {
  if (!activeId) return alert("Select or create an object first.");
  const ent = findById(activeType, activeId);
  const type = $("#rel-new-type").value;
  const name = $("#rel-new-name").value.trim();
  const label = $("#rel-new-label").value.trim();
  if (!name) return;
  const target = findByName(type, name);
  ent.relationships ||= [];
  ent.relationships.push({ type, to: target ? target.id : name, label });
  $("#rel-new-name").value = ""; $("#rel-new-label").value = "";
  renderRelList(ent, $("#rel-list"), false);
  saveData();
});

$("#entity-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!activeId) return;
  const ent = findById(activeType, activeId);
  ent.name = e.target.name.value.trim();
  ent.details = e.target.details.value.trim();
  if (activeType === "plotPoints") {
    ent.order = parseInt(e.target.order.value || "0", 10);
    // relationships specific
    const arcName = e.target.pp_arc.value.trim();
    const locName = e.target.pp_location.value.trim();
    const charNames = (e.target.pp_characters.value || "").split(",").map(s => s.trim()).filter(Boolean);
    ent.pp_arc = arcName ? (findByName("arcs", arcName)?.id || arcName) : null;
    ent.pp_location = locName ? (findByName("locations", locName)?.id || locName) : null;
    ent.pp_characters = charNames.map(n => findByName("characters", n)?.id || n);
  }
  saveData();
});

$("#btn-save-close").addEventListener("click", () => {
  const ev = new Event("submit");
  $("#entity-form").dispatchEvent(ev);
  activeId = null;
  setupFormForType();
  renderList();
});

// ====== Datalists ======
function buildDatalists() {
  const set = (id, arr) => {
    const dl = $("#" + id);
    dl.innerHTML = arr.map(x => `<option value="${x.name}">`).join("");
  };
  set("dlist-arcs", DATA.arcs);
  set("dlist-locations", DATA.locations);
  set("dlist-characters", DATA.characters);
  const all = [...DATA.arcs, ...DATA.plotPoints, ...DATA.locations, ...DATA.characters, ...DATA.items];
  set("dlist-all", all);
}
buildDatalists();

// ====== Export / Import / Reset ======
$("#btn-export").addEventListener("click", exportData);
$("#file-import").addEventListener("change", (e) => {
  const f = e.target.files[0]; if (f) importData(f);
  e.target.value = "";
});
$("#btn-reset").addEventListener("click", () => {
  if (!confirm("Reset ALL data to empty?")) return;
  DATA = structuredClone(DefaultData);
  saveData();
  setupFormForType();
  renderList();
});

// ====== Timeline ======
function colorForArcName(name) {
  if (!name) return null;
  // simple hash
  let h=0; for (let i=0;i<name.length;i++) h = (h*31 + name.charCodeAt(i))|0;
  const hue = Math.abs(h) % 360;
  return `hsl(${hue} 70% 55%)`;
}
function renderTimeline() {
  const host = $("#timeline");
  host.innerHTML = "";
  const colorMode = $("#timeline-arc-color").value;
  const points = DATA.plotPoints.slice().sort((a,b) => (a.order||0) - (b.order||0));
  points.forEach((pp, idx) => {
    const tick = document.createElement("div");
    tick.className = "tick";
    const card = document.createElement("div");
    card.className = "event";
    const arcName = resolveName(pp.pp_arc, "arcs");
    const arcColor = colorMode === "byArc" ? colorForArcName(arcName) : null;
    card.innerHTML = `
      <div class="title">${pp.name || "(untitled plot point)"}</div>
      <div class="meta">
        ${arcName ? `<span class="badge arc"><span class="arc-dot" style="background:${arcColor||'var(--arc)'}"></span>${arcName}</span>` : ""}
        ${resolveName(pp.pp_location,"locations") ? `<span class="badge loc">${resolveName(pp.pp_location,"locations")}</span>` : ""}
        ${pp.pp_characters?.length ? `<span class="badge char">${pp.pp_characters.map(id=>resolveName(id,"characters")).join(", ")}</span>` : ""}
      </div>
      ${pp.details ? `<div class="desc">${pp.details}</div>` : ""}
    `;
    tick.appendChild(card);
    host.appendChild(tick);
  });
}
$("#timeline-arc-color").addEventListener("change", renderTimeline);

// ====== Theory ======
const stage = $("#theory-stage");
const svg = $("#links-svg");

function getPositions() {
  try { return JSON.parse(localStorage.getItem(POS_KEY) || "{}"); } catch { return {}; }
}
function setPositions(obj) {
  localStorage.setItem(POS_KEY, JSON.stringify(obj));
}
function renderTheory() {
  stage.innerHTML = "";
  svg.setAttribute("viewBox", `0 0 ${stage.clientWidth} ${stage.clientHeight}`);
  svg.innerHTML = "";

  const pos = getPositions();
  const all = [
    ...DATA.arcs.map(x => ({...x, t:"arcs"})),
    ...DATA.plotPoints.map(x => ({...x, t:"plotPoints"})),
    ...DATA.locations.map(x => ({...x, t:"locations"})),
    ...DATA.characters.map(x => ({...x, t:"characters"})),
    ...DATA.items.map(x => ({...x, t:"items"}))
  ];

  // Create nodes
  all.forEach(ent => {
    const node = document.createElement("article");
    node.className = "node";
    node.dataset.id = ent.id;
    node.dataset.type = ent.t;
    node.innerHTML = `
      <h4>${ent.name || "(untitled)"} </h4>
      <div class="sub">${ent.t}</div>
    `;
    // position
    const p = pos[ent.id] || { x: 100 + Math.random() * (stage.clientWidth - 200), y: 100 + Math.random() * (stage.clientHeight - 200) };
    node.style.left = p.x + "px"; node.style.top = p.y + "px";
    stage.appendChild(node);

    // drag
    makeDraggable(node);

    // click => dialog
    node.addEventListener("dblclick", () => openDialog(ent.id, ent.t));
    node.addEventListener("click", (e) => {
      // single click = select
      $$(".node").forEach(n => n.classList.toggle("selected", n===node));
    });
  });

  // Build connections
  const edges = [];
  // From plotPoints built-in relationships
  DATA.plotPoints.forEach(pp => {
    if (pp.pp_arc) edges.push([pp.id, canonicalId(pp.pp_arc, "arcs"), "Arc"]);
    if (pp.pp_location) edges.push([pp.id, canonicalId(pp.pp_location, "locations"), "Location"]);
    (pp.pp_characters||[]).forEach(c => edges.push([pp.id, canonicalId(c, "characters"), "Character"]));
  });
  // From custom relationships
  all.forEach(ent => {
    (ent.relationships||[]).forEach(r => {
      edges.push([ent.id, canonicalId(r.to, r.type), r.label || ""]);
    });
  });

  // draw edges
  edges.forEach(([fromId, toId, label]) => {
    const A = stage.querySelector(`.node[data-id="${CSS.escape(fromId)}"]`);
    const B = stage.querySelector(`.node[data-id="${CSS.escape(toId)}"]`);
    if (!A || !B) return;
    drawLink(A, B, label);
  });
}
function canonicalId(idOrName, type) {
  if (!idOrName) return null;
  const byId = findById(type, idOrName);
  if (byId) return byId.id;
  const byName = findByName(type, idOrName);
  return byName ? byName.id : null;
}
function nodeCenter(el) {
  const r = el.getBoundingClientRect();
  const s = stage.getBoundingClientRect();
  return { x: r.left - s.left + r.width/2, y: r.top - s.top + r.height/2 };
}
function drawLink(aEl, bEl, label="") {
  const a = nodeCenter(aEl);
  const b = nodeCenter(bEl);
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", a.x); line.setAttribute("y1", a.y);
  line.setAttribute("x2", b.x); line.setAttribute("y2", b.y);
  line.setAttribute("stroke", "#3b4070");
  line.setAttribute("stroke-width", "2");
  svg.appendChild(line);
  if (label) {
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", (a.x + b.x)/2);
    text.setAttribute("y", (a.y + b.y)/2 - 6);
    text.setAttribute("fill", "#8892bf");
    text.setAttribute("font-size", "12");
    text.setAttribute("text-anchor", "middle");
    text.textContent = label;
    svg.appendChild(text);
  }
}
function refreshLinks() {
  svg.innerHTML = "";
  // rebuild edges using current positions
  renderTheory();
}

// drag helper
function makeDraggable(node) {
  let startX=0, startY=0, sx=0, sy=0, dragging=false;
  node.addEventListener("pointerdown", (e) => {
    dragging = true; node.setPointerCapture(e.pointerId);
    node.classList.add("dragging");
    const r = node.getBoundingClientRect();
    sx = r.left; sy = r.top;
    startX = e.clientX; startY = e.clientY;
  });
  node.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const stageRect = stage.getBoundingClientRect();
    let nx = sx + dx - stageRect.left + node.offsetWidth/2;
    let ny = sy + dy - stageRect.top + node.offsetHeight/2;
    node.style.left = nx + "px";
    node.style.top = ny + "px";
    // redraw links cheaply by full refresh
    svg.innerHTML = "";
    // partial: we'll postpone full recompute to pointerup
    $$(`.node`).forEach(()=>{});
    // draw lines live
    // Recompute edges quickly:
    const id = node.dataset.id;
    // Not drawing per-edge incrementally; allow flicker acceptable. Full redraw on up.
    renderEdgesLive();
  });
  node.addEventListener("pointerup", () => {
    dragging=false; node.classList.remove("dragging");
    // save position
    const pos = getPositions();
    const rect = node.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    pos[node.dataset.id] = { x: rect.left - s.left + rect.width/2, y: rect.top - s.top + rect.height/2 };
    setPositions(pos);
    renderTheory(); // full redraw
  });
}
function renderEdgesLive() {
  svg.innerHTML = "";
  const edges = [];
  DATA.plotPoints.forEach(pp => {
    if (pp.pp_arc) edges.push([pp.id, canonicalId(pp.pp_arc, "arcs"), "Arc"]);
    if (pp.pp_location) edges.push([pp.id, canonicalId(pp.pp_location, "locations"), "Location"]);
    (pp.pp_characters||[]).forEach(c => edges.push([pp.id, canonicalId(c, "characters"), "Character"]));
  });
  const all = [
    ...DATA.arcs.map(x => ({...x, t:"arcs"})),
    ...DATA.plotPoints.map(x => ({...x, t:"plotPoints"})),
    ...DATA.locations.map(x => ({...x, t:"locations"})),
    ...DATA.characters.map(x => ({...x, t:"characters"})),
    ...DATA.items.map(x => ({...x, t:"items"}))
  ];
  all.forEach(ent => {
    (ent.relationships||[]).forEach(r => edges.push([ent.id, canonicalId(r.to, r.type), r.label || ""]));
  });
  edges.forEach(([fromId, toId, label]) => {
    const A = stage.querySelector(`.node[data-id="${CSS.escape(fromId)}"]`);
    const B = stage.querySelector(`.node[data-id="${CSS.escape(toId)}"]`);
    if (!A || !B) return;
    drawLink(A, B, label);
  });
}

// ====== Dialog for node editing ======
const dlg = $("#editor-dialog");
function openDialog(id, type) {
  const ent = findById(type, id);
  $("#dialog-title").textContent = `${ent.name} — ${type}`;
  $("#dialog-details").value = ent.details || "";
  // list rels
  $("#dlg-rel-list").innerHTML = "";
  renderRelList(ent, $("#dlg-rel-list"), true);
  dlg.returnValue="";
  dlg.showModal();
  $("#dlg-save").onclick = () => {
    ent.details = $("#dialog-details").value.trim();
    saveData();
    dlg.close();
  };
  $("#dlg-add-rel").onclick = () => {
    const t = $("#dlg-rel-type").value;
    const n = $("#dlg-rel-name").value.trim();
    const l = $("#dlg-rel-label").value.trim();
    if (!n) return;
    const target = findByName(t, n);
    ent.relationships ||= [];
    ent.relationships.push({ type: t, to: target ? target.id : n, label: l });
    $("#dlg-rel-name").value = ""; $("#dlg-rel-label").value = "";
    renderRelList(ent, $("#dlg-rel-list"), true);
    saveData();
  };
}

// ====== Kickoff ======
setupFormForType();
renderList();
renderTimeline();
renderTheory();

// Recalculate links on resize
window.addEventListener("resize", () => {
  if (!$("#view-theory").classList.contains("active")) return;
  renderTheory();
});
