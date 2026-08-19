/* THE LIBRARY · reads data/library.json. No frameworks, no inline handlers. */
(() => {
  "use strict";

  const $ = s => document.querySelector(s);
  const rows = $("#libRows"), filters = $("#libFilters"), empty = $("#libEmpty");
  document.body.dataset.day = new Date().getDay();

  const TYPES = {
    paper: { label: "PAPER", accent: "var(--cobalt)", plural: "PAPERS" },
    tool:  { label: "TOOL",  accent: "var(--coral)",  plural: "TOOLS" },
    video: { label: "VIDEO", accent: "var(--sun)",    plural: "VIDEOS", dark: true },
    read:  { label: "ARTICLE", accent: "var(--cobalt)", plural: "ARTICLES" }
  };
  const ORDER = ["paper", "tool", "video", "read"];

  /* Groups are filters that are not a single type. "mentioned" is anything I pointed at
     from a video, which is what the Hub button promises. Keep predicates and Hub counts
     in step or the button lies about how many rows are behind it. */
  const GROUPS = {
    mentioned: { label: "MENTIONED", test: i => !!(i.from && i.from.url) }
  };
  const matches = (i, f) => f === "all" || (GROUPS[f] ? GROUPS[f].test(i) : i.type === f);

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  const fmtDate = s => {
    const d = new Date(s + "T00:00:00");
    if (isNaN(d)) return "";
    const M = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
    return `ADDED ${d.getDate()} ${M[d.getMonth()]}`;
  };

  const safeHref = u => {
    try {
      const p = new URL(u, location.href);
      return (p.protocol === "https:" || p.protocol === "http:") ? p.href : null;
    } catch { return null; }
  };

  let items = [], active = "all";

  function buildRow(it) {
    const t = TYPES[it.type] || TYPES.read;
    const row = el("article", "lib-row");
    row.style.setProperty("--accent", t.accent);
    row.dataset.type = it.type;

    const meta = el("div", "lib-meta");
    const tag = el("span", "lib-tag" + (t.dark ? " on-sun" : ""), t.label);
    meta.appendChild(tag);
    const bits = [it.source, it.year, fmtDate(it.added)].filter(Boolean);
    if (bits.length) meta.appendChild(el("span", "lib-src", bits.join(" · ")));
    row.appendChild(meta);

    const h = el("h2", "lib-title");
    const href = safeHref(it.url);
    if (href) {
      const a = el("a", null, it.title);
      a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer";
      h.appendChild(a);
    } else h.textContent = it.title;
    row.appendChild(h);

    if (it.note) row.appendChild(el("p", "lib-note", it.note));

    const acts = el("div", "lib-actions");
    if (href) {
      const go = el("a", "lib-go", (it.type === "tool" ? "OPEN IT ↗" : it.type === "video" ? "WATCH IT ↗" : "READ IT ↗"));
      go.href = href; go.target = "_blank"; go.rel = "noopener noreferrer";
      acts.appendChild(go);
    }
    if (it.from) {
      const fh = safeHref(it.from.url);
      if (fh) {
        const f = el("a", "lib-from", "▶ " + (it.from.label || "FROM A VIDEO"));
        f.href = fh; f.target = "_blank"; f.rel = "noopener noreferrer";
        acts.appendChild(f);
      }
    }
    if (acts.childElementCount) row.appendChild(acts);
    return row;
  }

  function paint() {
    rows.textContent = "";
    const list = items.filter(i => matches(i, active));
    list.forEach(i => rows.appendChild(buildRow(i)));
    empty.hidden = list.length > 0;
    filters.querySelectorAll(".lib-chip").forEach(c =>
      c.setAttribute("aria-pressed", String(c.dataset.f === active)));
  }

  function buildFilters() {
    const counts = {};
    items.forEach(i => { counts[i.type] = (counts[i.type] || 0) + 1; });
    const defs = [{ f: "all", label: "ALL", n: items.length }];
    ORDER.forEach(k => { if (counts[k]) defs.push({ f: k, label: TYPES[k].plural, n: counts[k] }); });
    Object.keys(GROUPS).forEach(g => {
      const n = items.filter(GROUPS[g].test).length;
      if (n) defs.push({ f: g, label: GROUPS[g].label, n });
    });
    if (defs.length <= 2) return;            // one category only, a filter row would be noise
    defs.forEach(d => {
      const b = el("button", "lib-chip", `${d.label} · ${d.n}`);
      b.type = "button"; b.dataset.f = d.f; b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", () => { active = d.f; paint(); });
      filters.appendChild(b);
    });
  }

  const wanted = new URLSearchParams(location.search).get("f");

  fetch("../data/library.json", { cache: "no-cache" })
    .then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(d => {
      items = Array.isArray(d.items) ? d.items : [];
      if (wanted && items.some(i => matches(i, wanted))) active = wanted;
      buildFilters();
      paint();
    })
    .catch(() => {
      empty.hidden = false;
      empty.textContent = "The shelf is not loading right now. Try a refresh.";
    });
})();
