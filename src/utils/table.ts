export function createTable(headers: string[], rows: string[][]): string {
  const colWidths = [10, 50];
  const lines: string[] = [];

  const topBorder = "┌" + colWidths.map((w) => "─".repeat(w)).join("┬") + "┐";
  const midBorder = "├" + colWidths.map((w) => "─".repeat(w)).join("┼") + "┤";
  const bottomBorder = "└" + colWidths.map((w) => "─".repeat(w)).join("┴") + "┘";

  const formatRow = (cells: string[]): string => {
    return (
      "│" +
      cells
        .map((cell, i) => {
          const stripped = stripAnsi(cell);
          const visibleLength = stripped.length;
          const padding = colWidths[i] - visibleLength;
          return cell + " ".repeat(Math.max(0, padding));
        })
        .join("│") +
      "│"
    );
  };

  lines.push(topBorder);
  lines.push(formatRow(headers));
  lines.push(midBorder);

  rows.forEach((row) => {
    lines.push(formatRow(row));
  });

  lines.push(bottomBorder);

  return lines.join("\n");
}

function stripAnsi(str: string): string {
  return str.replace(/\u001b\[\d+m/g, "");
}
