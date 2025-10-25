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
