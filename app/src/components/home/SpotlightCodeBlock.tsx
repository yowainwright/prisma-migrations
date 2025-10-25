import { useState, useEffect } from "react";

interface CodeLine {
  prefix?: string;
  content: string;
  className?: string;
  style?: React.CSSProperties;
  spotlight?: boolean;
  delay?: number;
}

const codeLines: CodeLine[] = [
  { prefix: "$", content: "npm install prisma-migrations", spotlight: true, delay: 0 },
  { prefix: "", content: "added 15 packages in 2s", className: "text-base-content/60" },
  { prefix: "", content: "" },
  {
    prefix: "$",
    content: "npx prisma-migrations init",
    className: "mt-2",
    spotlight: true,
    delay: 1500,
  },
  {
    prefix: "",
    content: "✓ Created migration: 1234567890_initial_migration",
    className: "text-success",
    spotlight: true,
    delay: 3000,
  },
  {
    prefix: "",
    content: "  Location: ./prisma/migrations/1234567890_initial_migration",
    className: "text-base-content/60",
  },
  { prefix: "", content: "" },
  {
    prefix: "$",
    content: "npx prisma-migrations create add_users_table",
    spotlight: true,
    delay: 4500,
  },
  {
    prefix: "",
    content: "✓ Created migration: 1234567891_add_users_table",
    className: "text-success",
    spotlight: true,
    delay: 6000,
  },
  { prefix: "", content: "" },
  {
    prefix: "$",
    content: "npx prisma-migrations up",
    spotlight: true,
    delay: 7500,
  },
  {
    prefix: "",
    content: "Running 1234567891_add_users_table...",
    className: "text-info",
  },
  {
    prefix: "",
    content: "✓ Applied 1234567891_add_users_table",
    className: "text-success",
    spotlight: true,
    delay: 9000,
  },
  { prefix: "", content: "" },
  {
    prefix: "",
    content: "┌──────────┬──────────────────────────────────────────────────┐",
    className: "text-base-content/60",
  },
  {
    prefix: "",
    content: "│ Status   │ Migrations                                       │",
    className: "text-base-content/60",
  },
  {
    prefix: "",
    content: "├──────────┼──────────────────────────────────────────────────┤",
    className: "text-base-content/60",
  },
  {
    prefix: "",
    content: "│ ✓        │ 1 migration(s) applied successfully              │",
    className: "text-success",
    spotlight: true,
    delay: 10500,
  },
  {
    prefix: "",
    content: "└──────────┴──────────────────────────────────────────────────┘",
    className: "text-base-content/60",
  },
];

export default function SpotlightCodeBlock() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useEffect(() => {
    const spotlightLines = codeLines
      .map((line, index) => ({ ...line, index }))
      .filter((line) => line.spotlight);

    let currentSpotlight = 0;

    const cycleSpotlight = () => {
      const nextSpotlight = (currentSpotlight + 1) % spotlightLines.length;
      const nextLine = spotlightLines[nextSpotlight];

      setActiveIndex(nextLine.index);
      currentSpotlight = nextSpotlight;
    };

    // Start the cycle
    const interval = setInterval(cycleSpotlight, 1000);

    return () => clearInterval(interval);
  }, []);

  const getLineOpacity = (index: number) => {
    if (hoveredIndex !== null) {
      return hoveredIndex === index ? 1 : 0.4;
    }
    const line = codeLines[index];
    if (!line.spotlight) return 0.8;
    return activeIndex === index ? 1 : 0.5;
  };

  return (
    <div className="mockup-code text-xs sm:text-sm md:text-base relative overflow-hidden">
      {/* Spotlight gradient effect */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(600px circle at 50% ${(activeIndex / codeLines.length) * 100}%, rgba(29, 78, 216, 0.25), transparent 40%)`,
          transition: "all 0.5s ease-out",
        }}
      />

      {codeLines.map((line, index) => (
        <pre
          key={index}
          data-prefix={line.prefix}
          className={line.className}
          style={{
            ...line.style,
            opacity: getLineOpacity(index),
            transition: "opacity 0.5s ease-out",
            cursor: line.spotlight ? "pointer" : "default",
          }}
          onMouseEnter={() => line.spotlight && setHoveredIndex(index)}
          onMouseLeave={() => setHoveredIndex(null)}
          onClick={() => line.spotlight && setActiveIndex(index)}
        >
          <code>{line.content}</code>
        </pre>
      ))}
    </div>
  );
}
