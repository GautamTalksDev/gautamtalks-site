/* THE HUB · personalization + signup. No frameworks, no trackers. */
(() => {
  "use strict";

  /* =============== EDIT ZONE =============== */
  const SIGNUP_ENDPOINT = ""; // paste your worker URL + "/subscribe" after deploying
  const TURNSTILE_SITEKEY = ""; // optional: Cloudflare Turnstile site key
  const LINKS = {
    calendly: "",
    discord: "",
    research: [],   // { label, url }
    mentioned: [],  // { label, url }
    collabs: []     // { label, url }
  };
  /* ========================================= */

  const $ = s => document.querySelector(s);
  const KEY = "gt.hub.v1";
  const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const openedAt = Date.now();
  $("#yr").textContent = new Date().getFullYear();
  document.body.dataset.day = new Date().getDay();

  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };
  const save = o => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch {} };

  /* ---------------- quiz ---------------- */
  const QUESTIONS = [
    { key: "track", q: "Which one sounds most like you?", opts: [
      { v:"builder", ico:"🛠️", label:"I build things", sub:"code, hardware, projects" },
      { v:"creator", ico:"🎬", label:"I make content", sub:"video, writing, posting" },
      { v:"student", ico:"🎓", label:"I'm studying", sub:"school, self-taught, both" },
      { v:"curious", ico:"👀", label:"Just exploring", sub:"here for the ideas" } ] },
    { key: "goal", q: "What would make this year a win?", opts: [
      { v:"start", ico:"🚀", label:"Finally starting", sub:"the thing I keep postponing" },
      { v:"consistency", ico:"📈", label:"Staying consistent", sub:"showing up week after week" },
      { v:"skills", ico:"🧠", label:"Getting sharper", sub:"real skills, real depth" },
      { v:"community", ico:"🤝", label:"Finding my people", sub:"others on the same climb" } ] },
    { key: "depth", q: "How do you like your info?", opts: [
      { v:"quick", ico:"⚡", label:"Fast and punchy", sub:"give me the short version" },
      { v:"deep", ico:"📚", label:"Deep and detailed", sub:"I'll read the whole thing" } ] }
  ];

  let qi = 0, profile = {};

  function renderQ() {
    const q = QUESTIONS[qi];
    $("#qpFill").style.width = ((qi + 1) / QUESTIONS.length * 100) + "%";
    $("#quizStep").textContent = `QUESTION ${qi + 1} OF ${QUESTIONS.length}`;
    $("#quizQ").textContent = q.q;
    $("#quizBack").hidden = qi === 0;
    $("#quizOpts").innerHTML = q.opts.map(o =>
      `<button class="qopt" type="button" data-v="${esc(o.v)}">
         <span class="qopt-ico">${o.ico}</span>
         <span><strong>${esc(o.label)}</strong><span class="qopt-sub">${esc(o.sub)}</span></span>
       </button>`).join("");
    $("#quizOpts").querySelectorAll(".qopt").forEach(b => b.addEventListener("click", () => {
      profile[q.key] = b.dataset.v;
      if (qi < QUESTIONS.length - 1) { qi++; renderQ(); }
      else { show("hbEmail"); tailorEmailCopy(); }
    }));
  }

  /* ---------------- templates ---------------- */
  const TEMPLATES = {
    builder: {
      tag: "BUILDER MODE",
      head: "BUILD IT ROUGH,<br>THEN BUILD IT RIGHT.",
      sub: "Papers, tools and project links first. The stuff you can open in another tab and actually use tonight.",
      order: ["research", "mentioned", "collabs", "newsletter", "call", "basecamp"]
    },
    creator: {
      tag: "CREATOR MODE",
      head: "POST IT BEFORE<br>IT'S PERFECT.",
      sub: "Collabs, gear and everything I mention on camera, up top. The behind-the-scenes shelf.",
      order: ["mentioned", "collabs", "newsletter", "research", "basecamp", "call"]
    },
    student: {
      tag: "STUDENT MODE",
      head: "LEARN LOUD,<br>LEARN FAST.",
      sub: "Reading, notes and people to talk to. Everything I wish someone had handed me in first year.",
      order: ["research", "newsletter", "call", "mentioned", "basecamp", "collabs"]
    },
    curious: {
      tag: "EXPLORER MODE",
      head: "GOOD. START<br>SOMEWHERE.",
      sub: "The highlights, no homework. Poke around and see what pulls you.",
      order: ["newsletter", "mentioned", "research", "basecamp", "collabs", "call"]
    }
  };
  const GOAL_NUDGE = {
    start: "Pinned for you: the one small brave thing. Pick it and go.",
    consistency: "Pinned for you: the Climb Log, so showing up gets easier.",
    skills: "Pinned for you: the deep stuff. Read, build, repeat.",
    community: "Pinned for you: the people. Basecamp opens soon."
  };
  const GOAL_PIN = { start: "mentioned", consistency: "newsletter", skills: "research", community: "basecamp" };

  const linkList = (arr, depth) => {
    if (!arr.length) return `<p>First drop lands here soon. Whatever I mention next, this is its home.</p>`;
    const items = depth === "quick" ? arr.slice(0, 3) : arr;
    return `<div class="hb-links">${items.map(l =>
      `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)} →</a>`).join("")}</div>`;
  };

  function card(id, p) {
    const depth = p.depth;
    const soonNote = t => `<p style="font-family:var(--mono);font-size:.62rem;letter-spacing:.1em">${t}</p>`;
    const C = {
      newsletter: () => ({ accent: "var(--coral)", ico: "📮", title: "THE CLIMB LOG",
        body: depth === "quick" ? "Short field notes. Occasional." : "Field notes from the climb: what I built, what broke, what I learned, and the thing I almost quit over. Occasional, never spam.",
        cta: state.subscribed ? `<p style="font-family:var(--mono);font-size:.62rem;letter-spacing:.1em;color:#0d7a4a">YOU'RE ON THE LIST ⚡</p>`
          : `<button class="hb-cta" type="button" id="reopenSignup">JOIN THE LIST ⚡</button>`, wide: true }),
      research: () => ({ accent: "var(--cobalt)", ico: "📄", title: "RESEARCH & READING",
        body: "Papers and articles from the videos.", cta: linkList(LINKS.research, depth) }),
      mentioned: () => ({ accent: "var(--sun)", ico: "🔗", title: "MENTIONED IN VIDEOS",
        body: `"Link on my website" always means here.`, cta: linkList(LINKS.mentioned, depth) }),
      collabs: () => ({ accent: "var(--coral)", ico: "🤝", title: "COLLABS & PROJECTS",
        body: "People and projects I'm building with.", cta: linkList(LINKS.collabs, depth) }),
      call: () => ({ accent: "var(--cobalt)", ico: "📅", title: "BOOK A CALL",
        body: "Content, hackathons, or starting your own climb.",
        cta: LINKS.calendly ? `<a class="hb-cta" href="${esc(LINKS.calendly)}" target="_blank" rel="noopener noreferrer">GRAB A SLOT</a>` : soonNote("CALENDAR OPENS SOON"),
        badge: LINKS.calendly ? "" : "SOON" }),
      basecamp: () => ({ accent: "var(--sun)", ico: "🏕️", title: "THE BASECAMP",
        body: "For everyone climbing their own thing.",
        cta: LINKS.discord ? `<a class="hb-cta" href="${esc(LINKS.discord)}" target="_blank" rel="noopener noreferrer">JOIN THE BASECAMP</a>` : soonNote("PITCHING THE TENTS"),
        badge: LINKS.discord ? "" : "SOON" })
    };
    const c = C[id]();
    const pinned = GOAL_PIN[p.goal] === id;
    return `<div class="hb-card${c.wide ? " wide" : ""}${pinned ? " pinned" : ""}" style="--accent:${c.accent}">
      ${pinned ? `<span class="hb-badge you">FOR YOU</span>` : c.badge ? `<span class="hb-badge">${c.badge}</span>` : ""}
      <span class="hb-ico">${c.ico}</span>
      <h3>${c.title}</h3>
      <p>${c.body}</p>
      ${c.cta}</div>`;
  }

  let state = load() || { profile: null, subscribed: false };

  function renderHub(p) {
    const t = TEMPLATES[p.track] || TEMPLATES.curious;
    $("#hbProfileTag").textContent = t.tag;
    $("#hbHeadline").innerHTML = t.head;
    $("#hbSubline").textContent = t.sub + (GOAL_NUDGE[p.goal] ? " " + GOAL_NUDGE[p.goal] : "");
    $("#hbGrid").innerHTML = t.order.map(id => card(id, p)).join("");
    const re = $("#reopenSignup");
    if (re) re.addEventListener("click", () => { show("hbEmail"); scrollTo({ top: 0, behavior: "smooth" }); });
    $("#hubGreet").textContent = t.tag;
    show("hbContent");
  }

  function show(id) {
    ["hbIntro", "hbQuiz", "hbEmail", "hbContent"].forEach(s => { $("#" + s).hidden = s !== id; });
  }

  function tailorEmailCopy() {
    const g = profile.goal;
    const copy = {
      start: "Your Hub is ready. Want a nudge in your inbox when it's time to start the next thing? Drop your email.",
      consistency: "Your Hub is ready. The Climb Log is the consistency tool: short notes, regular rhythm, zero spam.",
      skills: "Your Hub is ready. The Climb Log goes deeper than the videos: what actually worked and what didn't.",
      community: "Your Hub is ready. The Climb Log is how I tell you first when Basecamp opens."
    };
    $("#emailWhy").textContent = copy[g] || copy.start;
  }

  /* ---------------- signup ---------------- */
  const status = (msg, cls) => { const el = $("#formStatus"); el.textContent = msg; el.className = "hb-status " + (cls || ""); };

  $("#signupForm").addEventListener("submit", async e => {
    e.preventDefault();
    const email = $("#emailInput").value.trim();
    if (!/^[^\s@,;:<>"'()\[\]\\]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email) || email.length > 254)
      return status("That email doesn't look right. Mind checking it?", "err");
    if (!$("#consentBox").checked) return status("Tick the box so I know it's okay to email you.", "err");
    if ($("#hpField").value) return finish(); // bot

    const btn = $("#submitBtn");
    btn.disabled = true; status("Sending…");

    if (!SIGNUP_ENDPOINT) {
      status("Signup isn't connected yet. Opening your Hub anyway ⚡", "ok");
      return setTimeout(finish, 900);
    }
    try {
      const res = await fetch(SIGNUP_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email, consent: true, profile,
          elapsed: Date.now() - openedAt,
          website: "",
          turnstile: (window.turnstile && $("#turnstileBox").querySelector("input")) ? $("#turnstileBox").querySelector("input").value : ""
        })
      });
      const out = await res.json().catch(() => ({}));
      if (res.ok && out.ok) {
        state.subscribed = true;
        status("Check your inbox and confirm — one click and you're in ⚡", "ok");
        setTimeout(finish, 1400);
      } else {
        const msgs = { invalid_email: "That email doesn't look right.", rate_limited: "Too many tries. Give it an hour.",
          captcha_failed: "Captcha didn't pass. Try once more.", consent_required: "Tick the consent box first." };
        status(msgs[out.error] || "Something went wrong. Opening your Hub anyway ⚡", "err");
        setTimeout(finish, 1600);
      }
    } catch {
      status("Couldn't reach the server. Opening your Hub anyway ⚡", "err");
      setTimeout(finish, 1400);
    } finally { btn.disabled = false; }
  });

  function finish() {
    state.profile = profile;
    save(state);
    renderHub(profile);
    scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---------------- wiring ---------------- */
  $("#startQuiz").addEventListener("click", () => { qi = 0; profile = {}; show("hbQuiz"); renderQ(); });
  $("#skipQuiz").addEventListener("click", () => { profile = { track: "curious", goal: "start", depth: "quick" }; finish(); });
  $("#noEmail").addEventListener("click", finish);
  $("#quizBack").addEventListener("click", () => { if (qi > 0) { qi--; renderQ(); } });
  $("#retune").addEventListener("click", () => { qi = 0; profile = {}; show("hbQuiz"); renderQ(); scrollTo({ top: 0, behavior: "smooth" }); });

  /* returning visitor: straight to their Hub, no questions ever again */
  if (state.profile && state.profile.track) { profile = state.profile; renderHub(profile); }
  else show("hbIntro");

  /* optional captcha */
  if (TURNSTILE_SITEKEY) {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    s.async = true; s.defer = true;
    s.onload = () => window.turnstile && window.turnstile.render("#turnstileBox", { sitekey: TURNSTILE_SITEKEY });
    document.head.appendChild(s);
  }
})();
