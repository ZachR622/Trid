# Trid docs

The documentation site for Trid, built with [VitePress](https://vitepress.dev).

## Running it

From the repo root (needs Node 18+):

```sh
npm install          # once
npm run docs:dev     # local server with live reload, usually http://localhost:5173
npm run docs:build   # static site in docs/.vitepress/dist
npm run docs:preview # serve the built site
```

## Publishing

Pushing to `master` publishes the docs at `https://zachr622.github.io/Trid/`. The GitHub Action in `.github/workflows/docs.yml` builds them with `DOCS_BASE=/Trid/` (the site lives under `/Trid/`) and deploys to GitHub Pages. It can also be started by hand from the repo's **Actions** tab.

To build the same thing locally:

```sh
DOCS_BASE=/Trid/ npm run docs:build
```

## Files

| Path | Content |
| --- | --- |
| `*.md` | One page each. `index.md` is the home page. |
| `demos/*.js` | Live demos, one file each |
| `.vitepress/config.mts` | Title, nav, sidebar, search |
| `.vitepress/theme/` | Brand colors, the `<Demo>` component and the live home page logo (`HeroLogo.vue`) |
| `public/` | Static files (`logo.svg`, `favicon.svg`) |

## Logo

The logo is a plain cube. `public/logo.svg` and `public/favicon.svg` are hand-written SVGs; the moving cube on the home page is drawn by Trid itself in `.vitepress/theme/HeroLogo.vue`.

## Editing

**Add a page:** create `docs/my-page.md` and add it to `sidebar` in `.vitepress/config.mts`.

**Add a live demo:** create `docs/demos/my-demo.js`:

```js
import { Scene } from "./trid/index.js";

export default function (canvas) {
  const scene = new Scene(canvas, { width: 800, height: 300 });
  // ...
  scene.start();
  return () => scene.destroy(); // runs when the reader leaves the page
}
```

Then show it on a page, with its source underneath:

```md
<Demo src="my-demo" hint="Optional hint shown on the canvas" />

<<< @/demos/my-demo.js
```

- Demo files import `"./trid/..."` like a real project; the config points those imports at the library folder, so demos always run the current code.
- Remove any `window` / `document` listeners in the returned cleanup function.
- Demos start when they scroll into view. A demo that throws shows its error on the canvas.

**Keep it in sync:** when an option, default or method changes in `trid/`, update its table here. The defaults in the docs were taken from the source, not the JSDoc comments (for example, `makeShape("box")` defaults to 0.6 × 0.6 × 0.6).
