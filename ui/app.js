import { h, render } from "preact";
import { useState, useEffect } from "preact/hooks";
import { html } from "htm/preact";
import { Dashboard } from "./dashboard.js";
import { Practice } from "./practice.js";

function parseRoute(hash) {
  const raw = (hash || "").replace(/^#/, "") || "/";
  const [pathname, query] = raw.split("?");
  return { pathname, params: new URLSearchParams(query || "") };
}

function App() {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = (to) => {
    window.location.hash = to.replace(/^#/, "");
  };

  const isPractice = route.pathname.startsWith("/practice");

  return html`
    <div class="shell">
      <nav class="nav">
        <a class="brand" href="#/">🇫🇷 Bonjour</a>
        <div class="nav-links">
          <a href="#/" class=${isPractice ? "" : "active"}>Dashboard</a>
          <a href="#/practice" class=${isPractice ? "active" : ""}>Practice</a>
        </div>
      </nav>
      <main class="main">
        ${isPractice
          ? html`<${Practice} params=${route.params} navigate=${navigate} />`
          : html`<${Dashboard} navigate=${navigate} />`}
      </main>
      <footer class="foot">
        Local-first French tutor · data never leaves this machine
      </footer>
    </div>
  `;
}

render(html`<${App} />`, document.getElementById("app"));
