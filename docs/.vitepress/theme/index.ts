import { h } from "vue";
import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import Demo from "./Demo.vue";
import HeroLogo from "./HeroLogo.vue";
import "./style.css";

export default {
  extends: DefaultTheme,
  // The home page hero shows the live 3D logo instead of an image
  Layout: () => h(DefaultTheme.Layout, null, { "home-hero-image": () => h(HeroLogo) }),
  enhanceApp({ app }) {
    app.component("Demo", Demo);
  },
} satisfies Theme;
