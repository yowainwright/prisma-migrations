import { resolveDocsUrl } from "../utils/urlResolver";

const SIDEBAR = [
  {
    title: "Getting Started",
    items: [
      {
        title: "Introduction",
        href: resolveDocsUrl("introduction"),
      },
      {
        title: "Installation & Quick Start",
        href: resolveDocsUrl("setup"),
      },
    ],
  },
  {
    title: "Code Labs",
    items: [
      {
        title: "New Project Setup",
        href: resolveDocsUrl("codelab-new-project"),
      },
      {
        title: "Migrate from Prisma Migrate",
        href: resolveDocsUrl("codelab-migrate"),
      },
    ],
  },
  {
    title: "Guides",
    items: [
      {
        title: "Writing Migrations",
        href: resolveDocsUrl("workspaces"),
      },
    ],
  },
  {
    title: "Reference",
    items: [
      {
        title: "API Reference",
        href: resolveDocsUrl("api-reference"),
      },
    ],
  },
];

export default SIDEBAR;
