'use client';

import { useMemo } from 'react';
import { useDashboardTranslation } from '@/contexts/DashboardLocaleContext';
import { intensityBand } from '@/lib/author/ui/graph-bands';
import { GRAPH_COLUMNS } from '@/app/(dashboard)/dashboard/author/table-specs';
import { displayCharacterName, resolveRelationLabel } from './relationship-graph-model';

type JsonRecord = Record<string, unknown>;

interface GraphNode {
  id: string;
  label?: string;
}

interface GraphEdge {
  id: string;
  from: string;
  to: string;
  type?: string;
  intensity?: number;
  valid_at?: string;
}

interface RelationshipGraphTableProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function RelationshipGraphTable({ nodes, edges }: RelationshipGraphTableProps) {
  const { t } = useDashboardTranslation();

  const nameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const node of nodes) {
      m.set(node.id, displayCharacterName(node));
    }
    return m;
  }, [nodes]);

  const rows: JsonRecord[] = useMemo(
    () =>
      edges.map((edge) => {
        const band = intensityBand(edge.intensity ?? 0);
        const relation = resolveRelationLabel(edge.type, t);
        const bandLabel = t(`author.graph.bands.${band.key}`) ?? band.key;
        return {
          id: edge.id,
          from_name: nameMap.get(edge.from) ?? displayCharacterName({ id: edge.from }),
          relation: relation.label,
          to_name: nameMap.get(edge.to) ?? displayCharacterName({ id: edge.to }),
          intensity_band: bandLabel,
          valid_at: edge.valid_at ?? '',
        };
      }),
    [edges, nameMap, t],
  );

  if (rows.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-md border border-slate-200">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs tracking-normal text-slate-500">
          <tr>
            {GRAPH_COLUMNS.map((col) => (
              <th key={col} className="px-3 py-2 font-medium">
                {t(`author.table.graph.columns.${col}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={String(row.id)} className="align-top">
              {GRAPH_COLUMNS.map((col) => (
                <td key={col} className="px-3 py-2 text-slate-700">
                  {String(row[col] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
