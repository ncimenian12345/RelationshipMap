import React, { useRef, useState, useEffect, useMemo, useCallback } from "react";

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

// Base URL for API calls. Always require an explicit value in production so the
// deployed front-end talks to the correct Express API. During development we
// continue to default to the local server for convenience.
const envApiUrl =
  typeof import.meta.env?.VITE_API_URL === "string" ? import.meta.env.VITE_API_URL.trim() : "";
const envApiKey =
  typeof import.meta.env?.VITE_API_KEY === "string" ? import.meta.env.VITE_API_KEY.trim() : "";

const rawApiBase = (() => {
  if (import.meta.env.DEV) {
    return envApiUrl || "http://localhost:3000";
  }
  if (envApiUrl) {
    return envApiUrl;
  }
  if (typeof window !== "undefined" && window.location && window.location.origin) {
    console.warn(
      "VITE_API_URL is not set. Falling back to the current origin for API requests. Configure VITE_API_URL for production deployments."
    );
    return window.location.origin;
  }
  console.warn(
    "VITE_API_URL is not set and the current origin cannot be determined. API requests will use relative paths."
  );
  return "";
})();
const API_URL = rawApiBase.replace(/\/$/, "");
const normalizeApiPath = (path = "") => {
  if (path == null) return "";
  const trimmed = String(path).trim();
  if (!trimmed) return "";
  const sanitized = trimmed.replace(/^\/+/g, "");
  return sanitized ? `/${sanitized}` : "/";
};
const resolvedApiKey = envApiKey || (import.meta.env.DEV ? "dev-key" : "");
if (!envApiKey && !import.meta.env.DEV) {
  console.warn(
    'Using fallback API key "dev-key". Provide VITE_API_KEY in production to match your server configuration.'
  );
}
const BASE_API_HEADERS = {
  ...(resolvedApiKey ? { Authorization: `Bearer ${resolvedApiKey}` } : {}),
};

const sanitizeBase = (value) => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || trimmed.startsWith("//")) {
    return trimmed.replace(/\/+$/, "");
  }
  if (trimmed.startsWith("/")) {
    const normalized = `/${trimmed.replace(/^\/+/, "")}`;
    return normalized.replace(/\/+$/, "");
  }
  const lower = trimmed.toLowerCase();
  const isLocalHost = /^localhost(?::|\/|\?|#|$)/.test(lower);
  const isIpAddress = /^\d+\.\d+\.\d+\.\d+(?::\d+)?(?:\/|$)/.test(trimmed);
  const looksLikeHost = trimmed.includes(".") || trimmed.includes(":") || isLocalHost || isIpAddress;
  if (!looksLikeHost) {
    const normalized = `/${trimmed.replace(/^\/+/, "")}`;
    return normalized.replace(/\/+$/, "");
  }
  const hasExplicitPort = /:\d+/.test(trimmed);
  const scheme = isLocalHost || isIpAddress || hasExplicitPort ? "http" : "https";
  return `${scheme}://${trimmed}`.replace(/\/+$/, "");
};

const API_BASE_CANDIDATES = (() => {
  const bases = new Set();
  const primary = sanitizeBase(API_URL);
  if (primary) {
    bases.add(primary);
    if (!/\/api$/i.test(primary)) {
      bases.add(sanitizeBase(`${primary}/api`));
    }
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    const origin = sanitizeBase(window.location.origin);
    if (origin) {
      bases.add(origin);
    }
  }
  bases.add("");
  return Array.from(bases);
})();

let preferredApiBase = API_BASE_CANDIDATES[0] ?? "";

const getApiBaseAttemptOrder = () => {
  const seen = new Set();
  const order = [];
  const normalizedPreferred = sanitizeBase(preferredApiBase);
  if (!seen.has(normalizedPreferred)) {
    order.push(normalizedPreferred);
    seen.add(normalizedPreferred);
  }
  for (const base of API_BASE_CANDIDATES) {
    const sanitized = sanitizeBase(base);
    if (!seen.has(sanitized)) {
      order.push(sanitized);
      seen.add(sanitized);
    }
  }
  return order;
};

const buildUrlForBase = (base, path) => {
  const normalizedPath = normalizeApiPath(path);
  if (!base) {
    return normalizedPath || "/";
  }
  if (!normalizedPath || normalizedPath === "/") {
    return `${base}/`;
  }
  return `${base}${normalizedPath}`;
};

const fetchFromApi = async (path, options = {}) => {
  const { headers: overrideHeaders = {}, method, body, ...otherOptions } = options;
  const normalizedMethod = typeof method === "string" ? method.toUpperCase() : undefined;
  const headers = { ...BASE_API_HEADERS, ...overrideHeaders };
  const shouldAttachJsonHeader =
    body !== undefined &&
    body !== null &&
    body !== "" &&
    !headers["Content-Type"] &&
    normalizedMethod !== "GET" &&
    normalizedMethod !== "HEAD";
  if (shouldAttachJsonHeader) {
    headers["Content-Type"] = "application/json";
  }
  const requestInit = {
    ...otherOptions,
    ...(normalizedMethod ? { method: normalizedMethod } : {}),
    ...(body !== undefined ? { body } : {}),
    headers,
  };

  const attemptOrder = getApiBaseAttemptOrder();
  let lastError = null;
  for (const base of attemptOrder) {
    const url = buildUrlForBase(base, path);
    try {
      const res = await fetch(url, { ...requestInit });
      if (!res.ok) {
        const error = new Error(`Request failed with status ${res.status}`);
        error.response = res;
        error.status = res.status;
        error.url = url;
        lastError = error;
        continue;
      }
      if (preferredApiBase !== base) {
        preferredApiBase = base;
        if (typeof console !== "undefined") {
          console.info(
            `[relationship-map] Using API base "${base || "<relative origin>"}"`
          );
        }
      }
      return res;
    } catch (err) {
      if (err?.name === "AbortError") {
        throw err;
      }
      lastError = err;
    }
  }

  throw lastError || new Error(`All API attempts failed for ${path}`);
};

// ---------------- Demo Data (✅ now defined in-file) ----------------
const demo = {
  groups: {
    team: { label: "Competitors", color: "#5B8DEF" },
    planters: { label: "Suppliers", color: "#44C4A1" },
    scientists: { label: "Manufacturers", color: "#FF9171" },
    main: { label: "The Main Guy", color: "#9B7DFF" },
  },
  nodes: [
    {
      id: "main",
      label: "Noah",
      group: "main",
      x: 615,
      y: 304,
      r: 56,
      description:
        "Noah-The ice seller who keeps the whole network running. Without him, Bud and Ivy wouldn't have a reason to supply ice, and ADA, Cy, Bo, and Lee wouldn't be moving as much product from the manufacturing side. He's at the center of the supply chain, managing deals, negotiating with suppliers, and figuring out how to stay ahead of competitors like Moe, Ari, and Ned.",
      avatar: defaultAvatarById.main,
    },
    {
      id: "t1",
      label: "Ari",
      group: "team",
      x: 327,
      y: 203,
      description:
        "Ari - Ari runs a rival ice operation and loves to brag about outselling Noah, which drives Noah crazy; their rivalry fuels most of Noah's motivation to outdo everyone else.",
      avatar: defaultAvatarById.t1,
    },
    {
      id: "t2",
      label: "Moe",
      group: "team",
      x: 412,
      y: 143,
      description:
        "Mo - Noah and Moe are best friends, but their friendship is complicated by business — Moe is technically Noah's competitor, running his own ice business on the other side of town. They respect each other's hustle but quietly keep an eye on each other's moves.",
      avatar: defaultAvatarById.t2,
    },
    {
      id: "t3",
      label: "Ned",
      group: "team",
      x: 505,
      y: 137,
      description:
        "Ned- Ned is another competitor who once tried to poach Noah's best supplier, leaving Noah furious and determined never to trust him again.",
      avatar: defaultAvatarById.t3,
    },
    {
      id: "t4",
      label: "Lee",
      group: "team",
      x: 292,
      y: 663,
      description:
        "Lee - Bo and Lee are inseparable co-workers who grew up learning the trade together, and they have a reputation for getting shipments out faster than anyone else.",
      avatar: defaultAvatarById.t4,
    },
    {
      id: "p1",
      label: "Ivy",
      group: "planters",
      x: 790,
      y: 203,
      description:
        "Ivy - Ivy is another supplier for Noah, and while their working relationship is polite, Noah wishes Ivy were more open and collaborative about new ideas.",
      avatar: defaultAvatarById.p1,
    },
    {
      id: "p2",
      label: "Bud",
      group: "planters",
      x: 875,
      y: 298,
      description:
        "Bud - Noah relies on Bud as one of his main suppliers, and though they're only casually friendly, Noah appreciates that Bud always delivers on time and keeps things professional.",
      avatar: defaultAvatarById.p2,
    },
    {
      id: "s1",
      label: "Ada",
      group: "scientists",
      x: 457,
      y: 521,
      description:
        "Ada - Noah has bad blood with ADA, one of the manufacturers — she once shorted him on a shipment and publicly called him out over it, so he refuses to work with her unless absolutely necessary.",
      avatar: defaultAvatarById.s1,
    },
    {
      id: "s2",
      label: "Bo",
      group: "scientists",
      x: 457,
      y: 663,
      description:
        "Bo - Ada and Bo are best friends on the manufacturing floor, often teaming up to solve problems and gossip about the sellers' drama.",
      avatar: defaultAvatarById.s2,
    },
    {
      id: "s3",
      label: "Cy",
      group: "scientists",
      x: 615,
      y: 520,
      description:
        "Cy - Ada and Cy work together as part of the manufacturing team, exchanging casual banter on the job but mostly focusing on production.",
      avatar: defaultAvatarById.s3,
    },
  ],
  links: [
    { id: "l1", source: "t1", target: "main", type: "trust" },
    { id: "l2", source: "t3", target: "main", type: "trust" },
    { id: "l3", source: "t4", target: "s2", type: "solid" },
    { id: "l4", source: "p1", target: "main", type: "mixed" },
    { id: "l5", source: "p2", target: "main", type: "mixed" },
    { id: "l6", source: "s1", target: "s2", type: "solid" },
    { id: "l7", source: "s1", target: "main", type: "trust" },
    { id: "l8", source: "t2", target: "main", type: "solid" },
    { id: "l9", source: "s3", target: "s1", type: "mixed" },
  ],
};

const EDGE_TYPE_ORDER = ["trust", "mixed", "solid"];

const EDGE_STYLE_ALIASES = {
  dashed: "trust",
  curved: "mixed",
};

const EDGE_TYPE_STYLES = {
  trust: {
    label: "Trust issues",
    color: "#DC2626",
    dash: "6 6",
    curve: false,
    width: 2,
    opacity: 0.85,
  },
  mixed: {
    label: "Mixed feelings",
    color: "#FACC15",
    curve: true,
    bend: 0.28,
    width: 2,
    opacity: 0.85,
  },
  solid: {
    label: "Solid Terms",
    color: "#16A34A",
    curve: false,
    width: 2,
    opacity: 0.85,
  },
};

const EDGE_HIGHLIGHT_STYLE = {
  label: "Highlighted (for focus)",
  color: "#111827",
  width: 3,
  opacity: 0.95,
};

const normalizeLinkType = (value) => {
  if (typeof value !== "string") return "solid";
  const normalized = value.trim().toLowerCase();
  const alias = EDGE_STYLE_ALIASES[normalized] || normalized;
  return EDGE_TYPE_STYLES[alias] ? alias : "solid";
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
  const normalizedType = normalizeLinkType(type);
  const style = EDGE_TYPE_STYLES[normalizedType] || EDGE_TYPE_STYLES.solid;
  const shouldCurve = !!style.curve;
  const bend = Number.isFinite(style.bend) ? style.bend : 0.2;
  let d;
  if (shouldCurve) {
    const [cx, cy] = curveCtrl(ax, ay, bx, by, bend);
    d = `M ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`;
  } else {
    d = `M ${ax} ${ay} L ${bx} ${by}`;
  }
  const strokeColor = highlight ? EDGE_HIGHLIGHT_STYLE.color : style.color;
  const strokeWidth = highlight
    ? EDGE_HIGHLIGHT_STYLE.width ?? style.width ?? 2
    : style.width ?? 2;
  const strokeOpacity = highlight
    ? EDGE_HIGHLIGHT_STYLE.opacity ?? style.opacity ?? 0.85
    : style.opacity ?? 0.85;

  return (
    <path
      d={d}
      stroke={strokeColor}
      strokeWidth={strokeWidth}
      fill="none"
      strokeDasharray={style.dash}
      opacity={strokeOpacity}
      strokeLinecap="round"
    />
  );
};

// ---------------- Component ----------------
export default function RelationshipMap() {
  const [data, setData] = useState({ groups: {}, nodes: [], links: [] });
  const [focused, setFocused] = useState("main");
  const [lastError, setLastError] = useState("");
  const containerRef = useRef(null);
  const { transform, events, setView, limits } = usePanZoom({ initial: 1, min: 0.5, max: 2.5 });
  const persistedAvatarById = useRef(new Map());
  const hasLoadedRemote = useRef(false);
  const inFlightFetch = useRef(null);
  const usedFallbackData = useRef(false);

  const visibleNodes = data.nodes;
  const visibleLinks = data.links;

  // Fit-to-content helper shared by reset button and initial auto-fit
  const fitToContent = useCallback(() => {
    if (!containerRef.current || visibleNodes.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const { scale, tx, ty } = computeFitView(visibleNodes, rect.width, rect.height, 80, limits);
    setView({ scale, tx, ty });
  }, [containerRef, visibleNodes, limits, setView]);

  const hasAutoFitted = useRef(false);
  useEffect(() => {
    if (hasAutoFitted.current) return;
    if (visibleNodes.length === 0) return;
    hasAutoFitted.current = true;
    const id = requestAnimationFrame(() => fitToContent());
    return () => cancelAnimationFrame(id);
  }, [visibleNodes, fitToContent]);

  const applyIncomingData = useCallback(
    (incoming) => {
      const groups =
        incoming && typeof incoming === "object" && incoming.groups && typeof incoming.groups === "object"
          ? incoming.groups
          : {};
      const normalizedNodes = Array.isArray(incoming?.nodes)
        ? incoming.nodes
            .map((node) => {
              const normalized = applyNodeDefaults(node);
              const hasExplicitAvatar = typeof node?.avatar === "string" && node.avatar.trim();
              if (hasExplicitAvatar && normalized.avatar) {
                persistedAvatarById.current.set(normalized.id, normalized.avatar);
              } else if (normalized.avatar) {
                const cached = persistedAvatarById.current.get(normalized.id);
                if (cached) {
                  normalized.avatar = cached;
                } else {
                  persistedAvatarById.current.set(normalized.id, normalized.avatar);
                }
              }
              return normalized;
            })
            .filter((node) => typeof node?.id === "string")
        : [];
      const normalizedLinks = Array.isArray(incoming?.links)
        ? incoming.links
            .map((link) => {
              if (!link || typeof link.id !== "string") return null;
              const type = normalizeLinkType(link.type);
              return { ...link, type };
            })
            .filter(Boolean)
        : [];
      setData({ groups, nodes: normalizedNodes, links: normalizedLinks });
    },
    [setData]
  );

  const loadMap = useCallback(
    async ({ allowFallback = false } = {}) => {
      if (inFlightFetch.current) {
        return inFlightFetch.current.promise;
      }
      const controller = new AbortController();
      const fetchPromise = (async () => {
        try {
          const res = await fetchFromApi("/map", { signal: controller.signal });
          const json = await res.json();
          if (usedFallbackData.current) {
            hasAutoFitted.current = false;
            usedFallbackData.current = false;
          }
          applyIncomingData(json);
          hasLoadedRemote.current = true;
          setLastError("");
        } catch (err) {
          if (err?.name === "AbortError") return;
          console.error("Failed to load map", err);
          if (allowFallback && !hasLoadedRemote.current) {
            usedFallbackData.current = true;
            applyIncomingData(demo);
            setLastError(
              'Unable to reach the live API. Showing demo data only; changes will not be saved until the connection is restored.'
            );
          }
        } finally {
          if (inFlightFetch.current?.controller === controller) {
            inFlightFetch.current = null;
          }
        }
      })();
      inFlightFetch.current = { controller, promise: fetchPromise };
      return fetchPromise;
    },
    [applyIncomingData, setLastError]
  );

  useEffect(() => {
    loadMap({ allowFallback: true });
    return () => {
      if (inFlightFetch.current?.controller) {
        inFlightFetch.current.controller.abort();
      }
    };
  }, [loadMap]);

  useEffect(() => {
    const POLL_INTERVAL_MS = 8000;
    const id = setInterval(() => {
      loadMap({ allowFallback: false });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [loadMap]);

  const nodesById = useMemo(() => {
    const m = new Map();
    data.nodes.forEach((n) => m.set(n.id, n));
    return m;
  }, [data.nodes]);

  useEffect(() => {
    if (!focused) return;
    if (!nodesById.has(focused)) {
      setFocused(null);
    }
  }, [focused, nodesById]);

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
  const groupLabels = useMemo(
    () => ({
      team: { x: 360, y: 80, label: "Competitors" },
      planters: { x: 700, y: 130, label: "Suppliers" },
      scientists: { x: 380, y: 460, label: "Manufacturers" },
      main: { x: 520, y: 220, label: "The Main Guy" },
    }),
    []
  );

  // Add Node / Link state & helpers
  const [newNode, setNewNode] = useState({ label: "", group: "team", description: "" });
  const [newLink, setNewLink] = useState({ source: "", target: "", type: "solid" });
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
      await fetchFromApi("/nodes", {
        method: "POST",
        body: JSON.stringify(node),
      });
      await loadMap({ allowFallback: false });
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
    const type = normalizeLinkType(newLink.type);
    const link = { id, source: s, target: t, type };
    setData((d) => ({ ...d, links: [...d.links, link] }));
    try {
      await fetchFromApi("/links", {
        method: "POST",
        body: JSON.stringify(link),
      });
      await loadMap({ allowFallback: false });
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
      await fetchFromApi(`/nodes/${focused}`, {
        method: "PATCH",
        body: JSON.stringify({ description: focusedNotes }),
      });
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
          {EDGE_TYPE_ORDER.map((type) => {
            const style = EDGE_TYPE_STYLES[type];
            if (!style) return null;
            const pathD = style.curve ? "M 2 10 Q 16 0 30 10" : "M 2 6 L 30 6";
            const strokeWidth = style.width ?? 2;
            const strokeOpacity = style.opacity ?? 0.85;
            return (
              <div key={type} className="flex items-center gap-2">
                <svg className="w-8 h-4" viewBox="0 0 32 12" aria-hidden="true">
                  <path
                    d={pathD}
                    stroke={style.color}
                    strokeWidth={strokeWidth}
                    strokeDasharray={style.dash}
                    strokeOpacity={strokeOpacity}
                    fill="none"
                    strokeLinecap="round"
                  />
                </svg>
                {style.label}
              </div>
            );
          })}
          <div className="flex items-center gap-2">
            <svg className="w-8 h-4" viewBox="0 0 32 12" aria-hidden="true">
              <path
                d="M 2 6 L 30 6"
                stroke={EDGE_HIGHLIGHT_STYLE.color}
                strokeWidth={EDGE_HIGHLIGHT_STYLE.width ?? 3}
                strokeOpacity={EDGE_HIGHLIGHT_STYLE.opacity ?? 0.95}
                strokeDasharray={EDGE_HIGHLIGHT_STYLE.dash}
                fill="none"
                strokeLinecap="round"
              />
            </svg>
            {EDGE_HIGHLIGHT_STYLE.label}
          </div>
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
              {EDGE_TYPE_ORDER.map((type) => (
                <option key={type} value={type}>
                  {EDGE_TYPE_STYLES[type]?.label || type}
                </option>
              ))}
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

(function testNormalizeApiPath() {
  console.assert(normalizeApiPath("map") === "/map", "normalizeApiPath adds a leading slash");
  console.assert(normalizeApiPath("/map") === "/map", "normalizeApiPath preserves existing slashes");
  console.assert(
    normalizeApiPath("  nodes/123  ") === "/nodes/123",
    "normalizeApiPath trims whitespace and leading slashes"
  );
  console.assert(normalizeApiPath("") === "", "normalizeApiPath returns empty string for empty input");
})();

(function testComputeFitView() {
  const nodes = [
    { x: 0, y: 0, r: 10 },
    { x: 100, y: 50, r: 10 },
  ];
  const { scale } = computeFitView(nodes, 500, 400, 80, { min: 0.5, max: 2.0 });
  console.assert(scale >= 0.5 && scale <= 2.0, "scale is clamped to limits");
})();
