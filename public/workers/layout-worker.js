/**
 * Layout Worker
 *
 * Web Worker for computing graph layouts off the main thread.
 * Supports Force Atlas 2, force-directed, and other algorithms.
 */

// Configuration defaults
const DEFAULT_CONFIG = {
  algorithm: 'force-atlas-2',
  iterations: 100,
  gravity: 1,
  scalingRatio: 10,
  preventOverlap: true,
  nodeMargin: 5,
};

// Current state
let nodes = [];
let edges = [];
let config = DEFAULT_CONFIG;
let isRunning = false;
let shouldStop = false;

// =============================================================================
// Message Handler
// =============================================================================

self.onmessage = function (event) {
  const { type, payload } = event.data;

  switch (type) {
    case 'init':
      handleInit(payload);
      break;

    case 'layout:start':
      handleLayoutStart(payload);
      break;

    case 'layout:stop':
      shouldStop = true;
      break;

    case 'data:update':
      handleDataUpdate(payload);
      break;
  }
};

function handleInit(payload) {
  nodes = payload.nodes || [];
  edges = payload.edges || [];
  config = { ...DEFAULT_CONFIG, ...payload.config };

  // Initialize random positions if not set
  nodes.forEach((node) => {
    if (node.x === undefined) node.x = Math.random() * 1000 - 500;
    if (node.y === undefined) node.y = Math.random() * 1000 - 500;
  });

  self.postMessage({ type: 'init:complete' });
}

function handleLayoutStart(payload) {
  if (isRunning) {
    shouldStop = true;
    setTimeout(() => handleLayoutStart(payload), 100);
    return;
  }

  config = { ...config, ...payload };
  shouldStop = false;
  isRunning = true;

  runLayout();
}

function handleDataUpdate(payload) {
  if (payload.nodes) {
    // Merge node positions
    const positionMap = new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }]));

    nodes = payload.nodes.map((node) => ({
      ...node,
      x: node.x ?? positionMap.get(node.id)?.x ?? Math.random() * 1000 - 500,
      y: node.y ?? positionMap.get(node.id)?.y ?? Math.random() * 1000 - 500,
    }));
  }

  if (payload.edges) {
    edges = payload.edges;
  }
}

// =============================================================================
// Layout Algorithms
// =============================================================================

function runLayout() {
  const startTime = performance.now();

  switch (config.algorithm) {
    case 'force-atlas-2':
      runForceAtlas2();
      break;
    case 'force-directed':
      runForceDirected();
      break;
    case 'circular':
      runCircular();
      break;
    case 'grid':
      runGrid();
      break;
    default:
      runForceAtlas2();
  }

  isRunning = false;

  const duration = performance.now() - startTime;
  console.log(`[LayoutWorker] Layout complete in ${duration.toFixed(1)}ms`);
}

// =============================================================================
// Force Atlas 2 Algorithm
// =============================================================================

function runForceAtlas2() {
  const { iterations, gravity, scalingRatio, preventOverlap, nodeMargin } = config;

  // Build adjacency for quick lookup
  const adjacency = buildAdjacency();

  for (let i = 0; i < iterations; i++) {
    if (shouldStop) break;

    // Calculate forces
    const forces = new Map();
    nodes.forEach((node) => {
      forces.set(node.id, { x: 0, y: 0 });
    });

    // Repulsion (between all nodes)
    for (let a = 0; a < nodes.length; a++) {
      for (let b = a + 1; b < nodes.length; b++) {
        const nodeA = nodes[a];
        const nodeB = nodes[b];

        const dx = nodeB.x - nodeA.x;
        const dy = nodeB.y - nodeA.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;

        // Repulsion force
        const repulsion = (scalingRatio * scalingRatio) / dist;

        const forceA = forces.get(nodeA.id);
        const forceB = forces.get(nodeB.id);

        forceA.x -= (dx / dist) * repulsion;
        forceA.y -= (dy / dist) * repulsion;
        forceB.x += (dx / dist) * repulsion;
        forceB.y += (dy / dist) * repulsion;
      }
    }

    // Attraction (along edges)
    edges.forEach((edge) => {
      const source = nodes.find((n) => n.id === edge.source);
      const target = nodes.find((n) => n.id === edge.target);

      if (!source || !target) return;

      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;

      // Attraction force
      const weight = edge.weight || 1;
      const attraction = dist / scalingRatio * weight;

      const forceSource = forces.get(source.id);
      const forceTarget = forces.get(target.id);

      forceSource.x += (dx / dist) * attraction;
      forceSource.y += (dy / dist) * attraction;
      forceTarget.x -= (dx / dist) * attraction;
      forceTarget.y -= (dy / dist) * attraction;
    });

    // Gravity (toward center)
    nodes.forEach((node) => {
      const force = forces.get(node.id);
      const dist = Math.sqrt(node.x * node.x + node.y * node.y) || 1;
      force.x -= gravity * node.x / dist;
      force.y -= gravity * node.y / dist;
    });

    // Apply forces
    const speed = 1 / (i + 1) * 10; // Decreasing speed

    nodes.forEach((node) => {
      const force = forces.get(node.id);
      node.x += force.x * speed;
      node.y += force.y * speed;
    });

    // Prevent overlap
    if (preventOverlap) {
      applyOverlapPrevention(nodeMargin);
    }

    // Report progress
    if (i % 10 === 0 || i === iterations - 1) {
      self.postMessage({
        type: 'layout:progress',
        payload: {
          iteration: i + 1,
          totalIterations: iterations,
          convergence: calculateConvergence(forces),
          isComplete: i === iterations - 1,
        },
      });
    }
  }

  // Send final positions
  self.postMessage({
    type: 'layout:complete',
    payload: {
      nodes: nodes.map((n) => ({ id: n.id, x: n.x, y: n.y })),
    },
  });
}

// =============================================================================
// Force Directed Algorithm (simpler)
// =============================================================================

function runForceDirected() {
  const { iterations, gravity, preventOverlap, nodeMargin } = config;
  const k = Math.sqrt((1000 * 1000) / nodes.length); // Optimal distance

  for (let i = 0; i < iterations; i++) {
    if (shouldStop) break;

    const displacements = new Map();
    nodes.forEach((node) => {
      displacements.set(node.id, { x: 0, y: 0 });
    });

    // Repulsion
    for (let a = 0; a < nodes.length; a++) {
      for (let b = a + 1; b < nodes.length; b++) {
        const nodeA = nodes[a];
        const nodeB = nodes[b];

        const dx = nodeA.x - nodeB.x;
        const dy = nodeA.y - nodeB.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;

        const force = (k * k) / dist;

        const dispA = displacements.get(nodeA.id);
        const dispB = displacements.get(nodeB.id);

        dispA.x += (dx / dist) * force;
        dispA.y += (dy / dist) * force;
        dispB.x -= (dx / dist) * force;
        dispB.y -= (dy / dist) * force;
      }
    }

    // Attraction
    edges.forEach((edge) => {
      const source = nodes.find((n) => n.id === edge.source);
      const target = nodes.find((n) => n.id === edge.target);

      if (!source || !target) return;

      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;

      const force = (dist * dist) / k;

      const dispSource = displacements.get(source.id);
      const dispTarget = displacements.get(target.id);

      dispSource.x += (dx / dist) * force;
      dispSource.y += (dy / dist) * force;
      dispTarget.x -= (dx / dist) * force;
      dispTarget.y -= (dy / dist) * force;
    });

    // Apply with cooling
    const temp = 100 * (1 - i / iterations);

    nodes.forEach((node) => {
      const disp = displacements.get(node.id);
      const dist = Math.sqrt(disp.x * disp.x + disp.y * disp.y) || 1;

      node.x += (disp.x / dist) * Math.min(dist, temp);
      node.y += (disp.y / dist) * Math.min(dist, temp);
    });

    // Gravity
    nodes.forEach((node) => {
      node.x *= 1 - gravity * 0.01;
      node.y *= 1 - gravity * 0.01;
    });

    if (preventOverlap) {
      applyOverlapPrevention(nodeMargin);
    }

    if (i % 10 === 0 || i === iterations - 1) {
      self.postMessage({
        type: 'layout:progress',
        payload: {
          iteration: i + 1,
          totalIterations: iterations,
          convergence: temp / 100,
          isComplete: i === iterations - 1,
        },
      });
    }
  }

  self.postMessage({
    type: 'layout:complete',
    payload: {
      nodes: nodes.map((n) => ({ id: n.id, x: n.x, y: n.y })),
    },
  });
}

// =============================================================================
// Circular Layout
// =============================================================================

function runCircular() {
  const radius = Math.max(100, nodes.length * 10);
  const angleStep = (2 * Math.PI) / nodes.length;

  nodes.forEach((node, i) => {
    node.x = radius * Math.cos(i * angleStep);
    node.y = radius * Math.sin(i * angleStep);
  });

  self.postMessage({
    type: 'layout:complete',
    payload: {
      nodes: nodes.map((n) => ({ id: n.id, x: n.x, y: n.y })),
    },
  });
}

// =============================================================================
// Grid Layout
// =============================================================================

function runGrid() {
  const cols = Math.ceil(Math.sqrt(nodes.length));
  const spacing = 100;

  nodes.forEach((node, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    node.x = col * spacing - (cols * spacing) / 2;
    node.y = row * spacing - (Math.ceil(nodes.length / cols) * spacing) / 2;
  });

  self.postMessage({
    type: 'layout:complete',
    payload: {
      nodes: nodes.map((n) => ({ id: n.id, x: n.x, y: n.y })),
    },
  });
}

// =============================================================================
// Helpers
// =============================================================================

function buildAdjacency() {
  const adj = new Map();

  nodes.forEach((node) => {
    adj.set(node.id, new Set());
  });

  edges.forEach((edge) => {
    if (adj.has(edge.source)) adj.get(edge.source).add(edge.target);
    if (adj.has(edge.target)) adj.get(edge.target).add(edge.source);
  });

  return adj;
}

function applyOverlapPrevention(margin) {
  for (let a = 0; a < nodes.length; a++) {
    for (let b = a + 1; b < nodes.length; b++) {
      const nodeA = nodes[a];
      const nodeB = nodes[b];

      const dx = nodeB.x - nodeA.x;
      const dy = nodeB.y - nodeA.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const sizeA = nodeA.size || 10;
      const sizeB = nodeB.size || 10;
      const minDist = sizeA + sizeB + margin;

      if (dist < minDist && dist > 0) {
        const overlap = minDist - dist;
        const moveX = (dx / dist) * overlap * 0.5;
        const moveY = (dy / dist) * overlap * 0.5;

        nodeA.x -= moveX;
        nodeA.y -= moveY;
        nodeB.x += moveX;
        nodeB.y += moveY;
      }
    }
  }
}

function calculateConvergence(forces) {
  let totalForce = 0;

  forces.forEach((force) => {
    totalForce += Math.sqrt(force.x * force.x + force.y * force.y);
  });

  return totalForce / nodes.length;
}

console.log('[LayoutWorker] Worker initialized');
