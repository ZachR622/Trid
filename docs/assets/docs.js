// Trid docs: builds the page chrome (top bar, sidebar, pager),
// highlights code and runs the live demos.

// Every page, in reading order. Add new pages here.
const NAV = [
  { group: "Getting started", pages: [
    { href: "index.html", title: "Introduction" },
    { href: "concepts.html", title: "Core concepts" },
  ]},
  { group: "Guides", pages: [
    { href: "scene.html", title: "Scene" },
    { href: "shapes.html", title: "Shapes & meshes" },
    { href: "tools.html", title: "Tools" },
    { href: "custom-tools.html", title: "Writing a tool" },
  ]},
  { group: "Reference", pages: [
    { href: "api.html", title: "API reference" },
    { href: "examples.html", title: "Examples" },
  ]},
];

// The library folder, resolved from this file (docs/assets/ → ../../trid/)
const LIB_URL = new URL("../../trid/", import.meta.url).href;

const ICONS = {
  logo: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">
    <path d="M16 3 28 10v12L16 29 4 22V10z" stroke="var(--accent)"/>
    <path d="M4 10l12 7 12-7M16 17v12" stroke="var(--accent)" opacity=".55"/></svg>`,
  menu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>`,
  sun: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`,
  moon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>`,
};

const current = location.pathname.split("/").pop() || "index.html";
const flat = NAV.flatMap(g => g.pages);

// ---------- Page chrome ----------

function buildChrome() {
  const main = document.querySelector("main");

  const top = document.createElement("header");
  top.className = "topbar";
  top.innerHTML = `
    <button class="icon-btn" id="menu-btn" aria-label="Open menu">${ICONS.menu}</button>
    <a class="brand" href="index.html">${ICONS.logo} Trid <small>docs</small></a>
    <span class="spacer"></span>
    <button class="icon-btn" id="theme-btn" aria-label="Toggle dark mode"></button>`;

  const side = document.createElement("nav");
  side.className = "sidebar";
  side.innerHTML = NAV.map(g => `
    <h4>${g.group}</h4>
    ${g.pages.map(p => `<a href="${p.href}"${p.href === current ? ' class="active"' : ""}>${p.title}</a>`).join("")}
  `).join("");

  const layout = document.createElement("div");
  layout.className = "layout";
  main.replaceWith(layout);
  layout.append(side, main);
  document.body.prepend(top);

  // Previous / next links
  const i = flat.findIndex(p => p.href === current);
  if (i !== -1) {
    const prev = flat[i - 1], next = flat[i + 1];
    const pager = document.createElement("div");
    pager.className = "pager";
    pager.innerHTML =
      (prev ? `<a href="${prev.href}"><small>← Previous</small>${prev.title}</a>` : "<span></span>") +
      (next ? `<a class="next" href="${next.href}"><small>Next →</small>${next.title}</a>` : "<span></span>");
    main.append(pager);
  }

  // Mobile menu
  top.querySelector("#menu-btn").addEventListener("click", () => document.body.classList.toggle("nav-open"));
  main.addEventListener("click", () => document.body.classList.remove("nav-open"));

  // Theme toggle (the initial theme is set by a small script in each page's <head>)
  const btn = top.querySelector("#theme-btn");
  const isDark = () => {
    const t = document.documentElement.dataset.theme;
    return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  };
  const paint = () => { btn.innerHTML = isDark() ? ICONS.sun : ICONS.moon; };
  btn.addEventListener("click", () => {
    const next = isDark() ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("trid-docs-theme", next); } catch {}
    paint();
  });
  paint();
}

function addAnchors() {
  for (const h of document.querySelectorAll("main h2[id], main h3[id]")) {
    const a = document.createElement("a");
    a.className = "anchor";
    a.href = "#" + h.id;
    a.textContent = "#";
    a.setAttribute("aria-label", "Link to this section");
    h.append(a);
  }
}

// ---------- Code blocks ----------

function addCopyButton(code) {
  const pre = code.parentElement;
  const wrap = document.createElement("div");
  wrap.className = "code-wrap";
  pre.replaceWith(wrap);
  wrap.append(pre);

  const btn = document.createElement("button");
  btn.className = "copy-btn";
  btn.textContent = "Copy";
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(code.textContent);
      btn.textContent = "Copied";
    } catch {
      btn.textContent = "Failed";
    }
    setTimeout(() => (btn.textContent = "Copy"), 1200);
  });
  wrap.append(btn);
}

const KEYWORDS = new Set(("import from export const let var new return function class if else for of in " +
  "while do break continue true false null undefined this extends async await static get set typeof switch case default throw").split(" "));

const TOKEN = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(\d+(?:\.\d+)?)\b|([A-Za-z_$][\w$]*)(?=\s*\()|([A-Za-z_$][\w$]*)/g;

// Tiny JS highlighter: comments, strings, numbers, keywords, calls
function highlight(code) {
  const src = code.textContent;
  let out = "", last = 0;
  for (const m of src.matchAll(TOKEN)) {
    out += esc(src.slice(last, m.index));
    const [text, com, str, num, call, word] = m;
    if (com) out += span("com", text);
    else if (str) out += span("str", text);
    else if (num) out += span("num", text);
    else if (call) out += KEYWORDS.has(call) ? span("kw", text) : span("fn", text);
    else if (word && KEYWORDS.has(word)) out += span("kw", text);
    else out += esc(text);
    last = m.index + text.length;
  }
  code.innerHTML = out + esc(src.slice(last));
}

const span = (cls, t) => `<span class="tok-${cls}">${esc(t)}</span>`;
const esc = t => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---------- Live demos ----------
//
// A demo is:
//   <div class="demo" data-hint="...">
//     <canvas id="demo-x"></canvas>
//     <pre><code class="language-js">...code...</code></pre>
//   </div>
//
// The code shown is the code that runs. Imports written as
// "./trid/..." are pointed at the real library folder.
// Demos start when they scroll into view.

function setupDemos() {
  const demos = [...document.querySelectorAll(".demo")];
  for (const demo of demos) {
    const canvas = demo.querySelector("canvas");
    const stage = document.createElement("div");
    stage.className = "demo-stage";
    canvas.replaceWith(stage);
    stage.append(canvas);
    if (demo.dataset.hint) {
      const hint = document.createElement("div");
      hint.className = "demo-hint";
      hint.textContent = demo.dataset.hint;
      stage.append(hint);
    }
  }

  const io = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      io.unobserve(entry.target);
      runDemo(entry.target);
    }
  }, { rootMargin: "200px" });
  demos.forEach(d => io.observe(d));
}

async function runDemo(demo) {
  const code = demo.querySelector("code").textContent
    .replace(/(["'])\.\/trid\//g, `$1${LIB_URL}`);
  const url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
  try {
    await import(url);
  } catch (err) {
    console.error(err);
    const box = document.createElement("div");
    box.className = "demo-error";
    box.textContent = "Demo failed to run:\n" + err.message;
    demo.querySelector(".demo-stage").append(box);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------- Start ----------
// (Runs last so every constant above is defined.)

buildChrome();
addAnchors();
document.querySelectorAll("pre > code").forEach(addCopyButton);
document.querySelectorAll("code.language-js").forEach(highlight);
setupDemos();
