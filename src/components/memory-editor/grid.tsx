"use client";

import {
  FormEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { CheckCircle2, Download, Filter, Plus, Save, Upload, XCircle } from "lucide-react";
import {
  MEMORY_EDITOR_TYPES,
  type MemoryEditorDiffResult,
  type MemoryEditorImportRow,
  type MemoryEditorMemoryType,
  type MemoryEditorRow,
} from "@/lib/memory-editor/diff";

interface MemoryEditorGridProps {
  initialRows: MemoryEditorRow[];
  focusedNpcId?: string | null;
}

interface DraftRow extends MemoryEditorRow {
  localId: string;
  isNew?: boolean;
}

interface PendingImport {
  format: "csv" | "json";
  content: string;
}

interface ImportEnvelope {
  success: boolean;
  data?: {
    diff?: MemoryEditorDiffResult;
    committed?: number;
    memories?: MemoryEditorRow[];
  };
  error?: {
    message?: string;
  };
}

const inputClass =
  "w-full min-w-0 border border-transparent bg-transparent px-2 py-1 text-xs text-szn-text-1 outline-none focus:border-szn-signal focus:bg-szn-bg";

function toDraftRows(rows: MemoryEditorRow[]): DraftRow[] {
  return rows.map((row) => ({ ...row, localId: row.id }));
}

function tagsText(tags: string[]) {
  return tags.join("|");
}

function parseTags(value: string) {
  return [...new Set(value.split(/[|,]/).map((tag) => tag.trim()).filter(Boolean))].slice(0, 50);
}

function toImportRows(rows: DraftRow[]): MemoryEditorImportRow[] {
  return rows.map((row) => ({
    id: row.isNew ? null : row.id,
    content: row.content,
    memoryType: row.memoryType,
    tags: row.tags,
    namespace: row.namespace,
    importance: row.importance,
    npcId: row.npcId,
    agentId: row.agentId,
    source: row.source,
  }));
}

function changedRows(drafts: DraftRow[], initial: MemoryEditorRow[]) {
  const byId = new Map(initial.map((row) => [row.id, row]));
  return drafts.filter((row) => {
    if (row.isNew) return row.content.trim().length > 0;
    const original = byId.get(row.id);
    if (!original) return true;
    return JSON.stringify(toImportRows([{ ...row }])[0]) !== JSON.stringify({
      id: original.id,
      content: original.content,
      memoryType: original.memoryType,
      tags: original.tags,
      namespace: original.namespace,
      importance: original.importance,
      npcId: original.npcId,
      agentId: original.agentId,
      source: original.source,
    });
  });
}

function diffMessages(diff: MemoryEditorDiffResult | null) {
  const map = new Map<string, { errors: string[]; warnings: string[] }>();
  if (!diff) return map;
  for (const item of diff.items) {
    map.set(item.id || item.key, { errors: item.errors, warnings: item.warnings });
  }
  return map;
}

export function MemoryEditorGrid({ initialRows, focusedNpcId = null }: MemoryEditorGridProps) {
  const [rows, setRows] = useState<DraftRow[]>(() => toDraftRows(initialRows));
  const [baseline, setBaseline] = useState(initialRows);
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "updatedAt", desc: true }]);
  const [message, setMessage] = useState<string | null>(null);
  const [diff, setDiff] = useState<MemoryEditorDiffResult | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dirtyRows = useMemo(() => changedRows(rows, baseline), [rows, baseline]);
  const rowMessages = useMemo(() => diffMessages(diff), [diff]);
  const exportSuffix = focusedNpcId ? `&npc_id=${encodeURIComponent(focusedNpcId)}` : "";

  function updateRow(localId: string, patch: Partial<DraftRow>) {
    setRows((current) => current.map((row) => (row.localId === localId ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((current) => {
      const localId = `new-${current.filter((row) => row.isNew).length + 1}`;
      return [{
        id: localId,
        localId,
        isNew: true,
        content: "",
        memoryType: "fact",
        tags: [],
        namespace: "default",
        importance: 5,
        npcId: focusedNpcId,
        agentId: focusedNpcId,
        source: "memory-editor",
        isEncrypted: false,
        createdAt: new Date().toISOString(),
        updatedAt: null,
      }, ...current];
    });
  }

  async function postImport(importPayload: PendingImport, commit: boolean) {
    setIsBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/memory-editor/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...importPayload,
          commit,
          npcId: focusedNpcId,
        }),
      });
      const payload = (await response.json().catch(() => null)) as ImportEnvelope | null;
      if (!payload?.data || (!response.ok && !payload.data.diff)) {
        throw new Error(payload?.error?.message || "Memory import failed");
      }
      const nextDiff = payload.data.diff || null;
      setDiff(nextDiff);
      if (commit && response.ok && payload.data.memories) {
        setRows(toDraftRows(payload.data.memories));
        setBaseline(payload.data.memories);
        setPendingImport(null);
        setMessage(`${payload.data.committed || 0} memory edits committed.`);
      } else if (nextDiff?.summary.blocked) {
        setMessage(`${nextDiff.summary.blocked} rows blocked.`);
      } else if (!commit) {
        setMessage("Diff preview ready.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Memory import failed");
    } finally {
      setIsBusy(false);
    }
  }

  async function previewDrafts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const changed = dirtyRows;
    if (changed.length === 0) {
      setMessage("No edits to preview.");
      return;
    }
    const importPayload = {
      format: "json" as const,
      content: JSON.stringify({ rows: toImportRows(changed) }),
    };
    setPendingImport(importPayload);
    await postImport(importPayload, false);
  }

  async function commitPending() {
    if (!pendingImport) return;
    await postImport(pendingImport, true);
  }

  async function handleImportFile(file: File | null) {
    if (!file) return;
    const content = await file.text();
    const format: "csv" | "json" = file.name.toLowerCase().endsWith(".json") ? "json" : "csv";
    const importPayload = { format, content };
    setPendingImport(importPayload);
    await postImport(importPayload, false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const columns = useMemo<ColumnDef<DraftRow>[]>(() => [
    {
      accessorKey: "npcId",
      header: "NPC",
      size: 140,
      cell: ({ row }) => (
        <input aria-label="NPC ID"
          value={row.original.npcId || ""}
          onChange={(event) => updateRow(row.original.localId, { npcId: event.target.value || null, agentId: event.target.value || row.original.agentId })}
          className={inputClass}
          placeholder="npc_id"
        />
      ),
    },
    {
      accessorKey: "content",
      header: "Memory",
      size: 520,
      cell: ({ row }) => (
        <textarea
          value={row.original.content}
          onChange={(event) => updateRow(row.original.localId, { content: event.target.value })}
          className={`${inputClass} min-h-16 resize-y leading-5`}
          disabled={row.original.isEncrypted}
        />
      ),
    },
    {
      accessorKey: "memoryType",
      header: "Type",
      size: 140,
      cell: ({ row }) => (
        <select
          value={row.original.memoryType}
          onChange={(event) => updateRow(row.original.localId, { memoryType: event.target.value as MemoryEditorMemoryType })}
          className={inputClass}
        >
          {MEMORY_EDITOR_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
      ),
    },
    {
      accessorKey: "tags",
      header: "Tags",
      size: 180,
      cell: ({ row }) => (
        <input aria-label="Tags"
          value={tagsText(row.original.tags)}
          onChange={(event) => updateRow(row.original.localId, { tags: parseTags(event.target.value) })}
          className={inputClass}
          placeholder="lore|qa"
        />
      ),
    },
    {
      accessorKey: "namespace",
      header: "Namespace",
      size: 130,
      cell: ({ row }) => (
        <input aria-label="Namespace"
          value={row.original.namespace}
          onChange={(event) => updateRow(row.original.localId, { namespace: event.target.value })}
          className={inputClass}
        />
      ),
    },
    {
      accessorKey: "importance",
      header: "Priority",
      size: 96,
      cell: ({ row }) => (
        <input aria-label="Importance"
          type="number"
          min={1}
          max={10}
          value={row.original.importance}
          onChange={(event) => updateRow(row.original.localId, { importance: Number(event.target.value) })}
          className={inputClass}
        />
      ),
    },
    {
      accessorKey: "updatedAt",
      header: "Updated",
      size: 130,
      cell: ({ row }) => (
        <span className="block px-2 py-1 text-xs text-szn-text-3">
          {row.original.updatedAt ? new Date(row.original.updatedAt).toLocaleDateString() : "new"}
        </span>
      ),
    },
  ], []);

  const table = useReactTable({
    data: rows,
    columns,
    state: { globalFilter, sorting },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.localId,
  });

  return (
    <form onSubmit={previewDrafts} className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-[260px] flex-1 items-center gap-2 border border-szn-border-subtle bg-szn-surface-1 px-3 py-2">
          <Filter className="h-4 w-4 text-szn-text-3" aria-hidden="true" />
          <input aria-label="Global Filter"
            value={globalFilter}
            onChange={(event) => setGlobalFilter(event.target.value)}
            className="w-full bg-transparent text-sm text-szn-text-1 outline-none"
            placeholder="Filter memories"
          />
        </div>
        <button type="button" onClick={addRow} className="szn-btn-ghost inline-flex items-center gap-2 px-3 py-2 text-sm">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add
        </button>
        <a href={`/api/memory-editor/export?format=csv${exportSuffix}`} className="szn-btn-ghost inline-flex items-center gap-2 px-3 py-2 text-sm">
          <Download className="h-4 w-4" aria-hidden="true" />
          CSV
        </a>
        <a href={`/api/memory-editor/export?format=json${exportSuffix}`} className="szn-btn-ghost inline-flex items-center gap-2 px-3 py-2 text-sm">
          <Download className="h-4 w-4" aria-hidden="true" />
          JSON
        </a>
        <label className="szn-btn-ghost inline-flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
          <Upload className="h-4 w-4" aria-hidden="true" />
          Import
          <input aria-label="File upload"
            ref={fileInputRef}
            type="file"
            accept=".csv,.json,text/csv,application/json"
            className="sr-only"
            onChange={(event) => void handleImportFile(event.target.files?.[0] || null)}
          />
        </label>
        <button type="submit" disabled={isBusy || dirtyRows.length === 0} className="szn-btn-signal inline-flex items-center gap-2 px-3 py-2 text-sm disabled:opacity-60">
          <Save className="h-4 w-4" aria-hidden="true" />
          Preview
        </button>
        <button type="button" onClick={() => void commitPending()} disabled={isBusy || !pendingImport || (diff?.summary.blocked || 0) > 0} className="szn-btn-signal inline-flex items-center gap-2 px-3 py-2 text-sm disabled:opacity-60">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Commit
        </button>
      </div>

      {message && (
        <div className="border border-szn-border-subtle bg-szn-surface-1 px-4 py-3 text-sm text-szn-text-2">
          {message}
        </div>
      )}

      {diff && (
        <div className="grid grid-cols-2 gap-px border border-szn-border-subtle bg-szn-border-subtle md:grid-cols-5">
          <Metric label="Rows" value={diff.summary.total.toString()} />
          <Metric label="Create" value={diff.summary.create.toString()} />
          <Metric label="Update" value={diff.summary.update.toString()} />
          <Metric label="Same" value={diff.summary.unchanged.toString()} />
          <Metric label="Blocked" value={diff.summary.blocked.toString()} />
        </div>
      )}

      <div className="overflow-x-auto border border-szn-border-subtle bg-szn-surface-1">
        <table className="min-w-[1180px] w-full border-collapse text-left">
          <thead className="bg-szn-bg">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    style={{ width: header.getSize() }}
                    className="border-b border-szn-border-subtle px-2 py-2 text-xs font-medium uppercase text-szn-text-3"
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
                <th className="w-[260px] border-b border-szn-border-subtle px-2 py-2 text-xs font-medium uppercase text-szn-text-3">
                  Status
                </th>
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-10 text-center text-sm text-szn-text-2">
                  No editable memories.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => {
                const messages = rowMessages.get(row.original.isNew ? row.original.localId : row.original.id);
                return (
                  <tr key={row.id} className="border-b border-szn-border-subtle align-top">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="border-r border-szn-border-subtle">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                    <td className="px-2 py-2 text-xs">
                      {row.original.isEncrypted ? (
                        <span className="inline-flex items-center gap-1 text-amber-300">
                          <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                          encrypted
                        </span>
                      ) : messages?.errors.length ? (
                        <div className="space-y-1 text-red-300">
                          {messages.errors.map((error) => <div key={error}>{error}</div>)}
                        </div>
                      ) : messages?.warnings.length ? (
                        <div className="space-y-1 text-amber-300">
                          {messages.warnings.map((warning) => <div key={warning}>{warning}</div>)}
                        </div>
                      ) : (
                        <span className="text-szn-text-3">{row.original.isNew ? "new" : "ready"}</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </form>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-szn-bg px-4 py-3">
      <div className="text-2xl font-semibold text-szn-text-1">{value}</div>
      <div className="mt-1 text-xs uppercase text-szn-text-3">{label}</div>
    </div>
  );
}
