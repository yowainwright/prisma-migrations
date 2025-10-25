import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import react from "@astrojs/react";

import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://jeffry.in",
  base: "/prisma-migrations",
  integrations: [mdx(), react()],
  trailingSlash: "never",

  markdown: {
    shikiConfig: {
      theme: {
        name: "yves-klein-blue",
        type: "dark",
        colors: {
          "editor.background": "#031030",
          "editor.foreground": "#A8E6FF",
        },
        tokenColors: [
          {
            scope: ["comment", "punctuation.definition.comment"],
            settings: { foreground: "#8DC891", fontStyle: "italic" },
          },
          {
            scope: ["keyword", "storage.type", "storage.modifier"],
            settings: { foreground: "#82CFFF" },
          },
          {
            scope: ["string", "string.quoted"],
            settings: { foreground: "#FFF4B3" },
          },
          {
            scope: ["entity.name.function", "support.function"],
            settings: { foreground: "#FF8BA7" },
          },
          {
            scope: ["variable", "variable.parameter"],
            settings: { foreground: "#82CFFF" },
          },
          {
            scope: ["constant.numeric", "constant.language"],
            settings: { foreground: "#C9E5B4" },
          },
          {
            scope: ["entity.name.type", "entity.name.class", "support.type", "support.class"],
            settings: { foreground: "#FF8BA7" },
          },
          {
            scope: ["keyword.operator"],
            settings: { foreground: "#FFB3D9" },
          },
          {
            scope: ["punctuation"],
            settings: { foreground: "#FFE55C" },
          },
        ],
      },
    },
  },

  vite: {
    plugins: [tailwindcss()],
  },
});
