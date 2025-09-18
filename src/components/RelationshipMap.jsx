import React, { useRef, useState, useEffect, useMemo } from "react";

/**
 * Interactive Relationship Map — full UI with Avatars & Notes
 * - Pan/zoom, drag nodes
 * - Auto-fit ALL nodes on initial mount (Reset refits)
 * - Header, legend, zoom controls, group labels
 * - Bottom panels: Focus, Add Node, Add Link, Notes for Focused
 * - Avatar support (random fallback) + label above each node
 * - Click background to clear focus (UI panels stop propagation)
 */

// ---------------- Avatar Pool ----------------
// Put your images in `public/avatars/*.jpeg` (Vite/CRA will serve from "/avatars/...\")
const defaultAvatarById = {
  main: "/avatars/main-guy.jpeg",
  t1: "/avatars/ari.jpeg",
  t2: "/avatars/moe.jpeg",
  t3: "/avatars/ned.jpeg",
  t4: "/avatars/lee.jpeg",
  p1: "/avatars/ivy.jpeg",
  p2: "/avatars/bud.jpeg",
  s1: "/avatars/ada.jpeg",
  s2: "/avatars/bo.jpeg",
  s3: "/avatars/cy.jpeg",
};

const avatarPool = Array.from(new Set(Object.values(defaultAvatarById)));
const randomAvatar = () =>
  avatarPool.length > 0 ? avatarPool[Math.floor(Math.random() * avatarPool.length)] : null;

const resolveAvatar = (node) => {
  if (typeof node?.avatar === "string" && node.avatar.trim()) {
    return node.avatar.trim();
  }
  return defaultAvatarById[node?.id] || randomAvatar();
};

// Base URL for API calls. Can be overridden with Vite's `VITE_API_URL` env var.
// Falls back to relative paths when not provided so the frontend can talk to a
// colocated backend in production environments.
const API_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const API_HEADERS = {
  "Content-Type": "application/json",
  Authorization: "Bearer dev-key",
};

// ---------------- Demo Data (✅ now defined in-file) ----------------
const demo = {
  groups: {
    team: { label: "The Team", color: "#5B8DEF" },
    planters: { label: "The Planters", color: "#44C4A1" },
    scientists: { label: "The Scientists", color: "#FF9171" },
    main: { label: "The Main Guy", color: "#9B7DFF" },
  },
  nodes: [
    {
      id: "main",
      label: "The Main Guy",
      group: "main",
      x: 400,
      y: 340,
      r: 56,
      description: "",
      avatar: defaultAvatarById.main,
    },
    {
      id: "t1",
      label: "Ari",
      group: "team",
      x: 160,
      y: 145,
      description: "",
      avatar: defaultAvatarById.t1,
    },
    {
      id: "t2",
      label: "Moe",
      group: "team",
      x: 230,
      y: 170,
      description: "",
      avatar: defaultAvatarById.t2,
    },
    {
      id: "t3",
      label: "Ned",
      group: "team",
      x: 300,
      y: 160,
      description: "",
      avatar: defaultAvatarById.t3,
    },
    {
      id: "t4",
      label: "Lee",
      group: "team",
      x: 90,
      y: 240,
      description: "",
      avatar: defaultAvatarById.t4,
    },
    {
      id: "p1",
      label: "Ivy",
      group: "planters",
      x: 660,
      y: 210,
      description: "",
      avatar: defaultAvatarById.p1,
    },
    {
      id: "p2",
      label: "Bud",
      group: "planters",
      x: 700,
      y: 340,
      description: "",
      avatar: defaultAvatarById.p2,
    },
    {
      id: "s1",
      label: "Ada",
      group: "scientists",
      x: 220,
      y: 520,
      description: "",
      avatar: defaultAvatarById.s1,
    },
    {
      id: "s2",
      label: "Bo",
      group: "scientists",
      x: 120,
      y: 620,
      description: "",
      avatar: defaultAvatarById.s2,
    },
    {
      id: "s3",
      label: "Cy",
      group: "scientists",
      x: 360,
      y: 610,
      description: "",
      avatar: defaultAvatarById.s3,
    },
  ],
  links: [
    { id: "l1", source: "t1", target: "main", type: "dashed" },
    { id: "l2", source: "t3", target: "main", type: "dashed" },
    { id: "l3", source: "t4", target: "s2", type: "solid" },
    { id: "l4", source: "p1", target: "main", type: "curved" },
    { id: "l5", source: "p2", target: "main", type: "curved" },
    { id: "l6", source: "s1", target: "s2", type: "solid" },
    { id: "l7", source: "s1", target: "main", type: "dashed" },
  ],
};

const applyNodeDefaults = (node = {}) => ({
  ...node,
  avatar: resolveAvatar(node),
  description: typeof node.description === "string" ? node.description : "",
});

// ---------------- Utilities ----------------
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

function computeFitView(nodes, viewportW, viewportH, padding = 80, limits = { min: 0.4, max: 2.5 }) {
  if (!nodes?.length || viewportW <= 0 || viewportH <= 0) {
    return { scale: 1, tx: 0, ty: 0 };
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    const r = n.r || 36;
    minX = Math.min(minX, n.x - r);
    maxX = Math.max(maxX, n.x + r);
    minY = Math.min(minY, n.y - r);
    maxY = Math.max(maxY, n.y + r);
  }
  const width = maxX - minX;
  const height = maxY - minY;
  const sx = (viewportW - padding * 2) / (width || 1);
  const sy = (viewportH - padding * 2) / (height || 1);
  const s = clamp(Math.min(sx, sy), limits.min, limits.max);
  const tx = padding + (viewportW - padding * 2 - width * s) / 2 - minX * s;
  const ty = padding + (viewportH - padding * 2 - height * s) / 2 - minY * s;
  return { scale: s, tx, ty };
}

function usePanZoom({ min = 0.4, max = 2.5, initial = 1 } = {}) {
  const [scale, setScale] = useState(initial);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  const onWheel = (e) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const delta = -e.deltaY;
    const zoomIntensity = 0.0015;
    const newScale = clamp(scale * (1 + delta * zoomIntensity), min, max);
    const wx = (cx - tx) / scale;
    const wy = (cy - ty) / scale;
    const ntx = cx - wx * newScale;
    const nty = cy - wy * newScale;
    setScale(newScale);
    setTx(ntx);
    setTy(nty);
  };

  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    dragging.current = true;
    last.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseMove = (e) => {
    if (!dragging.current) return;
    const dx = e.clientX - last.current.x;
    const dy = e.clientY - last.current.y;
    setTx((t) => t + dx);
    setTy((t) => t + dy);
    last.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseUp = () => (dragging.current = false);

  const setView = ({ scale: s = scale, tx: ntx = tx, ty: nty = ty } = {}) => {
    setScale(clamp(s, min, max));
    setTx(ntx);
    setTy(nty);
  };

  return {
    transform: { tx, ty, scale },
    events: { onWheel, onMouseDown, onMouseMove, onMouseUp, onMouseLeave: onMouseUp },
    setView,
    limits: { min, max },
  };
}

function curveCtrl(ax, ay, bx, by, bend = 0.2) {
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const dx = bx - ax;
  const dy = by - ay;
  const nx = -dy, ny = dx;
  const len = Math.hypot(nx, ny) || 1;
  const ux = (nx / len) * bend * Math.hypot(dx, dy);
  const uy = (ny / len) * bend * Math.hypot(dx, dy);
  return [mx + ux, my + uy];
}

// ---------------- Presentational ----------------
const Node = ({ n, isFocused = false, onPointerDown = () => {}, onClick = () => {} }) => {
  const r = n.r || 36;
  const hasAvatar = !!n.avatar;
  const clipId = `clip-${n.id}`;
  return (
    <g
      transform={`translate(${n.x},${n.y})`}
      onMouseDown={(e) => onPointerDown(e, n.id)}
      onClick={(e) => {
        e.stopPropagation();
        onClick(n.id);
      }}
      style={{ cursor: "pointer" }}
    >
      {/* label ABOVE */}
      <text y={-r - 6} textAnchor="middle" className="fill-stone-900 font-bold select-none" style={{ fontSize: r * 0.4 }}>
        {n.label}
      </text>

      {hasAvatar ? (
        <g>
          <defs>
            <clipPath id={clipId}>
              <circle r={r} cx={0} cy={0} />
            </clipPath>
          </defs>
          <image
            href={n.avatar}
            x={-r}
            y={-r}
            width={r * 2}
            height={r * 2}
            clipPath={`url(#${clipId})`}
            preserveAspectRatio="xMidYMid slice"
          />
          {isFocused && <circle r={r + 3} fill="none" stroke="#FF7043" strokeWidth={3} />}
        </g>
      ) : (
        <circle r={r} fill={isFocused ? "#FF7043" : "#4B3F72"} opacity={0.95} />)
      }
    </g>
  );
};

const Edge = ({ a, b, type = "solid", highlight = false }) => {
  if (!a || !b) return null;
  const ax = a.x, ay = a.y, bx = b.x, by = b.y;
  const dashed = type === "dashed";
  const curved = type === "curved";
  let d;
  if (curved) {
    const [cx, cy] = curveCtrl(ax, ay, bx, by);
    d = `M ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`;
  } else {
    d = `M ${ax} ${ay} L ${bx} ${by}`;
  }
  return (
    <path
      d={d}
      stroke={highlight ? "#111827" : "#C2410C"}
      strokeWidth={highlight ? 3 : 2}
      fill="none"
      strokeDasharray={dashed ? "6 6" : undefined}
      opacity={highlight ? 0.9 : 0.8}
    />
  );
};

// ---------------- Component ----------------
export default function RelationshipMap() {
  const [data, setData] = useState({ groups: {}, nodes: [], links: [] });
  const [focused, setFocused] = useState(null);
  const containerRef = useRef(null);
  const { transform, events, setView, limits } = usePanZoom({ initial: 1, min: 0.5, max: 2.5 });

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_URL}/map`, { headers: API_HEADERS });
        if (!res.ok) throw new Error('load failed');
        const json = await res.json();
        setData({
          ...json,
          nodes: Array.isArray(json.nodes) ? json.nodes.map(applyNodeDefaults) : [],
        });
        setTimeout(fitToContent, 0);
      } catch (e) {
        setData({
          ...demo,
          nodes: demo.nodes.map(applyNodeDefaults),
        });
        setTimeout(fitToContent, 0);
      }
    };
    load();
  }, []);

  const visibleNodes = data.nodes;
  const visibleLinks = data.links;

  const nodesById = useMemo(() => {
    const m = new Map();
    data.nodes.forEach((n) => m.set(n.id, n));
    return m;
  }, [data.nodes]);

  // Node dragging
  const draggingNode = useRef(null);
  const dragLast = useRef({ x: 0, y: 0 });

  const onNodePointerDown = (e, id) => {
    e.stopPropagation();
    draggingNode.current = id;
    dragLast.current = { x: e.clientX, y: e.clientY };
    window.addEventListener("mousemove", onDragMove);
    window.addEventListener("mouseup", onDragEnd);
  };

  const onDragMove = (e) => {
    if (!draggingNode.current) return;
    const id = draggingNode.current;
    const dx = (e.clientX - dragLast.current.x) / (transform.scale || 1);
    const dy = (e.clientY - dragLast.current.y) / (transform.scale || 1);
    dragLast.current = { x: e.clientX, y: e.clientY };
    setData((d) => ({
      ...d,
      nodes: d.nodes.map((n) => (n.id === id ? { ...n, x: n.x + dx, y: n.y + dy } : n)),
    }));
  };

  const onDragEnd = () => {
    draggingNode.current = null;
    window.removeEventListener("mousemove", onDragMove);
    window.removeEventListener("mouseup", onDragEnd);
  };

  // Fit-to-content
  const fitToContent = () => {
    if (!containerRef.current || visibleNodes.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const { scale, tx, ty } = computeFitView(visibleNodes, rect.width, rect.height, 80, limits);
    setView({ scale, tx, ty });
  };

  useEffect(() => {
    const id = requestAnimationFrame(() => fitToContent());
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // UI helpers
  const zoomBy = (mult) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const cx = (rect?.width || 900) / 2;
    const cy = (rect?.height || 700) / 2;
    const evt = {
      preventDefault: () => {},
      currentTarget: containerRef.current,
      clientX: (rect?.left || 0) + cx,
      clientY: (rect?.top || 0) + cy,
      deltaY: mult > 1 ? -500 : 500,
    };
    events.onWheel(evt);
  };

  // Group labels (positions roughly matching demo)
  const groupLabels = useMemo(() => ({
    team: { x: 210, y: 100, label: "The Team" },
    planters: { x: 550, y: 140, label: "The Planters" },
    scientists: { x: 260, y: 470, label: "The Scientists" },
    main: { x: 350, y: 260, label: "The Main Guy" },
  }), []);

  // Add Node / Link state & helpers
  const [newNode, setNewNode] = useState({ label: "", group: "team", description: "" });
  const [newLink, setNewLink] = useState({ source: "", target: "", type: "solid" });
  const [lastError, setLastError] = useState("");
  const [focusedNotes, setFocusedNotes] = useState("");

  const slug = (s) => (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

  const viewCenterWorld = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    const cx = (rect?.width || 900) / 2;
    const cy = (rect?.height || 700) / 2;
    const x = (cx - transform.tx) / (transform.scale || 1);
    const y = (cy - transform.ty) / (transform.scale || 1);
    return { x, y };
  };

  const handleAddNode = async () => {
    setLastError("");
    const baseId = slug(newNode.label);
    const id = baseId || `n_${Date.now().toString(36)}`;
    if (nodesById.has(id)) {
      setLastError(`Node id already exists: ${id}`);
      return;
    }
    const { x, y } = viewCenterWorld();
    const jitter = () => (Math.random() - 0.5) * 80;
    const node = {
      id,
      label: newNode.label || id,
      group: newNode.group,
      x: x + jitter(),
      y: y + jitter(),
      avatar: randomAvatar(),
      description: newNode.description || "",
    };
    setData((d) => ({ ...d, nodes: [...d.nodes, node] }));
    setNewNode({ label: "", group: "team", description: "" });
    try {
      const res = await fetch(`${API_URL}/nodes`, {
        method: "POST",
        headers: API_HEADERS,
        body: JSON.stringify(node),
      });
      if (!res.ok) throw new Error('req failed');
    } catch (err) {
      setLastError("Failed to save node.");
      setData((d) => ({ ...d, nodes: d.nodes.filter((n) => n.id !== id) }));
    }
  };

  const handleAddLink = async () => {
    setLastError("");
    const s = newLink.source.trim();
    const t = newLink.target.trim();
    if (!nodesById.get(s) || !nodesById.get(t)) {
      setLastError("Both source and target ids must exist.");
      return;
    }
    const id = `e_${Date.now().toString(36)}`;
    const link = { id, source: s, target: t, type: newLink.type };
    setData((d) => ({ ...d, links: [...d.links, link] }));
    try {
      const res = await fetch(`${API_URL}/links`, {
        method: "POST",
        headers: API_HEADERS,
        body: JSON.stringify(link),
      });
      if (!res.ok) throw new Error('req failed');
    } catch (err) {
      setLastError("Failed to save link.");
      setData((d) => ({ ...d, links: d.links.filter((l) => l.id !== id) }));
    }
  };

  // Save notes for focused node
  const saveFocusedNotes = async () => {
    if (!focused) return;
    const prev = nodesById.get(focused)?.description || "";
    setData((d) => ({
      ...d,
      nodes: d.nodes.map((n) => (n.id === focused ? { ...n, description: focusedNotes } : n)),
    }));
    try {
      const res = await fetch(`${API_URL}/nodes/${focused}`, {
        method: "PATCH",
        headers: API_HEADERS,
        body: JSON.stringify({ description: focusedNotes }),
      });
      if (!res.ok) throw new Error('req failed');
    } catch (err) {
      setLastError("Failed to save notes.");
      setData((d) => ({
        ...d,
        nodes: d.nodes.map((n) => (n.id === focused ? { ...n, description: prev } : n)),
      }));
    }
  };

  // Keep textarea in sync when focus changes
  useEffect(() => {
    setFocusedNotes(nodesById.get(focused)?.description || "");
  }, [focused, nodesById]);

  // Screen position for floating note panel (next to focused node)
  const focusedScreenPos = useMemo(() => {
    if (!focused) return null;
    const n = nodesById.get(focused);
    if (!n) return null;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const sx = n.x * (transform.scale || 1) + transform.tx + rect.left;
    const sy = n.y * (transform.scale || 1) + transform.ty + rect.top;
    return { left: sx + 24, top: sy - 20 };
  }, [focused, nodesById, transform, containerRef.current]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative bg-stone-200 rounded-2xl overflow-hidden"
      onClick={() => setFocused(null)}
    >
      {/* Header */}
      <div className="absolute top-4 left-4" onClick={(e) => e.stopPropagation()}>
        <div className="text-3xl font-extrabold tracking-wide text-indigo-500 drop-shadow-sm">TITLE</div>
        <div className="text-stone-600">Relationship Map</div>
      </div>

      {/* Legend */}
      <div className="absolute top-6 right-44 bg-white/80 backdrop-blur rounded-xl shadow p-3" onClick={(e) => e.stopPropagation()}>
        <div className="font-semibold mb-2">Map Key</div>
        <div className="flex flex-col gap-1 text-sm">
          <div className="flex items-center gap-2"><span className="w-6 h-0.5 bg-stone-800 inline-block"/>Focus</div>
          <div className="flex items-center gap-2"><span className="w-6 h-0.5 bg-orange-600 inline-block"/>Link</div>
          <div className="flex items-center gap-2"><span className="w-6 h-0.5 border-t-2 border-dashed border-orange-600"/>Dashed</div>
        </div>
      </div>

      {/* Controls */}
      <div className="absolute top-3 right-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
        <div className="bg-white/80 backdrop-blur rounded-2xl shadow p-2 flex items-center gap-2">
          <button className="px-3 py-1 rounded-xl shadow text-sm" onClick={() => zoomBy(1.1)}>+</button>
          <button className="px-3 py-1 rounded-xl shadow text-sm" onClick={() => zoomBy(0.9)}>−</button>
          <button className="px-3 py-1 rounded-xl shadow text-sm" onClick={fitToContent}>Reset</button>
        </div>
      </div>

      {/* Hint */}
      <div className="absolute top-20 left-4 text-xs text-stone-600 bg-white/70 rounded-xl px-2 py-1 shadow" onClick={(e) => e.stopPropagation()}>
        drag to pan • scroll to zoom • click a node to focus
      </div>

      <svg className="absolute inset-0 w-full h-full" {...events}>
        <g transform={`translate(${transform.tx},${transform.ty}) scale(${transform.scale})`}>
          {/* Group labels */}
          {Object.entries(groupLabels).map(([k, pos]) => (
            <text key={k} x={pos.x} y={pos.y} className="fill-stone-700 font-black" style={{ fontSize: 28 }}>
              {pos.label}
            </text>
          ))}

          {/* Edges */}
          {visibleLinks.map((l) => (
            <Edge
              key={l.id}
              a={nodesById.get(l.source)}
              b={nodesById.get(l.target)}
              type={l.type}
              highlight={focused && (l.source === focused || l.target === focused)}
            />
          ))}

          {/* Nodes */}
          {visibleNodes.map((n) => (
            <Node key={n.id} n={n} isFocused={focused === n.id} onPointerDown={onNodePointerDown} onClick={setFocused} />
          ))}
        </g>
      </svg>

      {/* Floating note next to focused node */}
      {focused && focusedScreenPos && (
        <div
          className="fixed max-w-xs bg-white/95 rounded-xl shadow p-3 text-sm border border-stone-200"
          style={{ left: focusedScreenPos.left, top: focusedScreenPos.top }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="font-semibold mb-1">{nodesById.get(focused)?.label}</div>
          <div className="text-stone-700 whitespace-pre-wrap">
            {(nodesById.get(focused)?.description || "No notes yet.")}
          </div>
        </div>
      )}

      {/* Bottom Panel: Focus, Add Node, Add Link, Notes */}
      <div
        className="absolute bottom-3 left-3 right-3 flex overflow-x-auto gap-3 md:grid md:grid-cols-4 md:overflow-visible"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-white/90 rounded-2xl p-3 shadow flex-shrink-0 w-72 md:w-auto">
          <div className="font-semibold mb-1">Focused</div>
          {focused ? (
            <div className="text-sm">
              <div className="font-medium">{nodesById.get(focused)?.label}</div>
              <div className="text-stone-600">ID: {focused}</div>
              <div className="text-stone-600 capitalize">Group: {nodesById.get(focused)?.group}</div>
            </div>
          ) : (
            <div className="text-sm text-stone-600">Click a node to focus.</div>
          )}
        </div>

        <div className="bg-white/90 rounded-2xl p-3 shadow flex-shrink-0 w-72 md:w-auto">
          <div className="font-semibold mb-2">Add Node</div>
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex gap-2">
              <input className="px-2 py-1 rounded-lg border w-full" placeholder="Name / Label" value={newNode.label} onChange={(e) => setNewNode((n) => ({ ...n, label: e.target.value }))} />
              <select className="px-2 py-1 rounded-lg border" value={newNode.group} onChange={(e) => setNewNode((n) => ({ ...n, group: e.target.value }))}>
                {Object.keys(demo.groups).map((g) => (<option key={g} value={g}>{demo.groups[g].label}</option>))}
              </select>
            </div>
            <textarea className="px-2 py-1 rounded-lg border w-full h-16" placeholder="Description / notes (optional)" value={newNode.description} onChange={(e) => setNewNode((n) => ({ ...n, description: e.target.value }))} />
            <button className="px-3 py-1 rounded-xl shadow self-start" onClick={handleAddNode}>Add</button>
          </div>
        </div>

        <div className="bg-white/90 rounded-2xl p-3 shadow flex-shrink-0 w-72 md:w-auto">
          <div className="font-semibold mb-2">Add Link</div>
          <div className="flex gap-2 text-sm">
            <input className="px-2 py-1 rounded-lg border w-full" placeholder="source id (e.g., t1)" value={newLink.source} onChange={(e) => setNewLink((l) => ({ ...l, source: e.target.value }))} />
            <input className="px-2 py-1 rounded-lg border w-full" placeholder="target id (e.g., main)" value={newLink.target} onChange={(e) => setNewLink((l) => ({ ...l, target: e.target.value }))} />
            <select className="px-2 py-1 rounded-lg border" value={newLink.type} onChange={(e) => setNewLink((l) => ({ ...l, type: e.target.value }))}>
              <option value="solid">solid</option>
              <option value="dashed">dashed</option>
              <option value="curved">curved</option>
            </select>
            <button className="px-3 py-1 rounded-xl shadow" onClick={handleAddLink}>Link</button>
          </div>
          {lastError && <div className="text-xs text-red-600 mt-2">{lastError}</div>}
        </div>

        <div className="bg-white/90 rounded-2xl p-3 shadow flex-shrink-0 w-72 md:w-auto">
          <div className="font-semibold mb-2">Notes for Focused</div>
          {focused ? (
            <div className="flex flex-col gap-2 text-sm">
              <textarea className="px-2 py-1 rounded-lg border w-full h-20" placeholder="Type notes about this person" value={focusedNotes} onChange={(e) => setFocusedNotes(e.target.value)} />
              <div className="flex gap-2">
                <button className="px-3 py-1 rounded-xl shadow" onClick={saveFocusedNotes}>Save</button>
                <button className="px-3 py-1 rounded-xl shadow" onClick={() => setFocusedNotes("")}>Clear</button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-stone-600">Select a node to edit its notes.</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------- Lightweight Tests (run once in browser console) ----------------
(function testDemoExists() {
  console.assert(!!demo && !!demo.nodes && !!demo.links, "demo is defined with nodes and links");
})();

(function testRandomAvatar() {
  const seen = new Set();
  for (let i = 0; i < 25; i++) seen.add(randomAvatar());
  console.assert(seen.size >= 2, "randomAvatar yields multiple values over trials");
})();

(function testComputeFitView() {
  const nodes = [
    { x: 0, y: 0, r: 10 },
    { x: 100, y: 50, r: 10 },
  ];
  const { scale } = computeFitView(nodes, 500, 400, 80, { min: 0.5, max: 2.0 });
  console.assert(scale >= 0.5 && scale <= 2.0, "scale is clamped to limits");
})();
