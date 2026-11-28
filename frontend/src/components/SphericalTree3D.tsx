import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Activity, BookOpen, Compass, GraduationCap, Pause, Play, RotateCcw, X } from 'lucide-react';
import { CrystallizedNode, DomainFolder, NodeType, UserDomain } from '../api';
import { RichMarkdown } from './RichMarkdown';
import { Segmented } from './ui/Living';

interface Props {
  domains: UserDomain[];
  nodes: CrystallizedNode[];
  folders: DomainFolder[];
  onStartSocratic: (nodeId: string) => void;
  onProposeAction: (nodeId: string) => void;
}

interface TreeNode3D {
  id: string;
  label: string;
  kind: 'root' | 'domain' | 'folder' | 'knowledge' | 'decision';
  x: number;
  y: number;
  z: number;
  radius: number;
  parentId?: string;
  data?: CrystallizedNode;
}

function fibonacciDir(index: number, total: number): [number, number, number] {
  if (total <= 1) return [0.7, 0.4, 0.5];
  const phi = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - (index / (total - 1)) * 2;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = phi * index;
  return [Math.cos(theta) * r, y, Math.sin(theta) * r];
}

function sphericalOffset(
  baseX: number,
  baseY: number,
  baseZ: number,
  index: number,
  total: number,
  shellRadius: number,
  spreadAngle: number,
): [number, number, number] {
  const norm = Math.hypot(baseX, baseY, baseZ) || 1;
  const bx = baseX / norm;
  const by = baseY / norm;
  const bz = baseZ / norm;

  // Orthonormal basis around base direction
  const upX = Math.abs(by) < 0.9 ? 0 : 1;
  const upY = Math.abs(by) < 0.9 ? 1 : 0;
  const upZ = 0;

  let ux = by * upZ - bz * upY;
  let uy = bz * upX - bx * upZ;
  let uz = bx * upY - by * upX;
  const uLen = Math.hypot(ux, uy, uz) || 1;
  ux /= uLen;
  uy /= uLen;
  uz /= uLen;

  const vx = by * uz - bz * uy;
  const vy = bz * ux - bx * uz;
  const vz = bx * uy - by * ux;

  const angle = (2 * Math.PI * index) / Math.max(1, total) + 0.4;
  const ring = total === 1 ? 0.12 : spreadAngle * (0.65 + 0.35 * ((index % 2) * 0.6));

  const dx = bx * Math.cos(ring) + (ux * Math.cos(angle) + vx * Math.sin(angle)) * Math.sin(ring);
  const dy = by * Math.cos(ring) + (uy * Math.cos(angle) + vy * Math.sin(angle)) * Math.sin(ring);
  const dz = bz * Math.cos(ring) + (uz * Math.cos(angle) + vz * Math.sin(angle)) * Math.sin(ring);
  const dLen = Math.hypot(dx, dy, dz) || 1;

  return [(dx / dLen) * shellRadius, (dy / dLen) * shellRadius, (dz / dLen) * shellRadius];
}

/** Read design tokens from CSS so canvas colors follow index.css @theme. */
function readPalette() {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  return {
    paper: v('--color-paper', '#fbfaf6'),
    ink: v('--color-ink', '#1f2a24'),
    inkMuted: v('--color-ink-muted', '#66726b'),
    line: v('--color-line', '#ece8df'),
    branch: v('--color-clay-300', '#e89a80'),
    trunk: v('--color-clay-600', '#c45e44'),
    leaf: v('--color-leaf-500', '#2fa36b'),
    leafLight: v('--color-leaf-200', '#a9debf'),
    leafDark: v('--color-leaf-700', '#186e45'),
    mind: v('--color-mind-500', '#2e9bd6'),
    mindDark: v('--color-mind-700', '#17638f'),
    clay: v('--color-clay-500', '#e07a5f'),
    clayLight: v('--color-clay-100', '#f8ddd3'),
    sun: v('--color-sun-300', '#f5c661'),
    sunDark: v('--color-sun-600', '#c98a12'),
  };
}

export function SphericalTree3D({ domains, nodes, folders, onStartSocratic, onProposeAction }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rotRef = useRef({ yaw: 0.45, pitch: 0.22, zoom: 1.0 });
  const dragRef = useRef<{ active: boolean; x: number; y: number; moved: boolean }>({
    active: false,
    x: 0,
    y: 0,
    moved: false,
  });
  const projectedRef = useRef<{ node: TreeNode3D; sx: number; sy: number; sr: number; depth: number }[]>([]);

  const [autoRotate, setAutoRotate] = useState(true);
  const [typeFilter, setTypeFilter] = useState<'all' | NodeType>('all');
  const [selectedNode, setSelectedNode] = useState<CrystallizedNode | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Build 3-shell spherical hierarchy from folder_path + short_keyword
  const { treeNodes, edges } = useMemo(() => {
    const list: TreeNode3D[] = [];
    const linkList: { from: string; to: string }[] = [];

    list.push({ id: 'root', label: '认知中枢', kind: 'root', x: 0, y: 0, z: 0, radius: 14 });

    const filtered = nodes.filter((n) => {
      const nt: NodeType = n.node_type === 'knowledge' ? 'knowledge' : 'decision';
      return typeFilter === 'all' || nt === typeFilter;
    });

    domains.forEach((dom, dIdx) => {
      const dir = fibonacciDir(dIdx, domains.length);
      const len = Math.hypot(...dir) || 1;
      const dx = (dir[0] / len) * 105;
      const dy = (dir[1] / len) * 105;
      const dz = (dir[2] / len) * 105;
      const domId = `dom_${dom.slug}`;
      list.push({ id: domId, label: dom.name, kind: 'domain', x: dx, y: dy, z: dz, radius: 10.5, parentId: 'root' });
      linkList.push({ from: 'root', to: domId });

      // Collect 1st/2nd-level folder paths for this domain
      const domFolders = folders.filter((f) => f.domain_slug === dom.slug);
      const byId = new Map(domFolders.map((f) => [f.id, f.folder_name]));
      const pathSet = new Set<string>(['核心认知']);
      domFolders.forEach((f) => {
        if (f.parent_id && byId.has(f.parent_id)) {
          pathSet.add(`${byId.get(f.parent_id)}/${f.folder_name}`);
        } else {
          pathSet.add(f.folder_name);
        }
      });

      const domNodes = filtered.filter((n) => n.domain_slug === dom.slug);
      domNodes.forEach((n) => {
        const sub = (n.folder_path || `${dom.slug}/核心认知`).split('/').slice(1).join('/') || '核心认知';
        pathSet.add(sub);
      });

      const subList = Array.from(pathSet);
      subList.forEach((sub, sIdx) => {
        const [fx, fy, fz] = sphericalOffset(dx, dy, dz, sIdx, subList.length, 195, 0.58);
        const fId = `fld_${dom.slug}_${sub}`;
        list.push({ id: fId, label: `/${sub}`, kind: 'folder', x: fx, y: fy, z: fz, radius: 6.5, parentId: domId });
        linkList.push({ from: domId, to: fId });

        const leafNodes = domNodes.filter((n) => {
          const nSub = (n.folder_path || `${dom.slug}/核心认知`).split('/').slice(1).join('/') || '核心认知';
          return nSub === sub;
        });

        leafNodes.forEach((leaf, lIdx) => {
          const [lx, ly, lz] = sphericalOffset(fx, fy, fz, lIdx, leafNodes.length, 290, 0.42);
          const isK = leaf.node_type === 'knowledge';
          list.push({
            id: leaf.id,
            label: leaf.short_keyword || leaf.title.slice(0, 12),
            kind: isK ? 'knowledge' : 'decision',
            x: lx,
            y: ly,
            z: lz,
            radius: 5.5 + Math.round((leaf.conversion_weight || 0.5) * 5.5),
            parentId: fId,
            data: leaf,
          });
          linkList.push({ from: fId, to: leaf.id });
        });
      });
    });

    return { treeNodes: list, edges: linkList };
  }, [domains, nodes, folders, typeFilter]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const C = readPalette();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fontFamily = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
    let animId = 0;
    const t0 = performance.now();

    const withAlpha = (hex: string, a: number) => {
      const h = hex.replace('#', '');
      const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
      return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
    };

    /** A leaf: pointed ellipse oriented along `angle`, with a midrib. */
    const drawLeaf = (x: number, y: number, r: number, angle: number, fill: string, rib: string, alpha: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.globalAlpha = alpha;
      const L = r * 2.1;
      const W = r * 1.05;
      ctx.beginPath();
      ctx.moveTo(-L / 2, 0);
      ctx.quadraticCurveTo(0, -W, L / 2, 0);
      ctx.quadraticCurveTo(0, W, -L / 2, 0);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-L / 2 + 1, 0);
      ctx.lineTo(L / 2 - 2, 0);
      ctx.strokeStyle = rib;
      ctx.lineWidth = Math.max(0.8, r * 0.14);
      ctx.stroke();
      ctx.restore();
    };

    const render = () => {
      const time = (performance.now() - t0) / 1000;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) {
        canvas.width = Math.floor(rect.width * dpr);
        canvas.height = Math.floor(rect.height * dpr);
      }

      if (autoRotate && !dragRef.current.active && !reduceMotion) {
        rotRef.current.yaw += 0.0022;
      }

      const w = rect.width;
      const h = rect.height;
      const cx = w / 2;
      const cy = h / 2;
      const { yaw, pitch, zoom } = rotRef.current;
      const fov = 720 * zoom;
      const camZ = 680;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      // Soft sunlight + ground shadow
      const sunGlow = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.max(w, h) * 0.6);
      sunGlow.addColorStop(0, withAlpha(C.sun, 0.18));
      sunGlow.addColorStop(0.5, withAlpha(C.leafLight, 0.12));
      sunGlow.addColorStop(1, withAlpha(C.paper, 0));
      ctx.fillStyle = sunGlow;
      ctx.fillRect(0, 0, w, h);

      ctx.setLineDash([3, 7]);
      ctx.strokeStyle = withAlpha(C.leaf, 0.14);
      ctx.lineWidth = 1;
      [105, 195, 290].forEach((r) => {
        ctx.beginPath();
        ctx.arc(cx, cy, (r * fov) / camZ, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.setLineDash([]);

      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const cosP = Math.cos(pitch);
      const sinP = Math.sin(pitch);

      const project = (x: number, y: number, z: number) => {
        const x1 = x * cosY - z * sinY;
        const z1 = x * sinY + z * cosY;
        const y2 = y * cosP - z1 * sinP;
        const z2 = y * sinP + z1 * cosP;
        const scale = fov / Math.max(120, camZ - z2);
        return { sx: cx + x1 * scale, sy: cy + y2 * scale, scale, depth: z2 };
      };

      type P = { node: TreeNode3D; sx: number; sy: number; sr: number; depth: number; scale: number };
      const projMap = new Map<string, P>();
      for (const n of treeNodes) {
        const p = project(n.x, n.y, n.z);
        // gentle wind sway on outer nodes (screen-space, deterministic per id)
        let swayX = 0;
        let swayY = 0;
        if (!reduceMotion && (n.kind === 'knowledge' || n.kind === 'decision' || n.kind === 'folder')) {
          const seed = (n.id.charCodeAt(0) + n.id.charCodeAt(n.id.length - 1)) % 17;
          const amp = n.kind === 'folder' ? 1.2 : hoveredId === n.id ? 3.2 : 2;
          swayX = Math.sin(time * 1.1 + seed) * amp;
          swayY = Math.cos(time * 0.8 + seed * 0.7) * amp * 0.6;
        }
        projMap.set(n.id, { node: n, sx: p.sx + swayX, sy: p.sy + swayY, sr: n.radius * p.scale, depth: p.depth, scale: p.scale });
      }

      const depthAlpha = (d: number) => Math.max(0.3, Math.min(1, (d + 360) / 560));

      // Branches: curved, tapering, warm wood -> green near leaves
      for (const e of edges) {
        const a = projMap.get(e.from);
        const b = projMap.get(e.to);
        if (!a || !b) continue;
        const isHot = hoveredId === e.to || hoveredId === e.from || selectedNode?.id === e.to;
        const alpha = depthAlpha((a.depth + b.depth) / 2);
        const toLeaf = b.node.kind === 'knowledge' || b.node.kind === 'decision';
        const fromRoot = a.node.kind === 'root';
        const mx = (a.sx + b.sx) / 2;
        const my = (a.sy + b.sy) / 2;
        // perpendicular offset for organic curvature
        const dxl = b.sx - a.sx;
        const dyl = b.sy - a.sy;
        const len = Math.hypot(dxl, dyl) || 1;
        const bend = Math.min(26, len * 0.14);
        const qx = mx + (-dyl / len) * bend;
        const qy = my + (dxl / len) * bend;
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.quadraticCurveTo(qx, qy, b.sx, b.sy);
        ctx.lineCap = 'round';
        ctx.strokeStyle = isHot
          ? withAlpha(toLeaf ? C.leaf : C.trunk, 0.95)
          : withAlpha(toLeaf ? C.leaf : fromRoot ? C.trunk : C.branch, alpha * (toLeaf ? 0.35 : 0.55));
        ctx.lineWidth = (fromRoot ? 4.5 : toLeaf ? 1.4 : 2.6) * Math.min(1.3, a.scale) * (isHot ? 1.3 : 1);
        ctx.stroke();
      }

      // Nodes back-to-front
      const sorted = Array.from(projMap.values()).sort((a, b) => a.depth - b.depth);
      projectedRef.current = sorted;

      for (const item of sorted) {
        const { node, sx, sy, sr, depth, scale } = item;
        const alpha = depthAlpha(depth);
        const isSelected = selectedNode?.id === node.id;
        const isHover = hoveredId === node.id;
        const r = Math.max(3.5, sr);

        if (isSelected || isHover) {
          ctx.beginPath();
          ctx.arc(sx, sy, r * 2.2, 0, Math.PI * 2);
          ctx.fillStyle = withAlpha(node.kind === 'knowledge' ? C.mind : C.leaf, 0.16);
          ctx.fill();
        }

        if (node.kind === 'root') {
          const pulse = reduceMotion ? 1 : 1 + Math.sin(time * 2) * 0.05;
          ctx.beginPath();
          ctx.arc(sx, sy, r * 1.9 * pulse, 0, Math.PI * 2);
          ctx.fillStyle = withAlpha(C.sun, 0.3);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(sx, sy, r * pulse, 0, Math.PI * 2);
          ctx.fillStyle = C.leaf;
          ctx.fill();
          drawLeaf(sx - r * 0.25, sy - r * 0.1, r * 0.42, -Math.PI / 4, C.leafLight, C.leafDark, 1);
          drawLeaf(sx + r * 0.25, sy - r * 0.25, r * 0.38, -Math.PI * 0.75 + Math.PI, C.sun, C.sunDark, 1);
        } else if (node.kind === 'domain') {
          ctx.beginPath();
          ctx.arc(sx, sy, r, 0, Math.PI * 2);
          ctx.fillStyle = withAlpha(C.clayLight, alpha);
          ctx.fill();
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = withAlpha(C.trunk, alpha);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(sx, sy, r * 0.45, 0, Math.PI * 2);
          ctx.fillStyle = withAlpha(C.trunk, alpha);
          ctx.fill();
        } else if (node.kind === 'folder') {
          ctx.beginPath();
          ctx.arc(sx, sy, r, 0, Math.PI * 2);
          ctx.fillStyle = withAlpha(C.clay, alpha * 0.9);
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = withAlpha('#ffffff', alpha);
          ctx.stroke();
        } else {
          const parent = node.parentId ? projMap.get(node.parentId) : undefined;
          const angle = parent ? Math.atan2(sy - parent.sy, sx - parent.sx) : 0;
          const isK = node.kind === 'knowledge';
          drawLeaf(sx, sy, r * 1.05, angle, isK ? C.mind : C.leaf, withAlpha('#ffffff', 0.7), alpha);
          if (isSelected || isHover) {
            ctx.beginPath();
            ctx.arc(sx, sy, r * 1.4, 0, Math.PI * 2);
            ctx.strokeStyle = isK ? C.mindDark : C.leafDark;
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        }

        // Label with paper halo for readability
        const big = node.kind === 'root' || node.kind === 'domain';
        const showLabel = big || node.kind === 'folder' || isHover || isSelected || scale > 1.05;
        if (showLabel) {
          const fontSize = Math.max(11, Math.min(15, Math.round((big ? 13 : 11.5) * scale)));
          ctx.font = `${big ? 800 : 600} ${fontSize}px ${fontFamily}`;
          ctx.textAlign = 'center';
          ctx.lineJoin = 'round';
          ctx.lineWidth = 4;
          ctx.strokeStyle = withAlpha(C.paper, 0.92);
          const ty = sy - r - (node.kind === 'knowledge' || node.kind === 'decision' ? 9 : 7);
          ctx.strokeText(node.label, sx, ty);
          ctx.fillStyle = withAlpha(big ? C.ink : C.inkMuted, Math.min(1, alpha + 0.2));
          ctx.fillText(node.label, sx, ty);
        }
      }

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [treeNodes, edges, autoRotate, hoveredId, selectedNode]);

  const hitTest = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    // Search front-to-back
    for (let i = projectedRef.current.length - 1; i >= 0; i--) {
      const p = projectedRef.current[i];
      if (Math.hypot(mx - p.sx, my - p.sy) <= Math.max(12, p.sr + 6)) {
        return p.node;
      }
    }
    return null;
  };

  return (
    <div className="card relative overflow-hidden !bg-gradient-to-b from-surface to-leaf-50/60">
      {/* Top Floating Controls */}
      <div className="absolute top-4 left-4 z-10 flex flex-wrap items-center gap-2">
        <Segmented
          group="tree-filter"
          size="sm"
          value={typeFilter}
          onChange={setTypeFilter}
          className="!bg-surface/90 shadow-soft backdrop-blur"
          options={[
            { value: 'all', label: '全部节点' },
            { value: 'knowledge', label: <><span className="h-2 w-2 rounded-full bg-mind-500" />知识类</> },
            { value: 'decision', label: <><span className="h-2 w-2 rounded-full bg-leaf-500" />决策类</> },
          ]}
        />
        <button onClick={() => setAutoRotate((v) => !v)} className="btn btn-outline btn-sm !bg-surface/90">
          {autoRotate ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {autoRotate ? '暂停自转' : '自动旋转'}
        </button>
        <button
          onClick={() => {
            rotRef.current = { yaw: 0.45, pitch: 0.22, zoom: 1.0 };
          }}
          className="btn btn-outline btn-sm !bg-surface/90"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          重置视角
        </button>
      </div>

      {/* Legend */}
      <div className="pointer-events-none absolute bottom-4 left-4 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-line bg-surface/90 px-3 py-1.5 text-xs font-semibold text-ink-muted shadow-soft backdrop-blur">
        <span className="hidden sm:inline">拖拽旋转 · 滚轮缩放 · 点击叶片查看详情</span>
        <span className="flex items-center gap-1 text-mind-700">
          <span className="h-2.5 w-2.5 rounded-full bg-mind-500" />知识类(名词)
        </span>
        <span className="flex items-center gap-1 text-leaf-700">
          <span className="h-2.5 w-2.5 rounded-full bg-leaf-500" />决策类(动词)
        </span>
        <span className="flex items-center gap-1 text-clay-700">
          <span className="h-2.5 w-2.5 rounded-full bg-clay-500" />领域 / 目录
        </span>
      </div>

      <canvas
        ref={canvasRef}
        className="h-[520px] w-full cursor-grab touch-none active:cursor-grabbing sm:h-[640px]"
        onMouseDown={(e) => {
          dragRef.current = { active: true, x: e.clientX, y: e.clientY, moved: false };
        }}
        onMouseMove={(e) => {
          if (dragRef.current.active) {
            const dx = e.clientX - dragRef.current.x;
            const dy = e.clientY - dragRef.current.y;
            if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragRef.current.moved = true;
            rotRef.current.yaw += dx * 0.006;
            rotRef.current.pitch = Math.max(-1.3, Math.min(1.3, rotRef.current.pitch + dy * 0.006));
            dragRef.current.x = e.clientX;
            dragRef.current.y = e.clientY;
          } else {
            const hit = hitTest(e.clientX, e.clientY);
            setHoveredId(hit ? hit.id : null);
          }
        }}
        onMouseUp={(e) => {
          const wasMoved = dragRef.current.moved;
          dragRef.current.active = false;
          if (!wasMoved) {
            const hit = hitTest(e.clientX, e.clientY);
            if (hit?.data) setSelectedNode(hit.data);
          }
        }}
        onMouseLeave={() => {
          dragRef.current.active = false;
          setHoveredId(null);
        }}
        onTouchStart={(e) => {
          if (e.touches.length === 1) {
            const t = e.touches[0];
            dragRef.current = { active: true, x: t.clientX, y: t.clientY, moved: false };
          }
        }}
        onTouchMove={(e) => {
          if (dragRef.current.active && e.touches.length === 1) {
            const t = e.touches[0];
            const dx = t.clientX - dragRef.current.x;
            const dy = t.clientY - dragRef.current.y;
            if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragRef.current.moved = true;
            rotRef.current.yaw += dx * 0.007;
            rotRef.current.pitch = Math.max(-1.3, Math.min(1.3, rotRef.current.pitch + dy * 0.007));
            dragRef.current.x = t.clientX;
            dragRef.current.y = t.clientY;
          }
        }}
        onTouchEnd={(e) => {
          const wasMoved = dragRef.current.moved;
          dragRef.current.active = false;
          if (!wasMoved && e.changedTouches.length === 1) {
            const t = e.changedTouches[0];
            const hit = hitTest(t.clientX, t.clientY);
            if (hit?.data) setSelectedNode(hit.data);
          }
        }}
        onWheel={(e) => {
          e.preventDefault();
          const next = rotRef.current.zoom * (e.deltaY > 0 ? 0.92 : 1.08);
          rotRef.current.zoom = Math.max(0.55, Math.min(2.2, next));
        }}
      />

      {/* Side Inspector Drawer on Leaf Click */}
      <AnimatePresence>
        {selectedNode && (
          <motion.div
            key={selectedNode.id}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="absolute top-4 right-4 bottom-4 z-20 flex w-80 max-w-[90%] flex-col rounded-3xl border border-line bg-surface/97 p-4 shadow-pop backdrop-blur"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className={`chip ${selectedNode.node_type === 'knowledge' ? 'chip-mind' : 'chip-leaf'}`}>
                {selectedNode.node_type === 'knowledge' ? (
                  <BookOpen className="h-3.5 w-3.5" />
                ) : (
                  <Compass className="h-3.5 w-3.5" />
                )}
                {selectedNode.node_type === 'knowledge' ? '知识类' : '决策类'} · v{selectedNode.schema_version}
              </span>
              <button onClick={() => setSelectedNode(null)} className="icon-btn" aria-label="关闭">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="text-xs font-semibold text-ink-muted">{selectedNode.folder_path}</div>
            <div
              className={`mt-0.5 text-sm font-bold ${
                selectedNode.node_type === 'knowledge' ? 'text-mind-700' : 'text-leaf-700'
              }`}
            >
              {selectedNode.short_keyword}
            </div>
            <h3 className="mt-1 text-base leading-snug font-extrabold text-ink">{selectedNode.title}</h3>

            <div className="mt-3 flex-1 space-y-2.5 overflow-y-auto">
              <div className="rounded-2xl bg-paper-2 px-3 py-2">
                <RichMarkdown content={selectedNode.atomic_claim} />
              </div>
              <div className="space-y-2 rounded-2xl border border-line bg-paper p-3">
                {Object.entries(selectedNode.payload).map(([k, v]) => (
                  <div key={k}>
                    <div className="eyebrow">{k}</div>
                    <RichMarkdown content={typeof v === 'string' ? v : JSON.stringify(v)} />
                  </div>
                ))}
              </div>
              {(selectedNode.rich_blocks || []).map((rb, idx) => (
                <div key={idx} className="rounded-2xl border border-line bg-surface p-3">
                  <div className="mb-1 text-sm font-extrabold text-clay-700">{rb.title}</div>
                  <RichMarkdown content={rb.markdown} />
                </div>
              ))}
            </div>

            <div className="mt-3 flex gap-2 border-t border-line pt-3">
              <button onClick={() => onStartSocratic(selectedNode.id)} className="btn btn-soft-mind btn-sm flex-1">
                <GraduationCap className="h-4 w-4" />
                场景陪练
              </button>
              <button onClick={() => onProposeAction(selectedNode.id)} className="btn btn-primary btn-press btn-sm flex-1">
                <Activity className="h-4 w-4" />
                生成微行动
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
