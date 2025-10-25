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
    content: "┌────────┬─────────────────────┐",
    className: "text-base-content/60",
  },
  {
    prefix: "",
    content: "│ Status │ Migrations          │",
    className: "text-base-content/60",
  },
  {
    prefix: "",
    content: "├────────┼─────────────────────┤",
    className: "text-base-content/60",
  },
  {
    prefix: "",
    content: "│ ✓      │ 1 migration applied │",
    className: "text-success",
    spotlight: true,
    delay: 10500,
  },
  {
    prefix: "",
    content: "└────────┴─────────────────────┘",
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
    <div className="rounded-lg overflow-hidden shadow-lg max-w-full" style={{ backgroundColor: 'var(--color-code-bg)' }}>
      {/* Terminal window header */}
      <div className="px-4 py-2 flex items-center gap-2" style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}>
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#FF5F56' }}></div>
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#FFBD2E' }}></div>
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#27C93F' }}></div>
      </div>

      {/* Code block */}
      <div className="relative overflow-x-auto">
        {/* Spotlight gradient effect */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(600px circle at 50% ${(activeIndex / codeLines.length) * 100}%, rgba(29, 78, 216, 0.15), transparent 40%)`,
            transition: "all 0.5s ease-out",
          }}
        />

        <pre className="p-4 overflow-x-auto" style={{ fontFamily: '"Courier New", Courier, monospace !important', fontSize: '0.875rem', margin: 0, background: 'transparent' }}>
          {codeLines.map((line, index) => (
            <div
              key={index}
              style={{
                opacity: getLineOpacity(index),
                transition: "opacity 0.5s ease-out",
                cursor: line.spotlight ? "pointer" : "default",
                fontFamily: 'inherit',
              }}
              onMouseEnter={() => line.spotlight && setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              onClick={() => line.spotlight && setActiveIndex(index)}
            >
              {line.prefix && (
                <span style={{ color: 'var(--color-code-comment)', fontFamily: 'inherit' }}>{line.prefix} </span>
              )}
              <span style={{
                color: line.className?.includes('success') ? 'var(--color-code-function)' :
                       line.className?.includes('info') ? 'var(--color-code-keyword)' :
                       line.className?.includes('text-base-content/60') ? 'var(--color-code-comment)' :
                       'var(--color-code-text)',
                fontFamily: 'inherit'
              }}>{line.content}</span>
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}
