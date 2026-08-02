/* GAUTAM TALKS · app.js — consolidated. One file, one flow. */
(() => {
  "use strict";

  /* ================= EDIT ZONE — daily updates live here ================= */
  const HUB = {
    newsletterAction: "", calendly: "", discord: "",
    research: [], mentioned: [], collabs: []
  };
  const NOW = [
    "CURRENTLY ⚡ BUILDING TWO STARTUPS", "FILMING THE NEXT DROP",
    "SAYING YES TO THE HARD THING", "ASCENDING, OBVIOUSLY"
  ];
  const MOTTOS = [
    "START MESSY. FIX IT LIVE.","DONE TODAY BEATS PERFECT SOMEDAY.",
    "THE FIRST STEP IS THE WHOLE TRICK.","NOBODY FEELS READY. GO ANYWAY.",
    "SMALL REPS. BIG CLIMB.","YOU LEARN THE ROPE BY CLIMBING IT.",
    "FUTURE YOU IS WATCHING. IMPRESS THEM.","SAY YES, THEN FIGURE IT OUT.",
    "EVERY EXPERT WAS ONCE THIS CONFUSED.","BUILD LOUD. LEARN FASTER.",
    "THE SUMMIT IS JUST STACKED MONDAYS.","COURAGE FIRST. SKILL CATCHES UP.",
    "SHIP IT. THE SECOND VERSION IS EASIER.","YOUR PACE. YOUR MOUNTAIN. KEEP MOVING."
  ];
  const DARES = [
    "Send the email you've been avoiding. Right now.",
    "Text one friend your idea before you're 'ready'.",
    "Do 20 pushups. The site will wait.",
    "Open the project you abandoned. Just open it.",
    "Write one sentence of the thing. Only one.",
    "Compliment a stranger's work today.",
    "Book the thing. Figure out the rest later.",
    "Delete one app that eats your evenings.",
    "Ask the question you think is dumb. It isn't.",
    "Go outside for 10 minutes. Bring the idea with you."
  ];
  const UPLOADS = "UUpyDH6OnqrndhkyYXAdyS3A";
  /* ====================================================================== */

  const $ = s => document.querySelector(s);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const day = new Date().getDay();
  document.body.dataset.day = day;
  $("#yr").textContent = new Date().getFullYear();

  const doy = Math.floor((Date.now() - new Date(new Date().getFullYear(),0,0)) / 864e5);
  const eyebrow = $(".eyebrow");
  if (eyebrow) eyebrow.textContent = "TODAY'S FUEL \u26A1 " + MOTTOS[doy % MOTTOS.length];

  const ticker = $("#nowTicker");
  if (ticker) { const l = NOW.join(" \u26A1 ") + " \u26A1 "; ticker.innerHTML = `<span>${l}</span>`.repeat(4); }

  /* elevation */
  const label = $("#elevLabel"), bar = $(".topbar");
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    const p = max > 0 ? Math.min(1, scrollY / max) : 0;
    bar.style.setProperty("--p", p);
    label.textContent = "ELEV " + Math.round(p * 5900).toLocaleString() + " M";
  };
  addEventListener("scroll", onScroll, { passive: true }); onScroll();

  /* reveals */
  const bands = [...document.querySelectorAll(".band")];
  if (!reduced && "IntersectionObserver" in window) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add("on"); io.unobserve(e.target); }
    }), { threshold: .1 });
    bands.forEach(b => io.observe(b));
  } else bands.forEach(b => b.classList.add("on"));

  /* sparks */
  const burst = (x, y, n = 10) => {
    if (reduced) return;
    for (let i = 0; i < n; i++) {
      const s = document.createElement("span");
      s.className = "spark"; s.textContent = "\u26A1";
      const a = Math.random() * Math.PI * 2, r = 50 + Math.random() * 80;
      s.style.left = x + "px"; s.style.top = y + "px";
      s.style.setProperty("--dx", Math.cos(a) * r + "px");
      s.style.setProperty("--dy", Math.sin(a) * r - 30 + "px");
      s.style.setProperty("--rot", (Math.random() * 180 - 90) + "deg");
      document.body.appendChild(s); setTimeout(() => s.remove(), 750);
    }
  };
  document.addEventListener("click", e => {
    const t = e.target.closest(".cta, .hub-cta, .navlink");
    if (t) burst(e.clientX, e.clientY);
  });

  /* ---------- LATEST: feed → thumbnails; else poster. Then toys. ---------- */
  const grid = $("#latestGrid");
  const PALETTES = ["SUNDAY CHILL","MONDAY CLASSIC","TUESDAY MEADOW","WEDNESDAY SUNSET","THURSDAY PEACH","FRIDAY CANDY","SATURDAY TRAIL"];
  function toys(extraSideHTML) {
    const cs = getComputedStyle(document.body);
    return `${extraSideHTML || ""}
      <div class="toy toy-dice">
        <span class="toy-tag">CLIMB DICE \u00B7 ONE SMALL BRAVE THING</span>
        <p id="dareTxt">${DARES[Math.floor(Math.random()*DARES.length)]}</p>
        <button class="toy-btn" id="dareBtn" type="button">ROLL AGAIN \u26A1</button>
      </div>
      <div class="toy">
        <span class="toy-tag">HYPE CHARGER \u00B7 TAP TO POWER THE CLIMB</span>
        <div class="charge-row">
          <span class="charge-bolt" id="chBolt">\u26A1</span>
          <span class="charge-count" id="chCount">0</span>
          <button class="toy-btn" id="chBtn" type="button">CHARGE</button>
        </div>
        <span class="toy-tag" id="chMsg">EVERY TAP COUNTS. LIKE EVERY REP.</span>
      </div>
      <div class="toy">
        <span class="toy-tag">TODAY'S GRADE \u00B7 THE SITE RE-INKS DAILY</span>
        <span class="palette-name">${PALETTES[day]}</span>
        <div class="palette-dots">
          <span class="pdot" style="background:${cs.getPropertyValue("--suntint")}"></span>
          <span class="pdot" style="background:${cs.getPropertyValue("--sky")}"></span>
          <span class="pdot" style="background:${cs.getPropertyValue("--blush")}"></span>
          <span class="toy-tag">COME BACK TOMORROW</span>
        </div>
      </div>`;
  }
  function wireToys() {
    const dare = $("#dareBtn");
    if (dare) dare.addEventListener("click", () => {
      let n; const cur = $("#dareTxt").textContent;
      do { n = DARES[Math.floor(Math.random()*DARES.length)]; } while (n === cur);
      $("#dareTxt").textContent = n;
    });
    let charge = 0;
    const MS = {10:"WARMED UP. KEEP GOING.",25:"NOW WE'RE CLIMBING.",50:"CERTIFIED HYPE MACHINE.",100:"LEGEND. GO BUILD SOMETHING."};
    const chb = $("#chBtn");
    if (chb) chb.addEventListener("click", e => {
      charge++;
      $("#chCount").textContent = charge;
      const b = $("#chBolt");
      b.style.transform = `scale(${Math.min(1+charge*.02,1.9)}) rotate(${(charge%2?-1:1)*8}deg)`;
      b.style.filter = `drop-shadow(0 0 ${Math.min(charge/3,14)}px rgba(255,210,63,.9))`;
      if (MS[charge]) $("#chMsg").textContent = MS[charge];
      if (charge % 10 === 0) burst(e.clientX || innerWidth/2, e.clientY || innerHeight/2, 12);
    });
  }
  const renderPoster = () => {
    grid.innerHTML = `
      <a class="latest-main poster" href="https://www.youtube.com/playlist?list=${UPLOADS}" target="_blank" rel="noopener noreferrer">
        <span class="p-play">\u25B6</span>
        <span class="p-t">PLAY THE NEWEST DROP</span>
        <span class="p-s">ALWAYS POINTS AT THE LATEST VIDEO</span>
      </a>
      <div class="latest-side">${toys()}</div>`;
    wireToys();
  };
  fetch("data/feed.json", { cache: "no-store" })
    .then(r => { if (!r.ok) throw 0; return r.json(); })
    .then(d => {
      const v = (d.videos || []).slice(0, 2);
      if (!v.length) throw 0;
      const thumbs = v.slice(1).map(x => `
        <a class="latest-item has-img" href="${esc(x.url)}" target="_blank" rel="noopener">
          <img src="${esc(x.thumb)}" alt="" loading="lazy">
          <div class="li-pad"><h3>${esc(x.title)}</h3>
          <time datetime="${esc(x.date)}">${new Date(x.date).toLocaleDateString("en-CA",{year:"numeric",month:"short",day:"numeric"}).toUpperCase()}</time></div>
        </a>`).join("");
      grid.innerHTML = `
        <a class="latest-main has-thumb" href="${esc(v[0].url)}" target="_blank" rel="noopener noreferrer">
          <img class="lm-img" src="${esc(v[0].thumb).replace("hqdefault","maxresdefault")}" data-fallback="${esc(v[0].thumb)}" alt="">
          <span class="lm-play">\u25B6</span>
          <span class="lm-chip">\u26A1 NEWEST</span>
          <span class="lm-title">${esc(v[0].title)}</span>
        </a>
        <div class="latest-side">${toys(thumbs)}</div>`;
      wireToys();
      const lm = grid.querySelector(".lm-img");
      if (lm) lm.addEventListener("error", function onErr() {
        this.removeEventListener("error", onErr);
        this.src = this.dataset.fallback;
      }, { once: true });
    })
    .catch(renderPoster);

  /* ---------- HUB ---------- */
  const hub = $("#hubGrid");
  if (hub) {
  const linkList = a => a.length
    ? `<div class="hub-links">${a.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} \u2192</a>`).join("")}</div>`
    : `<p>First drop lands here soon. Whatever I mention next, this is its home.</p>`;
  hub.innerHTML = `
    <div class="hub-card hub-wide" style="--accent:var(--coral)">
      <span class="hub-icon">\u{1F4EE}</span><h3>THE CLIMB LOG \u00B7 NEWSLETTER</h3>
      <p>Short field notes from the climb: what I built, what I learned, what's next. Unsubscribing takes one click.</p>
      ${HUB.newsletterAction
        ? `<form class="nl-form" action="${esc(HUB.newsletterAction)}" method="POST">
             <input type="email" name="email" required placeholder="you@email.com" aria-label="Email address">
             <button type="submit">COUNT ME IN \u26A1</button></form>`
        : `<a class="hub-cta" href="https://www.youtube.com/@GautamKhoslaOfficial" target="_blank" rel="noopener">FIRST ISSUE COMING \u00B7 WATCH MEANWHILE</a>`}
      <span class="nl-note">YOUR EMAIL POWERS THE NEWSLETTER ONLY. NEVER SOLD, NEVER SHARED.</span>
    </div>
    <div class="hub-card" style="--accent:var(--cobalt)"><span class="hub-icon">\u{1F4C4}</span><h3>RESEARCH &amp; READING</h3><p>Papers and articles from the videos.</p>${linkList(HUB.research)}</div>
    <div class="hub-card" style="--accent:var(--sun)"><span class="hub-icon">\u{1F517}</span><h3>MENTIONED IN VIDEOS</h3><p>"Link on my website" always means here.</p>${linkList(HUB.mentioned)}</div>
    <div class="hub-card" style="--accent:var(--coral)"><span class="hub-icon">\u{1F91D}</span><h3>COLLABS &amp; PROJECTS</h3><p>People and projects I'm building with.</p>${linkList(HUB.collabs)}</div>
    <div class="hub-card" style="--accent:var(--cobalt)">${HUB.calendly?"":`<span class="hub-soon">SOON</span>`}<span class="hub-icon">\u{1F4C5}</span><h3>BOOK A CALL</h3><p>Content, hackathons, or starting your own climb. Let's talk.</p>${HUB.calendly?`<a class="hub-cta" href="${esc(HUB.calendly)}" target="_blank" rel="noopener">GRAB A SLOT</a>`:`<p style="font-family:var(--mono);font-size:.62rem;letter-spacing:.1em">CALENDAR OPENS SOON</p>`}</div>
    <div class="hub-card" style="--accent:var(--sun)">${HUB.discord?"":`<span class="hub-soon">SOON</span>`}<span class="hub-icon">\u{1F3D5}\uFE0F</span><h3>THE BASECAMP \u00B7 COMMUNITY</h3><p>For everyone climbing their own thing. Opening when it can be great.</p>${HUB.discord?`<a class="hub-cta" href="${esc(HUB.discord)}" target="_blank" rel="noopener">JOIN THE BASECAMP</a>`:`<p style="font-family:var(--mono);font-size:.62rem;letter-spacing:.1em">PITCHING THE TENTS</p>`}</div>`;
  }

  /* ---------- bolt parallax ---------- */
  if (!reduced && matchMedia("(pointer:fine)").matches) {
    const bolts = [...document.querySelectorAll(".floatbolt")];
    addEventListener("mousemove", e => {
      const x = e.clientX/innerWidth - .5, y = e.clientY/innerHeight - .5;
      bolts.forEach((b,i)=>{const d=(i+1)*14;b.style.translate=`${x*d}px ${y*d}px`;});
    }, { passive:true });
  }

  /* ---------- THE ROOM launcher (self-hosted three.js, honest failures) ---------- */
  const photo = $("#heroPhoto");
  let loading = false;
  const roomFail = why => {
    $("#roomLoading").style.display = "none";
    const t = $("#roomTitle");
    t.hidden = false;
    let n = t.querySelector(".rt-err");
    if (!n) { n = document.createElement("p"); n.className = "rt-sub rt-err"; t.insertBefore(n, t.querySelector("button")); }
    n.textContent = "3D COULDN'T LOAD IN THIS VIEWER (" + why + ") \u00B7 IT RUNS ON THE LIVE SITE";
  };
  function enterRoom() {
    const flash = document.createElement("div");
    flash.className = "flash"; document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 320);
    $("#room").hidden = false;
    $("#roomTitle").hidden = true;
    $("#roomLoading").style.display = "grid";
    document.body.style.overflow = "hidden";
    const go = () => {
      try { window.GT_ROOM.open(); }
      catch (e) { roomFail(e.message || "scene error"); }
    };
    const loadRoom = () => {
      if (window.GT_ROOM) return go();
      const r = document.createElement("script");
      r.src = "room.js"; r.onload = go; r.onerror = () => roomFail("room.js");
      document.head.appendChild(r);
    };
    if (window.THREE) return loadRoom();
    if (loading) return;
    loading = true;
    const s = document.createElement("script");
    s.src = "three.min.js";
    s.onload = () => { loading = false; loadRoom(); };
    s.onerror = () => { loading = false; roomFail("three.js"); };
    document.head.appendChild(s);
  }
  if (photo) {
    photo.addEventListener("click", enterRoom);
    photo.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); enterRoom(); }
    });
  }
  const closeRoom = () => {
    if (window.GT_ROOM) GT_ROOM.close();
    else { $("#room").hidden = true; document.body.style.overflow = ""; }
  };
  $("#roomExit").addEventListener("click", closeRoom);
  $("#roomDone").addEventListener("click", closeRoom);
  $("#roomSkip").addEventListener("click", () => window.GT_ROOM && GT_ROOM.skip());
  addEventListener("keydown", e => { if (e.key === "Escape" && !$("#room").hidden) closeRoom(); });
})();
