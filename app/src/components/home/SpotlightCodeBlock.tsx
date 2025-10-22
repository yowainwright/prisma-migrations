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
  { prefix: "$", content: "npm install -g prisma-migrations", spotlight: true, delay: 0 },
  { prefix: "", content: "bun add v1.1.38", className: "text-base-content/60" },
  {
    prefix: "",
    content: "Resolving dependencies",
    className: "text-base-content/60",
  },
  {
    prefix: "",
    content: "Installed prisma-migrations with binaries:",
    className: "text-base-content/60",
  },
  { prefix: "", content: " - prisma-migrations", className: "text-success" },
  {
    prefix: "$",
    content: "cd my-awesome-project",
    className: "mt-4",
    spotlight: true,
    delay: 1500,
  },
  { prefix: "$", content: "prisma-migrations", spotlight: true, delay: 3000 },
  { prefix: "", content: "⚡ Prisma Migrations v0.0.9", className: "text-warning" },
  {
    prefix: "",
    content: "📦 Scanning for Prisma schema changes...",
    className: "text-info",
    spotlight: true,
    delay: 4500,
  },
  { prefix: "", content: "" },
  {
    prefix: "",
    content: "Found schema changes:",
    className: "text-base-content/80",
  },
  {
    prefix: "",
    content: "  • Added User model",
    className: "text-base-content/60",
    spotlight: true,
    delay: 6000,
  },
  {
    prefix: "",
    content: "  • Added Post model",
    className: "text-base-content/60",
    spotlight: true,
    delay: 6000,
  },
  {
    prefix: "",
    content: "  • Modified Profile model",
    className: "text-base-content/60",
    spotlight: true,
    delay: 6000,
  },
  { prefix: "", content: "" },
  { prefix: "", content: "🔄 Creating migration...", className: "text-info" },
  {
    prefix: "",
    content: "✓ Created migration: 20240121_add_user_post",
    className: "text-success",
    spotlight: true,
    delay: 7500,
  },
  {
    prefix: "",
    content: "✓ Applied migration to database",
    className: "text-success",
    spotlight: true,
    delay: 7500,
  },
  {
    prefix: "",
    content: "✓ Generated Prisma Client",
    className: "text-success",
    spotlight: true,
    delay: 7500,
  },
  { prefix: "", content: "" },
  {
    prefix: "",
    content: "✨ Successfully applied schema changes",
    style: { color: "#1D4ED8" },
    spotlight: true,
    delay: 9000,
  },
  {
    prefix: "",
    content: "💡 Run 'bun install' to apply the changes",
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
