import React, { useState, useEffect } from "react";
import { codeLines, TERMINAL_COLORS } from "./constants";

const SPOTLIGHT_GRADIENT_BG = (activeIndex: number) =>
  `radial-gradient(600px circle at 50% ${(activeIndex / codeLines.length) * 100}%, rgba(29, 78, 216, 0.15), transparent 40%)`;

const getLineColor = (className?: string) => {
  if (className?.includes('success')) return 'var(--color-code-function)';
  if (className?.includes('info')) return 'var(--color-code-keyword)';
  if (className?.includes('text-base-content/60')) return 'var(--color-code-comment)';
  return 'var(--color-code-text)';
};

const getLineOpacity = (
  index: number,
  hoveredIndex: number | null,
  activeIndex: number,
  spotlight: boolean | undefined
) => {
  if (hoveredIndex !== null) {
    return hoveredIndex === index ? 1 : 0.4;
  }
  if (!spotlight) return 0.8;
  return activeIndex === index ? 1 : 0.5;
};

const TerminalDots = () => (
  <div className="px-4 py-2 flex items-center gap-2" style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}>
    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: TERMINAL_COLORS.red }}></div>
    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: TERMINAL_COLORS.yellow }}></div>
    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: TERMINAL_COLORS.green }}></div>
  </div>
);

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

    const interval = setInterval(cycleSpotlight, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="rounded-lg overflow-hidden shadow-lg max-w-full" style={{ backgroundColor: 'var(--color-code-bg)' }}>
      <TerminalDots />

      <div className="relative overflow-x-auto">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: SPOTLIGHT_GRADIENT_BG(activeIndex),
            transition: "all 0.5s ease-out",
          }}
        />

        <pre className="p-4 overflow-x-auto" style={{ fontFamily: '"Courier New", Courier, monospace !important', fontSize: '0.875rem', margin: 0, background: 'transparent' }}>
          {codeLines.map((line, index) => (
            <div
              key={index}
              style={{
                opacity: getLineOpacity(index, hoveredIndex, activeIndex, line.spotlight),
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
              <span style={{ color: getLineColor(line.className), fontFamily: 'inherit' }}>
                {line.content}
              </span>
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}
