import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BookOpen,
  Compass,
  GraduationCap,
  Pause,
  Play,
  RotateCcw,
  X,
} from 'lucide-react';
import { CrystallizedNode, DomainFolder, DomainSlug, NodeType } from '../api';

interface Props {
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

const DOMAIN_NAMES: Record<DomainSlug, string> = {
  investing: '个人投资与决策',
  learning: '教育学习',
};

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

export function SphericalTree3D({ nodes, folders, onStartSocratic, onProposeAction }: Props) {
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

    list.push({ id: 'root', label: '认知中枢', kind: 'root', x: 0, y: 0, z: 0, radius: 13 });

    const domainDefs: { slug: DomainSlug; dir: [number, number, number] }[] = [
      { slug: 'investing', dir: [-1, 0.25, 0.35] },
      { slug: 'learning', dir: [1, -0.2, -0.35] },
    ];

    const filtered = nodes.filter((n) => {
      const nt: NodeType = n.node_type === 'knowledge' ? 'knowledge' : 'decision';
      return typeFilter === 'all' || nt === typeFilter;
    });

    for (const dom of domainDefs) {
      const len = Math.hypot(...dom.dir);
      const dx = (dom.dir[0] / len) * 105;
      const dy = (dom.dir[1] / len) * 105;
      const dz = (dom.dir[2] / len) * 105;
      const domId = `dom_${dom.slug}`;
      list.push({
        id: domId,
        label: DOMAIN_NAMES[dom.slug],
        kind: 'domain',
        x: dx,
        y: dy,
        z: dz,
        radius: 10,
        parentId: 'root',
      });
      linkList.push({ from: 'root', to: domId });

      // Collect subfolders for this domain
      const folderSet = new Set<string>(['核心认知']);
      folders.filter((f) => f.domain_slug === dom.slug).forEach((f) => folderSet.add(f.folder_name));
      const domNodes = filtered.filter((n) => n.domain_slug === dom.slug);
      domNodes.forEach((n) => {
        const sub = (n.folder_path || `${dom.slug}/核心认知`).split('/').slice(1).join('/') || '核心认知';
        folderSet.add(sub);
      });

      const subList = Array.from(folderSet);
      subList.forEach((sub, sIdx) => {
        const [fx, fy, fz] = sphericalOffset(dx, dy, dz, sIdx, subList.length, 195, 0.58);
        const fId = `fld_${dom.slug}_${sub}`;
        list.push({
          id: fId,
          label: `/${sub}`,
          kind: 'folder',
          x: fx,
          y: fy,
          z: fz,
          radius: 7.5,
          parentId: domId,
        });
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
    }

    return { treeNodes: list, edges: linkList };
  }, [nodes, folders, typeFilter]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    const nodeMap = new Map(treeNodes.map((n) => [n.id, n]));

    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) {
        canvas.width = Math.floor(rect.width * dpr);
        canvas.height = Math.floor(rect.height * dpr);
      }

      if (autoRotate && !dragRef.current.active) {
        rotRef.current.yaw += 0.0028;
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

      // Subtle concentric spherical guide rings
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.08)';
      ctx.lineWidth = 1;
      [105, 195, 290].forEach((r) => {
        ctx.beginPath();
        ctx.arc(cx, cy, (r * fov) / camZ, 0, Math.PI * 2);
        ctx.stroke();
      });

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

      const projMap = new Map<string, { node: TreeNode3D; sx: number; sy: number; sr: number; depth: number; scale: number }>();
      for (const n of treeNodes) {
        const p = project(n.x, n.y, n.z);
        projMap.set(n.id, { node: n, sx: p.sx, sy: p.sy, sr: n.radius * p.scale, depth: p.depth, scale: p.scale });
      }

      // Draw edges
      for (const e of edges) {
        const a = projMap.get(e.from);
        const b = projMap.get(e.to);
        if (!a || !b) continue;
        const isHot = hoveredId === e.to || hoveredId === e.from || selectedNode?.id === e.to;
        const avgAlpha = Math.max(0.12, Math.min(0.65, (b.depth + 320) / 640));
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.strokeStyle = isHot
          ? 'rgba(129, 140, 248, 0.85)'
          : `rgba(148, 163, 184, ${avgAlpha * 0.45})`;
        ctx.lineWidth = isHot ? 1.8 : 1;
        ctx.stroke();
      }

      // Sort back-to-front by depth
      const sorted = Array.from(projMap.values()).sort((a, b) => a.depth - b.depth);
      projectedRef.current = sorted;

      for (const item of sorted) {
        const { node, sx, sy, sr, depth, scale } = item;
        const alpha = Math.max(0.28, Math.min(1, (depth + 360) / 560));
        const isSelected = selectedNode?.id === node.id;
        const isHover = hoveredId === node.id;

        let color = `rgba(129, 140, 248, ${alpha})`;
        if (node.kind === 'domain') color = `rgba(167, 139, 250, ${alpha})`;
        if (node.kind === 'folder') color = `rgba(251, 191, 36, ${alpha})`;
        if (node.kind === 'knowledge') color = `rgba(34, 211, 238, ${alpha})`;
        if (node.kind === 'decision') color = `rgba(52, 211, 153, ${alpha})`;

        // Glow halo
        if (isSelected || isHover || node.kind === 'root') {
          ctx.beginPath();
          ctx.arc(sx, sy, sr * 1.9, 0, Math.PI * 2);
          ctx.fillStyle = color.replace(/[\d.]+\)$/, '0.22)');
          ctx.fill();
        }

        // Core sphere dot
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(3, sr), 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        if (isSelected || isHover) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Label
        const fontSize = Math.max(10, Math.min(14, Math.round(11.5 * scale)));
        ctx.font = `${node.kind === 'root' || node.kind === 'domain' ? '600' : '500'} ${fontSize}px system-ui, -apple-system, sans-serif`;
        ctx.fillStyle = `rgba(241, 245, 249, ${Math.min(1, alpha + 0.15)})`;
        ctx.textAlign = 'center';
        ctx.fillText(node.label, sx, sy - sr - 5);
      }

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    // Suppress unused warning
    void nodeMap;
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
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
      {/* Top Floating Controls */}
      <div className="absolute top-4 left-4 z-10 flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-slate-800 bg-slate-900/90 p-0.5 text-xs backdrop-blur">
          {(
            [
              ['all', '全部节点'],
              ['knowledge', '知识类 (名词·青)'],
              ['decision', '决策类 (动词·绿)'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTypeFilter(k)}
              className={`rounded-lg px-2.5 py-1 font-medium transition ${
                typeFilter === k ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setAutoRotate((v) => !v)}
          className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-1.5 text-xs text-slate-300 hover:text-white"
        >
          {autoRotate ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {autoRotate ? '暂停自转' : '自动旋转'}
        </button>

        <button
          onClick={() => {
            rotRef.current = { yaw: 0.45, pitch: 0.22, zoom: 1.0 };
          }}
          className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-1.5 text-xs text-slate-300 hover:text-white"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          重置视角
        </button>
      </div>

      {/* Legend */}
      <div className="pointer-events-none absolute bottom-4 left-4 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-slate-800/80 bg-slate-900/80 px-3 py-1.5 text-[11px] text-slate-400 backdrop-blur">
        <span>拖拽旋转 · 滚轮缩放 · 点击节点查看详情</span>
        <span className="flex items-center gap-1 text-cyan-300">● 知识类(名词)</span>
        <span className="flex items-center gap-1 text-emerald-300">● 决策类(动词)</span>
        <span className="flex items-center gap-1 text-amber-300">● 目录节点</span>
      </div>

      <canvas
        ref={canvasRef}
        className="h-[640px] w-full cursor-grab active:cursor-grabbing"
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
        onWheel={(e) => {
          e.preventDefault();
          const next = rotRef.current.zoom * (e.deltaY > 0 ? 0.92 : 1.08);
          rotRef.current.zoom = Math.max(0.55, Math.min(2.2, next));
        }}
      />

      {/* Side Inspector Drawer on Leaf Click */}
      {selectedNode && (
        <div className="absolute top-4 right-4 bottom-4 z-20 flex w-80 max-w-[90%] flex-col rounded-2xl border border-slate-700 bg-slate-900/95 p-4 shadow-2xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <span
              className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${
                selectedNode.node_type === 'knowledge'
                  ? 'bg-cyan-500/15 text-cyan-300'
                  : 'bg-emerald-500/15 text-emerald-300'
              }`}
            >
              {selectedNode.node_type === 'knowledge' ? (
                <BookOpen className="h-3 w-3" />
              ) : (
                <Compass className="h-3 w-3" />
              )}
              {selectedNode.node_type === 'knowledge' ? '知识类' : '决策类'} · v{selectedNode.schema_version}
            </span>
            <button
              onClick={() => setSelectedNode(null)}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="text-[11px] text-slate-400">{selectedNode.folder_path}</div>
          <div className="mt-0.5 text-xs font-medium text-indigo-300">{selectedNode.short_keyword}</div>
          <h3 className="mt-1 text-sm font-semibold text-white">{selectedNode.title}</h3>

          <div className="mt-2.5 flex-1 space-y-2.5 overflow-y-auto text-xs">
            <p className="rounded-xl bg-slate-950 p-3 leading-relaxed text-slate-200">
              {selectedNode.atomic_claim}
            </p>
            <div className="space-y-1.5 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-[11px] text-slate-300">
              {Object.entries(selectedNode.payload).map(([k, v]) => (
                <div key={k}>
                  <span className="font-medium text-slate-400">{k}: </span>
                  <span>{typeof v === 'string' ? v : JSON.stringify(v)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-3 flex gap-2 border-t border-slate-800 pt-3">
            <button
              onClick={() => onStartSocratic(selectedNode.id)}
              className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-cyan-500/30 bg-cyan-500/10 py-2 text-xs font-medium text-cyan-300 hover:bg-cyan-500/20"
            >
              <GraduationCap className="h-3.5 w-3.5" />
              场景陪练
            </button>
            <button
              onClick={() => onProposeAction(selectedNode.id)}
              className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-indigo-600/25 py-2 text-xs font-medium text-indigo-200 hover:bg-indigo-600/40"
            >
              <Activity className="h-3.5 w-3.5" />
              生成微行动
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
