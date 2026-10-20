# Trid docs

The documentation website for the Trid library. Plain HTML, CSS and JS: no dependencies, no build step.

## Viewing it

ES modules don't load from `file://`, so serve the **repo root** (the docs import `../trid/`):

```sh
cd path/to/repo   # the folder that contains trid/ and docs/
python3 -m http.server
```

Then open <http://localhost:8000/docs/>.

To publish on GitHub Pages, serve the repository root from the `master` branch; the docs will be at `/docs/`.

## Files

| File | Content |
| --- | --- |
| `index.html` | Introduction and quick start |
| `concepts.html` | Coordinates, meshes, objects, camera, frame loop |
| `scene.html` | The `Scene` class |
| `shapes.html` | `makeShape`, `scaleMesh`, custom meshes |
| `tools.html` | Built-in tools |
| `custom-tools.html` | The tool interface and writing your own |
| `api.html` | Every export, module by module |
| `examples.html` | Live example gallery |
| `assets/style.css` | All styles (light and dark themes) |
| `assets/docs.js` | Sidebar, pager, theme toggle, code highlighting, demo runner |

## Editing

**Add a page:** copy an existing page, keep its `<head>` and `<main class="content">`, and add it to the `NAV` list at the top of `assets/docs.js`. The sidebar and previous/next links come from that list.

**Add a live demo:**

```html
<div class="demo" data-hint="Optional hint shown on the canvas">
  <canvas id="demo-unique-id"></canvas>
<pre><code class="language-js">import { Scene } from "./trid/scene.js";
const scene = new Scene(document.getElementById("demo-unique-id"), { width: 800, height: 300 });
// ...
</code></pre>
</div>
```

- The code shown is the code that runs. Imports written as `"./trid/..."` are pointed at the real library, so demos always use the current code.
- Escape `<` as `&lt;` and `&` as `&amp;` inside the code.
- Demos start when they scroll into view. A demo that throws shows its error on the canvas.

**Keep it in sync:** when an option, default or method changes in `trid/`, update its table here. The defaults in the docs were taken from the source, not the JSDoc comments (for example, `makeShape("box")` defaults to 0.6 × 0.6 × 0.6).
