import { defineConfig } from "vitepress";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const tridDir = path.join(repoRoot, "trid");

export default defineConfig({
  title: "Trid",
  description: "A small 3D renderer for the HTML canvas.",
  // For GitHub Pages at https://zachr622.github.io/Trid/, build with DOCS_BASE=/Trid/
  base: process.env.DOCS_BASE ?? "/",
  srcExclude: ["README.md"],
  cleanUrls: true,
  head: [["link", { rel: "icon", type: "image/svg+xml", href: `${process.env.DOCS_BASE ?? "/"}favicon.svg` }]],

  themeConfig: {
    logo: "/logo.svg",

    nav: [
      { text: "Guide", link: "/getting-started" },
      { text: "API", link: "/api" },
      { text: "Examples", link: "/examples" },
    ],

    sidebar: [
      {
        text: "Getting started",
        items: [
          { text: "Introduction", link: "/getting-started" },
          { text: "Core concepts", link: "/concepts" },
        ],
      },
      {
        text: "Guides",
        items: [
          { text: "Scene", link: "/scene" },
          { text: "Shapes & meshes", link: "/shapes" },
          { text: "Filled faces", link: "/faces" },
          { text: "Loading OBJ files", link: "/obj" },
          { text: "Tools", link: "/tools" },
          { text: "Writing a tool", link: "/custom-tools" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "API reference", link: "/api" },
          { text: "Examples", link: "/examples" },
        ],
      },
    ],

    socialLinks: [{ icon: "github", link: "https://github.com/ZachR622/Trid" }],

    editLink: {
      pattern: "https://github.com/ZachR622/Trid/edit/master/docs/:path",
      text: "Edit this page on GitHub",
    },

    search: { provider: "local" },

    outline: { level: [2, 3] },
  },

  vite: {
    plugins: [
      {
        // Demo files import "./trid/..." like a real project would.
        // Point those imports at the library folder at the repo root.
        name: "trid-demo-imports",
        enforce: "pre",
        resolveId(id, importer) {
          if (id.startsWith("./trid/") && importer?.replace(/\\/g, "/").includes("/docs/demos/")) {
            return path.join(tridDir, id.slice("./trid/".length));
          }
        },
      },
    ],
    server: { fs: { allow: [repoRoot] } },
  },
});
