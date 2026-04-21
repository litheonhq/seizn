import type { CanonLock, MemoryResult } from "./types.js";

export function printJson(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function compact(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export function printTable(rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) {
    console.log("No rows.");
    return;
  }

  const headers = Object.keys(rows[0]);
  const widths = headers.map((header) =>
    Math.min(
      48,
      Math.max(
        header.length,
        ...rows.map((row) => compact(row[header]).replace(/\s+/g, " ").length)
      )
    )
  );

  const render = (values: string[]) =>
    values
      .map((value, index) => {
        const width = widths[index];
        const clipped = value.length > width ? `${value.slice(0, Math.max(width - 3, 0))}...` : value;
        return clipped.padEnd(width, " ");
      })
      .join("  ");

  console.log(render(headers));
  console.log(render(widths.map((width) => "-".repeat(width))));
  for (const row of rows) {
    console.log(render(headers.map((header) => compact(row[header]).replace(/\s+/g, " "))));
  }
}

function csvCell(value: unknown) {
  const raw = compact(value);
  if (!/[",\n\r]/.test(raw)) return raw;
  return `"${raw.replaceAll('"', '""')}"`;
}

export function toCsv(rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(csvCell).join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
  ];
  return `${lines.join("\n")}\n`;
}

export function lockRows(locks: CanonLock[]) {
  return locks.map((lock) => ({
    id: lock.id || "",
    npc: lock.npcId || "world",
    scope: lock.scope,
    severity: lock.severity,
    active: lock.active,
    statement: lock.statement,
  }));
}

export function memoryRows(memories: MemoryResult[]) {
  return memories.map((memory) => ({
    id: memory.id || "",
    type: memory.memory_type || memory.memory_class || "",
    npc: memory.entity_id || memory.agent_id || "",
    created: memory.created_at || "",
    content: memory.content || memory.memory || "",
  }));
}
