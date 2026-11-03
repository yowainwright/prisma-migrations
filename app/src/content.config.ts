import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";

const documentation = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/docs" }),
  schema:
    z.object({
      title: z.string(),
      description: z.string(),
    }),
});

export const collections = {
  docs: documentation,
};
