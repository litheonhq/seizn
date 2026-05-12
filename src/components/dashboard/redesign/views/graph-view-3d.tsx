'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph3D, {
  type ForceGraphMethods,
  type GraphData,
  type LinkObject,
  type NodeObject,
} from 'react-force-graph-3d';
import * as THREE from 'three';
import SpriteText from 'three-spritetext';
import {
  compactCharacterLabel,
  initialForLabel,
} from '@/components/author/graph/relationship-graph-model';
import { GRAPH_VIEWBOX } from './graph-layout';
import type { GraphEdge, GraphNode } from './types';

export type PreparedDashboardGraphEdge = GraphEdge & {
  key: string;
  relationLabel: string;
};

interface GraphView3DProps {
  nodes: GraphNode[];
  edges: PreparedDashboardGraphEdge[];
  selectedId: string | null;
  selectedTieKey: string | null;
  active: boolean;
  ariaLabel: string;
  colorForRole: (role: string) => string;
  onSelectNode: (id: string) => void;
  onSelectTie: (key: string, nodeId: string) => void;
}

type DashboardGraphNode3D = GraphNode & {
  compactLabel: string;
  degree: number;
  value: number;
};

type DashboardGraphLink3D = PreparedDashboardGraphEdge & {
  source: string;
  target: string;
};

type DashboardGraphNodeObject = NodeObject<DashboardGraphNode3D>;
type DashboardGraphLinkObject = LinkObject<DashboardGraphNode3D, DashboardGraphLink3D>;

interface Size {
  width: number;
  height: number;
}

interface CameraDragState {
  pointerId: number;
  startX: number;
  startY: number;
  theta: number;
  phi: number;
  radius: number;
}

const MIN_CAMERA_PHI = 0.22;
const MAX_CAMERA_PHI = Math.PI - 0.22;
const MIN_CAMERA_RADIUS = 96;
const MAX_CAMERA_RADIUS = 900;

export function GraphView3D({
  nodes,
  edges,
  selectedId,
  selectedTieKey,
  active,
  ariaLabel,
  colorForRole,
  onSelectNode,
  onSelectTie,
}: GraphView3DProps) {
  const graphRef = useRef<ForceGraphMethods<DashboardGraphNode3D, DashboardGraphLink3D> | undefined>(undefined);
  const dragStateRef = useRef<CameraDragState | null>(null);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState<Size>({ width: 760, height: 520 });
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredTieKey, setHoveredTieKey] = useState<string | null>(null);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    try {
      if (active) {
        graph.resumeAnimation();
      } else {
        graph.pauseAnimation();
      }
    } catch {
      // The force graph may still be creating its internal renderer.
    }
  }, [active]);

  useEffect(
    () => () => {
      try {
        graphRef.current?.pauseAnimation();
      } catch {
        // Best-effort cleanup for the external renderer.
      }
    },
    [],
  );

  useEffect(() => {
    if (!container) return;

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const nextWidth = Math.max(320, Math.floor(entry.contentRect.width));
      const nextHeight = Math.max(420, Math.floor(entry.contentRect.height));
      setSize((current) =>
        current.width === nextWidth && current.height === nextHeight
          ? current
          : { width: nextWidth, height: nextHeight },
      );
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [container]);

  const degreeByNode = useMemo(() => {
    const degree = new Map<string, number>();
    for (const node of nodes) degree.set(node.id, 0);
    for (const edge of edges) {
      degree.set(edge.a, (degree.get(edge.a) ?? 0) + 1);
      degree.set(edge.b, (degree.get(edge.b) ?? 0) + 1);
    }
    return degree;
  }, [edges, nodes]);

  const nodeLabelById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node.label])),
    [nodes],
  );

  const activeTieKey = hoveredTieKey ?? selectedTieKey;
  const activeTie = useMemo(
    () => edges.find((edge) => edge.key === activeTieKey),
    [activeTieKey, edges],
  );

  const connectedNodeIds = useMemo(() => {
    const connected = new Set<string>();
    const focusId = hoveredNodeId ?? selectedId;
    if (focusId) {
      connected.add(focusId);
      for (const edge of edges) {
        if (edge.a === focusId) connected.add(edge.b);
        if (edge.b === focusId) connected.add(edge.a);
      }
    }
    if (activeTie) {
      connected.add(activeTie.a);
      connected.add(activeTie.b);
    }
    return connected;
  }, [activeTie, edges, hoveredNodeId, selectedId]);

  const graphData = useMemo<GraphData<DashboardGraphNode3D, DashboardGraphLink3D>>(() => {
    const graphNodes: DashboardGraphNodeObject[] = nodes.map((node, index) => {
      const degree = degreeByNode.get(node.id) ?? 0;
      return {
        ...node,
        id: node.id,
        compactLabel: compactCharacterLabel(node.label, 11),
        degree,
        value: Math.max(4, Math.round(node.r / 5)),
        x: (node.x - GRAPH_VIEWBOX.width / 2) * 0.66,
        y: (GRAPH_VIEWBOX.height / 2 - node.y) * 0.66,
        z: ((degree + index) % 7 - 3) * 16,
      };
    });

    const graphLinks: DashboardGraphLinkObject[] = edges.map((edge) => ({
      ...edge,
      source: edge.a,
      target: edge.b,
    }));

    return { nodes: graphNodes, links: graphLinks };
  }, [degreeByNode, edges, nodes]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;

    const charge = graph.d3Force('charge') as { strength?: (value: number) => unknown } | undefined;
    const linkForce = graph.d3Force('link') as { distance?: (value: number) => unknown } | undefined;
    charge?.strength?.(-135);
    linkForce?.distance?.(76);
    graph.d3ReheatSimulation();

    // Park the camera at a known angle so the graph is framed immediately,
    // before the force simulation settles. Without this the user can land on a
    // blank scene and only sees content after manually rotating.
    graph.cameraPosition({ x: 0, y: 80, z: 360 }, { x: 0, y: 0, z: 0 }, 0);

    // A short kick zoom for the initial render — final fit is handled by the
    // onEngineStop callback on <ForceGraph3D /> once positions converge.
    const timer = window.setTimeout(() => {
      try {
        graph.zoomToFit(650, 58);
      } catch {
        // The renderer may still be initializing on the first frame.
      }
    }, 220);

    return () => window.clearTimeout(timer);
  }, [graphData]);

  // One-time scene setup: lights and fog. `MeshStandardMaterial` on the node
  // spheres needs proper lighting to avoid the muddy/dim look; fog gives
  // depth cues so back-of-graph nodes recede naturally.
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const scene = graph.scene?.();
    if (!scene) return;

    // Idempotent: tag the lights we add so re-runs don't duplicate them.
    const SCENE_TAG = '__seiznGraphView3DLighting';
    const sceneAny = scene as unknown as Record<string, unknown>;
    if (sceneAny[SCENE_TAG]) return;
    sceneAny[SCENE_TAG] = true;

    scene.fog = new THREE.Fog(0xf8f3ea, 320, 920);

    const ambient = new THREE.AmbientLight(0xfff6e3, 0.55);
    scene.add(ambient);

    const key = new THREE.DirectionalLight(0xfff1d6, 0.95);
    key.position.set(180, 320, 280);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xe8d8c2, 0.45);
    fill.position.set(-220, -120, 180);
    scene.add(fill);

    const hemi = new THREE.HemisphereLight(0xfff1d6, 0x6a4c2e, 0.32);
    hemi.position.set(0, 320, 0);
    scene.add(hemi);
  }, []);

  const hasFocus = Boolean(selectedId || hoveredNodeId || activeTieKey);

  const nodeObject = useMemo(
    () =>
      (node: DashboardGraphNodeObject) => {
        const nodeId = String(node.id ?? '');
        const focused =
          nodeId === selectedId || nodeId === hoveredNodeId || connectedNodeIds.has(nodeId);
        const selected = nodeId === selectedId || nodeId === hoveredNodeId;
        const muted = hasFocus && !focused;
        const radius = Math.max(5.2, Math.min(12.5, Number(node.r ?? 22) / 3.7));
        const group = new THREE.Group();
        const fill = colorForRole(String(node.role));

        const sphere = new THREE.Mesh(
          new THREE.SphereGeometry(radius, 32, 22),
          new THREE.MeshStandardMaterial({
            color: new THREE.Color(fill),
            roughness: 0.62,
            metalness: 0.06,
            transparent: true,
            opacity: muted ? 0.24 : 0.96,
          }),
        );
        sphere.castShadow = true;
        sphere.receiveShadow = true;
        group.add(sphere);

        const shouldShowLabel = selected || focused || nodes.length <= 16 || Number(node.degree ?? 0) >= 3;
        if (shouldShowLabel) {
          const label = new SpriteText(
            node.compactLabel || compactCharacterLabel(String(node.label ?? ''), 11),
            selected ? 7.2 : 5.6,
            selected ? '#2f2118' : '#6b5a46',
          );
          label.backgroundColor = selected ? 'rgba(255,250,242,0.96)' : 'rgba(255,250,242,0.78)';
          label.borderColor = selected ? 'rgba(201,100,66,0.48)' : 'rgba(216,201,182,0.56)';
          label.borderWidth = selected ? 1.2 : 0.7;
          label.borderRadius = 4;
          label.padding = [5, 3];
          label.position.y = radius + 9;
          group.add(label);
        } else if (!muted) {
          const initial = new SpriteText(initialForLabel(String(node.label ?? '')), 7.5, '#ffffff');
          initial.fontFace = 'serif';
          initial.fontWeight = '600';
          initial.position.z = radius + 0.8;
          group.add(initial);
        }

        if (focused) {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(radius + 2.9, 0.34, 10, 56),
            new THREE.MeshBasicMaterial({
              color: new THREE.Color(selected ? '#c96442' : '#d7a387'),
              transparent: true,
              opacity: selected ? 0.9 : 0.62,
            }),
          );
          ring.rotation.x = Math.PI / 2;
          group.add(ring);
        }

        return group;
      },
    [colorForRole, connectedNodeIds, hasFocus, hoveredNodeId, nodes.length, selectedId],
  );

  const isActiveLink = (link: DashboardGraphLinkObject) => {
    const key = String(link.key ?? '');
    return (
      key === activeTieKey ||
      (selectedId ? link.a === selectedId || link.b === selectedId : false) ||
      (hoveredNodeId ? link.a === hoveredNodeId || link.b === hoveredNodeId : false)
    );
  };

  const focusNode = (node: DashboardGraphNodeObject) => {
    const x = Number(node.x ?? 0);
    const y = Number(node.y ?? 0);
    const z = Number(node.z ?? 0);
    const distance = 138;
    const length = Math.hypot(x, y, z) || 1;
    const ratio = 1 + distance / length;
    graphRef.current?.cameraPosition({ x: x * ratio, y: y * ratio, z: z * ratio }, { x, y, z }, 620);
  };

  const applyCameraOrbit = (theta: number, phi: number, radius: number) => {
    const normalizedPhi = clamp(phi, MIN_CAMERA_PHI, MAX_CAMERA_PHI);
    const normalizedRadius = clamp(radius, MIN_CAMERA_RADIUS, MAX_CAMERA_RADIUS);
    const sinPhi = Math.sin(normalizedPhi);
    const position = {
      x: normalizedRadius * sinPhi * Math.sin(theta),
      y: normalizedRadius * Math.cos(normalizedPhi),
      z: normalizedRadius * sinPhi * Math.cos(theta),
    };
    const graph = graphRef.current;
    graph?.cameraPosition(position, { x: 0, y: 0, z: 0 }, 0);
    graph?.refresh();
  };

  const currentCameraOrbit = () => {
    const camera = graphRef.current?.camera();
    const position = camera?.position;
    const x = position?.x ?? 0;
    const y = position?.y ?? 0;
    const z = position?.z ?? 320;
    const radius = clamp(Math.hypot(x, y, z) || 320, MIN_CAMERA_RADIUS, MAX_CAMERA_RADIUS);
    return {
      theta: Math.atan2(x, z),
      phi: Math.acos(clamp(y / radius, -1, 1)),
      radius,
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const orbit = currentCameraOrbit();
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      ...orbit,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId || (event.buttons & 1) !== 1) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    applyCameraOrbit(drag.theta - dx * 0.006, drag.phi + dy * 0.006, drag.radius);
    event.preventDefault();
    event.stopPropagation();
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const orbit = currentCameraOrbit();
    const scale = Math.exp(event.deltaY * 0.0011);
    applyCameraOrbit(orbit.theta, orbit.phi, orbit.radius * scale);
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      ref={setContainer}
      role="img"
      aria-label={ariaLabel}
      onPointerDownCapture={handlePointerDown}
      onPointerMoveCapture={handlePointerMove}
      onPointerUpCapture={handlePointerUp}
      onPointerCancelCapture={handlePointerUp}
      onWheelCapture={handleWheel}
      style={{
        position: 'absolute',
        inset: 0,
        minHeight: 420,
        overflow: 'hidden',
        cursor: 'grab',
        pointerEvents: active ? 'auto' : 'none',
        touchAction: 'none',
      }}
    >
      <ForceGraph3D
        ref={graphRef}
        graphData={graphData}
        width={size.width}
        height={size.height}
        backgroundColor="#f8f3ea"
        showNavInfo={false}
        nodeRelSize={5}
        nodeVal={(node) => Number(node.value ?? 5)}
        nodeLabel={(node) => String(node.label ?? '')}
        nodeThreeObject={(node) => nodeObject(node)}
        nodeThreeObjectExtend={false}
        nodeOpacity={0.96}
        linkLabel={(link) =>
          `${link.relationLabel}: ${nodeLabelById.get(link.a) ?? link.a} - ${nodeLabelById.get(link.b) ?? link.b}`
        }
        linkColor={(link) =>
          link.conflict || Number(link.strength ?? 0) < -0.1
            ? '#c96442'
            : Number(link.strength ?? 0) > 0.3
              ? '#b86a47'
              : '#b8aa91'
        }
        linkWidth={(link) => {
          const width = 0.8 + Math.min(2.2, Math.abs(Number(link.strength ?? 0)) * 1.8);
          return isActiveLink(link) ? width + 1.1 : width;
        }}
        linkOpacity={0.58}
        linkDirectionalParticles={(link) => (isActiveLink(link) ? 3 : 0)}
        linkDirectionalParticleColor={(link) =>
          link.conflict || Number(link.strength ?? 0) < -0.1 ? '#c96442' : '#b86a47'
        }
        linkDirectionalParticleWidth={(link) => (isActiveLink(link) ? 2.1 : 0)}
        linkDirectionalParticleSpeed={0.0048}
        warmupTicks={54}
        cooldownTicks={112}
        d3VelocityDecay={0.34}
        onEngineStop={() => {
          try {
            graphRef.current?.zoomToFit(720, 64);
          } catch {
            // Best-effort: the engine-stop hook may fire before the renderer
            // is fully attached on first mount.
          }
        }}
        enableNodeDrag
        enableNavigationControls
        enablePointerInteraction
        showPointerCursor
        onNodeClick={(node) => {
          const id = String(node.id ?? '');
          if (!id) return;
          onSelectNode(id);
          focusNode(node);
        }}
        onNodeHover={(node) => setHoveredNodeId(node?.id == null ? null : String(node.id))}
        onLinkClick={(link) => {
          const key = String(link.key ?? '');
          if (!key) return;
          onSelectTie(key, String(link.a ?? ''));
        }}
        onLinkHover={(link) => setHoveredTieKey(link?.key == null ? null : String(link.key))}
      />
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
