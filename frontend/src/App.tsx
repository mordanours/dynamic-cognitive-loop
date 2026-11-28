import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Folder,
  FolderPlus,
  Globe,
  GraduationCap,
  LayoutGrid,
  Leaf,
  LogOut,
  Moon,
  Pencil,
  Plus,
  Settings,
  Sprout,
  Sun,
  TreeDeciduous,
  X,
  Zap,
} from 'lucide-react';
import {
  ActionExperiment,
  api,
  ArchitectProposal,
  AuthUser,
  Bandwidth,
  CrystallizedNode,
  DomainFolder,
  DomainSlug,
  getStoredToken,
  Metrics,
  NodeType,
  setStoredToken,
  setUnauthorizedHandler,
  StreamItem,
  UserDomain,
} from './api';
import { ArchitectPanel } from './components/ArchitectPanel';
import { AuditModal } from './components/AuditModal';
import { AuthScreen } from './components/AuthScreen';
import { ActionCard, NodeCard } from './components/Cards';
import { SettingsModal } from './components/SettingsModal';
import { SocraticModal } from './components/SocraticModal';
import { SphericalTree3D } from './components/SphericalTree3D';
import { StreamFab } from './components/StreamFab';
import { AnimatedNumber, GrowthSprout, LivingBackground, rise, Segmented, stagger } from './components/ui/Living';
import { Logo } from './components/ui/Logo';
import { IconBadge } from './components/ui/Modal';
import { useIsMobile } from './hooks/useIsMobile';

/** Rotating soft accent per domain so the grid feels like a garden, not a spreadsheet. */
const DOMAIN_TONES = [
  { badge: 'bg-leaf-50 text-leaf-600', bar: 'bg-leaf-400' },
  { badge: 'bg-clay-50 text-clay-600', bar: 'bg-clay-300' },
  { badge: 'bg-mind-50 text-mind-600', bar: 'bg-mind-300' },
  { badge: 'bg-sun-50 text-sun-600', bar: 'bg-sun-300' },
];

const BANDWIDTH_META: Record<Bandwidth, { label: string; hint: string; icon: typeof Moon }> = {
  low: { label: 'Low', hint: '休眠 · 只留一件事', icon: Moon },
  medium: { label: 'Med', hint: '生长 · 标准视图', icon: Sprout },
  high: { label: 'High', hint: '繁茂 · 全部信息', icon: Sun },
};

export function App() {
  const isMobile = useIsMobile();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [bandwidth, setBandwidth] = useState<Bandwidth>('medium');
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [domains, setDomains] = useState<UserDomain[]>([]);
  const [streams, setStreams] = useState<StreamItem[]>([]);
  const [nodes, setNodes] = useState<CrystallizedNode[]>([]);
  const [actions, setActions] = useState<ActionExperiment[]>([]);
  const [proposals, setProposals] = useState<ArchitectProposal[]>([]);
  const [dueSocraticNodes, setDueSocraticNodes] = useState<CrystallizedNode[]>([]);
  const [folders, setFolders] = useState<DomainFolder[]>([]);

  // UI state
  const [viewMode, setViewMode] = useState<'workspace' | 'tree3d' | 'metrics'>('workspace');
  const [selectedDomain, setSelectedDomain] = useState<DomainSlug | null>(null);
  const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<'all' | NodeType>('all');
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null);

  // Domain & Folder creation state
  const [addingDomain, setAddingDomain] = useState(false);
  const [newDomainName, setNewDomainName] = useState('');
  const [newDomainDesc, setNewDomainDesc] = useState('');
  const [addingFolderParentId, setAddingFolderParentId] = useState<string | null | 'root'>(null);
  const [newFolderName, setNewFolderName] = useState('');

  const [busyId, setBusyId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [auditTarget, setAuditTarget] = useState<ActionExperiment | null>(null);
  const [socraticNodeId, setSocraticNodeId] = useState<string | null>(null);

  // Freshly crystallized cards (ids that appeared since the previous refresh) get a short glow.
  const knownNodeIds = useRef<Set<string> | null>(null);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());

  const clearSessionState = useCallback(() => {
    setStoredToken(null);
    setUser(null);
    setMetrics(null);
    setDomains([]);
    setStreams([]);
    setNodes([]);
    setActions([]);
    setProposals([]);
    setDueSocraticNodes([]);
    setFolders([]);
    setSelectedDomain(null);
    setSelectedFolderPath(null);
    setBanner(null);
    knownNodeIds.current = null;
  }, []);

  const refreshAll = useCallback(async () => {
    const [m, p, doms, s, n, a, prop, due, flds] = await Promise.all([
      api.getMetrics(),
      api.getProfile(),
      api.listDomains(),
      api.listStream(),
      api.listNodes(),
      api.listActions(),
      api.listProposals(),
      api.getDueSocratic(),
      api.listFolders(),
    ]);
    setMetrics(m);
    setBandwidth(p.current_bandwidth);
    setDomains(doms);
    setStreams(s);
    setNodes(n);
    setActions(a);
    setProposals(prop);
    setDueSocraticNodes(due.due_nodes);
    setFolders(flds);
  }, []);

  useEffect(() => {
    const ids = new Set(nodes.map((n) => n.id));
    const prev = knownNodeIds.current;
    knownNodeIds.current = ids;
    if (!prev || prev.size === 0) return; // initial load: nothing is "new"
    const added = new Set([...ids].filter((id) => !prev.has(id)));
    if (added.size === 0) return;
    setFreshIds(added);
    const t = window.setTimeout(() => setFreshIds(new Set()), 2600);
    return () => window.clearTimeout(t);
  }, [nodes]);

  useEffect(() => {
    setUnauthorizedHandler(clearSessionState);
    const token = getStoredToken();
    if (!token) {
      setAuthChecked(true);
      return;
    }
    api
      .me()
      .then((u) => setUser(u))
      .catch(() => clearSessionState())
      .finally(() => setAuthChecked(true));
  }, [clearSessionState]);

  useEffect(() => {
    if (!user) return;
    refreshAll().catch((e) => setBanner({ type: 'err', text: e.message }));
  }, [user, refreshAll]);

  // Auto-dismiss success banners
  useEffect(() => {
    if (banner?.type !== 'ok') return;
    const t = window.setTimeout(() => setBanner(null), 6000);
    return () => window.clearTimeout(t);
  }, [banner]);

  const handleBandwidthChange = async (next: Bandwidth) => {
    setBandwidth(next);
    await api.setBandwidth(next);
    await refreshAll();
  };

  const handleProposeAction = async (nodeId: string) => {
    setBusyId(nodeId);
    setBanner(null);
    try {
      await api.proposeAction(nodeId);
      await refreshAll();
      setBanner({ type: 'ok', text: '知行审计员已结合理论依据与你的反馈偏好生成微实验' });
    } catch (e) {
      setBanner({ type: 'err', text: (e as Error).message });
    } finally {
      setBusyId(null);
    }
  };

  const activeActions = useMemo(
    () => actions.filter((a) => a.status === 'active' || a.status === 'proposed'),
    [actions],
  );

  const domainNodes = useMemo(
    () => (selectedDomain ? nodes.filter((n) => n.domain_slug === selectedDomain) : []),
    [nodes, selectedDomain],
  );

  // Build 2-level folder tree for selectedDomain
  const folderTree = useMemo(() => {
    if (!selectedDomain) return { level1: [], allPaths: ['核心认知'] };
    const domFolders = folders.filter((f) => f.domain_slug === selectedDomain);
    const level1Rows = domFolders.filter((f) => !f.parent_id);
    const level2Rows = domFolders.filter((f) => !!f.parent_id);

    const nodePathCounts = new Map<string, number>();
    for (const n of domainNodes) {
      const rel = (n.folder_path || `${selectedDomain}/核心认知`).split('/').slice(1).join('/') || '核心认知';
      nodePathCounts.set(rel, (nodePathCounts.get(rel) || 0) + 1);
    }

    const allPaths = new Set<string>(['核心认知']);
    const tree = level1Rows.map((l1) => {
      allPaths.add(l1.folder_name);
      const children = level2Rows
        .filter((l2) => l2.parent_id === l1.id)
        .map((l2) => {
          const fullRel = `${l1.folder_name}/${l2.folder_name}`;
          allPaths.add(fullRel);
          return { ...l2, fullRel, count: nodePathCounts.get(fullRel) || 0 };
        });
      const directCount = nodePathCounts.get(l1.folder_name) || 0;
      const childrenCount = children.reduce((acc, c) => acc + c.count, 0);
      return { ...l1, fullRel: l1.folder_name, directCount, totalCount: directCount + childrenCount, children };
    });

    // Include any AI-created folder paths not yet in domain_folders
    for (const rel of nodePathCounts.keys()) {
      allPaths.add(rel);
    }

    return { level1: tree, allPaths: Array.from(allPaths) };
  }, [selectedDomain, folders, domainNodes]);

  const filteredNodes = useMemo(() => {
    return domainNodes.filter((n) => {
      const normalizedType: NodeType = n.node_type === 'knowledge' ? 'knowledge' : 'decision';
      if (typeFilter !== 'all' && normalizedType !== typeFilter) return false;
      if (selectedFolderPath) {
        const rel = (n.folder_path || `${n.domain_slug}/核心认知`).split('/').slice(1).join('/') || '核心认知';
        if (rel !== selectedFolderPath && !rel.startsWith(selectedFolderPath + '/')) return false;
      }
      return true;
    });
  }, [domainNodes, selectedFolderPath, typeFilter]);

  const domainActiveActions = useMemo(
    () => (selectedDomain ? activeActions.filter((a) => a.domain_slug === selectedDomain) : []),
    [activeActions, selectedDomain],
  );

  const selectedDomainObj = domains.find((d) => d.slug === selectedDomain) || null;
  const lowEnergy = bandwidth === 'low';

  if (!authChecked) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-paper text-sm text-ink-muted">
        <div className="animate-breathe">
          <Logo size={56} />
        </div>
        正在校验登录状态...
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onAuthenticated={(u) => setUser(u)} />;
  }

  const goHome = () => {
    setViewMode('workspace');
    setSelectedDomain(null);
    setSelectedFolderPath(null);
  };

  const folderRowClass = (active: boolean) =>
    `flex flex-1 items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm transition ${
      active ? 'bg-leaf-50 font-bold text-leaf-700' : 'text-ink-soft hover:bg-paper-2 hover:text-ink'
    }`;

  return (
    <div className={`relative isolate min-h-screen text-ink ${isMobile ? 'pb-28' : 'pb-16'}`}>
      <LivingBackground still={lowEnergy} />

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-line/80 bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-2.5 sm:py-3">
          <button onClick={goHome} className="group flex items-center gap-2.5 text-left">
            <motion.div whileHover={{ rotate: -8, scale: 1.06 }} transition={{ type: 'spring', stiffness: 400 }}>
              <Logo size={isMobile ? 34 : 40} animated={!lowEnergy} />
            </motion.div>
            <div>
              <h1 className="text-base leading-tight font-extrabold tracking-tight whitespace-nowrap text-ink">Cognitive Loop</h1>
              {!isMobile && (
                <p className="hidden text-xs font-semibold whitespace-nowrap text-ink-muted xl:block">动态认知闭环</p>
              )}
            </div>
          </button>

          {/* Desktop metrics pill */}
          {!isMobile && metrics && (
            <div className="hidden items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-1 shadow-soft lg:flex">
              <div className="flex items-center gap-1.5" title="决策转化率 DCR">
                <GrowthSprout value={metrics.dcr_percent} size={30} still={lowEnergy} />
                <div className="leading-tight">
                  <div className="text-[0.7rem] font-bold whitespace-nowrap text-ink-muted">DCR</div>
                  <AnimatedNumber value={metrics.dcr_percent} suffix="%" className="text-sm font-extrabold text-leaf-700" />
                </div>
              </div>
              <div className="h-6 w-px bg-line" />
              <div className="leading-tight">
                <div className="text-[0.7rem] font-bold whitespace-nowrap text-ink-muted">压缩比</div>
                <span className="text-sm font-extrabold text-mind-700">
                  <AnimatedNumber value={metrics.avg_compression_ratio} decimals={1} />
                  :1
                </span>
              </div>
              <div className="h-6 w-px bg-line" />
              <div className="leading-tight">
                <div className="text-[0.7rem] font-bold whitespace-nowrap text-ink-muted">已验证</div>
                <span className="text-sm font-extrabold text-ink">
                  {metrics.actions_verified}/{metrics.nodes_total}
                </span>
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {!isMobile && !lowEnergy && (
              <Segmented
                group="view"
                value={viewMode === 'tree3d' ? 'tree3d' : 'workspace'}
                onChange={(v) => setViewMode(v)}
                options={[
                  { value: 'workspace', label: <><LayoutGrid className="h-4 w-4" />工作台</> },
                  { value: 'tree3d', label: <><TreeDeciduous className="h-4 w-4" />知识树</> },
                ]}
              />
            )}

            {!isMobile && !lowEnergy && dueSocraticNodes.length > 0 && (
              <motion.button
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                onClick={() => setSocraticNodeId(dueSocraticNodes[0].id)}
                className="btn btn-soft-mind btn-sm"
              >
                <GraduationCap className="h-4 w-4" />
                陪练
                <span className="rounded-full bg-mind-600 px-1.5 text-xs text-white">{dueSocraticNodes.length}</span>
              </motion.button>
            )}

            {/* Energy (bandwidth) toggle */}
            <Segmented
              group="bandwidth"
              size={isMobile ? 'sm' : 'md'}
              value={bandwidth}
              onChange={(b) => handleBandwidthChange(b)}
              options={(['low', 'medium', 'high'] as Bandwidth[]).map((b) => {
                const Icon = BANDWIDTH_META[b].icon;
                return {
                  value: b,
                  activeClass: b === 'low' ? '!bg-sun-100' : '',
                  label: (
                    <span
                      title={BANDWIDTH_META[b].hint}
                      aria-label={`${BANDWIDTH_META[b].label} · ${BANDWIDTH_META[b].hint}`}
                      className="inline-flex items-center gap-1"
                    >
                      <Icon className={`h-4 w-4 ${bandwidth === b ? (b === 'low' ? 'text-sun-700' : 'text-leaf-600') : ''}`} />
                      {!isMobile && BANDWIDTH_META[b].label}
                    </span>
                  ),
                };
              })}
            />

            <button onClick={() => setSettingsOpen(true)} title="模型设置" className="icon-btn sm:!px-3">
              <Settings className="h-[18px] w-[18px]" />
              {!isMobile && <span className="ml-1.5 hidden text-sm font-bold whitespace-nowrap xl:inline">模型设置</span>}
            </button>

            <button
              onClick={clearSessionState}
              title={`退出登录 (${user.nickname})`}
              className="icon-btn hover:!bg-coral-50 hover:!text-coral-700 sm:!px-2.5"
            >
              {!isMobile && (
                <span className="mr-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-clay-100 text-xs font-extrabold text-clay-700">
                  {(user.nickname || '?').slice(0, 1).toUpperCase()}
                </span>
              )}
              <LogOut className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <AnimatePresence>
          {banner && (
            <motion.div
              key={banner.text}
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
              className={`mb-5 flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm shadow-soft ${
                banner.type === 'ok'
                  ? 'border-leaf-100 bg-leaf-50 text-leaf-800'
                  : 'border-coral-100 bg-coral-50 text-coral-700'
              }`}
              role="status"
            >
              <span className="flex items-center gap-2">
                {banner.type === 'ok' ? <Leaf className="h-4 w-4 shrink-0" /> : <Zap className="h-4 w-4 shrink-0" />}
                {banner.text}
              </span>
              <button onClick={() => setBanner(null)} className="icon-btn shrink-0" aria-label="关闭">
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {isMobile && viewMode === 'metrics' ? (
            /* MOBILE METRICS TAB */
            <motion.div key="metrics" {...pageFade} className="space-y-4">
              <h2 className="text-xl font-extrabold text-ink">认知转化指标与数据概览</h2>
              {metrics && (
                <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-2 gap-3">
                  <motion.div variants={rise} className="card col-span-2 flex items-center gap-4 p-5">
                    <GrowthSprout value={metrics.dcr_percent} size={64} />
                    <div>
                      <div className="text-sm font-bold text-ink-muted">决策转化率 (DCR)</div>
                      <AnimatedNumber value={metrics.dcr_percent} suffix="%" className="text-4xl font-extrabold text-leaf-700" />
                    </div>
                  </motion.div>
                  <motion.div variants={rise} className="card p-4">
                    <div className="text-sm font-bold text-ink-muted">认知压缩比</div>
                    <div className="mt-1 text-2xl font-extrabold text-mind-700">
                      <AnimatedNumber value={metrics.avg_compression_ratio} decimals={1} />:1
                    </div>
                  </motion.div>
                  <motion.div variants={rise} className="card p-4">
                    <div className="text-sm font-bold text-ink-muted">活跃结晶节点</div>
                    <AnimatedNumber value={metrics.nodes_total} className="mt-1 block text-2xl font-extrabold text-ink" />
                  </motion.div>
                  <motion.div variants={rise} className="card col-span-2 p-4">
                    <div className="text-sm font-bold text-ink-muted">已验证行动</div>
                    <AnimatedNumber value={metrics.actions_verified} className="mt-1 block text-2xl font-extrabold text-leaf-700" />
                  </motion.div>
                </motion.div>
              )}
            </motion.div>
          ) : lowEnergy ? (
            /* LOW BANDWIDTH MODE */
            <motion.div key="low" {...pageFade} className="mx-auto max-w-xl py-6">
              <div className="mb-5 flex items-center gap-3">
                <IconBadge tone="sun" size="lg">
                  <Moon className="h-5 w-5" />
                </IconBadge>
                <div>
                  <div className="text-lg font-extrabold text-ink">休眠模式</div>
                  <div className="text-sm text-ink-muted">低精力带宽 · 仅保留今日唯一行动</div>
                </div>
              </div>
              {activeActions.length > 0 ? (
                <ActionCard act={activeActions[0]} variant="hero" onAudit={() => setAuditTarget(activeActions[0])} />
              ) : (
                <EmptyState icon={<Moon className="h-6 w-6" />} tone="sun" text="当前没有待执行的微行动。好好休息。" />
              )}
            </motion.div>
          ) : viewMode === 'tree3d' ? (
            /* 3D SPHERICAL KNOWLEDGE TREE */
            <motion.div key="tree" {...pageFade} className="space-y-4">
              <div>
                <h2 className="text-xl font-extrabold text-ink sm:text-2xl">知识树</h2>
                <p className="mt-1 text-sm text-ink-muted">
                  领域是树干，目录是枝条，卡片是叶片——天青色叶为知识类（名词），叶绿色叶为决策类（动词）。
                </p>
              </div>
              <SphericalTree3D
                domains={domains}
                nodes={nodes}
                folders={folders}
                onStartSocratic={(id) => setSocraticNodeId(id)}
                onProposeAction={handleProposeAction}
              />
            </motion.div>
          ) : !selectedDomain ? (
            /* ROOT WORKSPACE: Custom Domains Grid */
            <motion.div key="home" {...pageFade} className="space-y-6">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl font-extrabold text-ink sm:text-2xl">
                    你好，{user.nickname || '园丁'}
                    <motion.span
                      className="ml-1.5 inline-block align-[-2px] text-leaf-500"
                      style={{ originY: 1 }}
                      animate={{ rotate: [0, 14, -6, 0] }}
                      transition={{ duration: 1.6, delay: 0.4 }}
                    >
                      <Sprout className="h-6 w-6" />
                    </motion.span>
                  </h2>
                  <p className="mt-1 text-sm text-ink-muted">
                    认知领域工作区 · 支持自由新增与重命名领域；首页仅展示待执行有效行动摘要。
                  </p>
                </div>
                <button onClick={() => setAddingDomain((v) => !v)} className="btn btn-primary btn-press">
                  <Plus className="h-4 w-4" />
                  新建认知领域
                </button>
              </div>

              <AnimatePresence>
                {addingDomain && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="card border-leaf-100 p-4 sm:p-5">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <input
                          value={newDomainName}
                          onChange={(e) => setNewDomainName(e.target.value)}
                          placeholder="领域名称（如：AI 工程架构、健康管理）"
                          className="input"
                          autoFocus
                        />
                        <input
                          value={newDomainDesc}
                          onChange={(e) => setNewDomainDesc(e.target.value)}
                          placeholder="一句话描述（可选）"
                          className="input"
                        />
                      </div>
                      <div className="mt-3 flex justify-end gap-2">
                        <button onClick={() => setAddingDomain(false)} className="btn btn-ghost">
                          取消
                        </button>
                        <button
                          onClick={async () => {
                            if (!newDomainName.trim()) return;
                            try {
                              await api.createDomain(newDomainName.trim(), newDomainDesc.trim());
                              setNewDomainName('');
                              setNewDomainDesc('');
                              setAddingDomain(false);
                              await refreshAll();
                            } catch (e) {
                              setBanner({ type: 'err', text: (e as Error).message });
                            }
                          }}
                          className="btn btn-primary btn-press"
                        >
                          创建领域
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-1 gap-5 md:grid-cols-2">
                {domains.map((dom, i) => {
                  const tone = DOMAIN_TONES[i % DOMAIN_TONES.length];
                  const dNodes = nodes.filter((n) => n.domain_slug === dom.slug);
                  const dActions = activeActions.filter((a) => a.domain_slug === dom.slug);
                  const knowledgeCount = dNodes.filter((n) => n.node_type === 'knowledge').length;
                  const decisionCount = dNodes.filter((n) => n.node_type !== 'knowledge').length;
                  const total = Math.max(1, knowledgeCount + decisionCount);
                  const enter = () => {
                    setSelectedDomain(dom.slug);
                    setSelectedFolderPath(null);
                    setTypeFilter('all');
                  };

                  return (
                    <motion.div
                      key={dom.slug}
                      variants={rise}
                      whileHover={{ y: -4 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                      className="card group flex flex-col justify-between p-5 transition-shadow hover:shadow-lift"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-3">
                            <motion.div
                              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${tone.badge}`}
                              whileHover={{ rotate: [0, -10, 8, 0] }}
                            >
                              <Sprout className="h-6 w-6" />
                            </motion.div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1">
                                <h3 className="truncate text-lg font-extrabold text-ink">{dom.name}</h3>
                                <button
                                  title="重命名领域"
                                  onClick={async () => {
                                    const next = window.prompt(`重命名领域「${dom.name}」为：`, dom.name);
                                    if (!next || next.trim() === dom.name) return;
                                    await api.updateDomain(dom.slug, { name: next.trim() });
                                    await refreshAll();
                                  }}
                                  className="icon-btn !p-1 opacity-60 group-hover:opacity-100"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              <p className="truncate text-sm text-ink-muted">{dom.description || '自定义认知领域'}</p>
                            </div>
                          </div>
                          <button onClick={enter} className="btn btn-outline btn-press btn-sm shrink-0">
                            进入
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </div>

                        {/* knowledge / decision composition */}
                        <div className="mt-4">
                          <div className="mb-1.5 flex items-center justify-between text-xs font-bold text-ink-muted">
                            <span>待执行行动 ({dActions.length})</span>
                            <span className="flex items-center gap-2">
                              <span className="flex items-center gap-1">
                                <span className="h-2 w-2 rounded-full bg-mind-500" />知识 {knowledgeCount}
                              </span>
                              <span className="flex items-center gap-1">
                                <span className="h-2 w-2 rounded-full bg-leaf-500" />决策 {decisionCount}
                              </span>
                            </span>
                          </div>
                          <div className="flex h-2 overflow-hidden rounded-full bg-paper-3">
                            <motion.div
                              className="h-full bg-mind-500"
                              initial={{ width: 0 }}
                              animate={{ width: `${(knowledgeCount / total) * 100}%` }}
                              transition={{ type: 'spring', stiffness: 80, damping: 18, delay: 0.2 }}
                            />
                            <motion.div
                              className="h-full bg-leaf-500"
                              initial={{ width: 0 }}
                              animate={{ width: `${(decisionCount / total) * 100}%` }}
                              transition={{ type: 'spring', stiffness: 80, damping: 18, delay: 0.3 }}
                            />
                          </div>
                        </div>

                        <div className="mt-4 space-y-2">
                          {dActions.length > 0 ? (
                            dActions.slice(0, 2).map((act) => (
                              <div key={act.id} className="rounded-2xl border border-line bg-paper p-3">
                                <div className="text-sm font-bold text-ink">{act.micro_action}</div>
                                <div className="mt-1 flex gap-1.5 text-sm text-ink-muted">
                                  <span className="chip chip-sun h-fit shrink-0 !px-1.5 !py-0">If</span>
                                  <span className="line-clamp-2">{act.trigger_condition}</span>
                                </div>
                              </div>
                            ))
                          ) : (
                            <button
                              onClick={enter}
                              className="w-full rounded-2xl border-2 border-dashed border-line p-4 text-center text-sm text-ink-muted transition hover:border-leaf-200 hover:bg-leaf-50/50 hover:text-leaf-700"
                            >
                              暂无待执行微行动，点「进入」从结晶卡片生成。
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
              {domains.length === 0 && (
                <EmptyState icon={<Sprout className="h-6 w-6" />} tone="leaf" text="还没有认知领域，先新建一个吧。" />
              )}
            </motion.div>
          ) : (
            /* DOMAIN DRILL-DOWN: 2-Level Folder Tree + Rich Cards */
            <motion.div key={`domain-${selectedDomain}`} {...pageFade} className="space-y-5">
              {/* Breadcrumb & Type Filter */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => {
                      setSelectedDomain(null);
                      setSelectedFolderPath(null);
                    }}
                    className="btn btn-outline btn-press btn-sm"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    领域
                  </button>
                  <ChevronRight className="h-4 w-4 text-ink-faint" />
                  <button
                    onClick={() => setSelectedFolderPath(null)}
                    className={`text-lg font-extrabold ${selectedFolderPath ? 'text-ink-muted hover:text-ink' : 'text-ink'}`}
                  >
                    {selectedDomainObj?.name || selectedDomain}
                  </button>
                  {selectedFolderPath && (
                    <>
                      <ChevronRight className="h-4 w-4 text-ink-faint" />
                      <span className="chip chip-clay !text-sm">
                        <Folder className="h-3.5 w-3.5" />
                        {selectedFolderPath}
                      </span>
                    </>
                  )}
                </div>

                <Segmented
                  group="type-filter"
                  value={typeFilter}
                  onChange={setTypeFilter}
                  options={[
                    { value: 'all', label: '全部' },
                    {
                      value: 'knowledge',
                      label: <><span className="h-2 w-2 rounded-full bg-mind-500" />知识 (名词)</>,
                    },
                    {
                      value: 'decision',
                      label: <><span className="h-2 w-2 rounded-full bg-leaf-500" />决策 (动词)</>,
                    },
                  ]}
                />
              </div>

              {/* Architect Panel */}
              <ArchitectPanel
                domain={selectedDomain}
                proposals={proposals.filter((p) => p.domain_slug === selectedDomain)}
                onRefresh={refreshAll}
                onBanner={(type, text) => setBanner({ type, text })}
              />

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                {/* Folder sidebar */}
                <aside className="card h-fit space-y-1.5 p-3.5 lg:sticky lg:top-24 lg:col-span-3">
                  <div className="mb-2 flex items-center justify-between px-1">
                    <span className="eyebrow">两级目录</span>
                    <button
                      onClick={() => {
                        setAddingFolderParentId('root');
                        setNewFolderName('');
                      }}
                      className="btn btn-soft-clay btn-sm !px-2 !py-1"
                    >
                      <FolderPlus className="h-3.5 w-3.5" />
                      一级目录
                    </button>
                  </div>

                  <AnimatePresence>
                    {addingFolderParentId !== null && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mb-2 space-y-2 rounded-2xl border border-clay-100 bg-clay-50 p-2.5">
                          <div className="text-xs font-bold text-clay-700">
                            {addingFolderParentId === 'root' ? '新建一级目录' : '新建二级子目录'}
                          </div>
                          <input
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            placeholder="目录名称..."
                            className="input !py-1.5 !text-sm"
                            autoFocus
                          />
                          <div className="flex justify-end gap-1.5">
                            <button onClick={() => setAddingFolderParentId(null)} className="btn btn-ghost btn-sm">
                              取消
                            </button>
                            <button
                              onClick={async () => {
                                if (!newFolderName.trim()) return;
                                try {
                                  await api.createFolder(
                                    selectedDomain,
                                    newFolderName.trim(),
                                    addingFolderParentId === 'root' ? null : addingFolderParentId,
                                  );
                                  setNewFolderName('');
                                  setAddingFolderParentId(null);
                                  await refreshAll();
                                } catch (e) {
                                  setBanner({ type: 'err', text: (e as Error).message });
                                }
                              }}
                              className="btn btn-primary btn-press btn-sm"
                            >
                              确定
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <button onClick={() => setSelectedFolderPath(null)} className={`w-full ${folderRowClass(!selectedFolderPath)}`}>
                    <span className="flex items-center gap-2">
                      <LayoutGrid className="h-4 w-4" />
                      全部目录
                    </span>
                    <span className="text-xs font-bold tabular-nums">{domainNodes.length}</span>
                  </button>

                  <div className="space-y-1">
                    {folderTree.level1.map((l1) => (
                      <div key={l1.id} className="space-y-0.5">
                        <div className="group flex items-center gap-0.5">
                          <button onClick={() => setSelectedFolderPath(l1.fullRel)} className={folderRowClass(selectedFolderPath === l1.fullRel)}>
                            <span className="flex min-w-0 items-center gap-2">
                              <Folder className="h-4 w-4 shrink-0 text-clay-500" />
                              <span className="truncate">{l1.folder_name}</span>
                              {l1.is_system === 1 && <span className="chip chip-muted !px-1.5 !py-0 !text-xs">固定</span>}
                            </span>
                            <span className="text-xs font-bold text-ink-muted tabular-nums">{l1.totalCount}</span>
                          </button>
                          <button
                            title="添加二级子目录"
                            onClick={() => {
                              setAddingFolderParentId(l1.id);
                              setNewFolderName('');
                            }}
                            className="icon-btn !p-1.5 opacity-50 group-hover:opacity-100"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                          {l1.is_system !== 1 && (
                            <button
                              title="重命名一级目录"
                              onClick={async () => {
                                const next = window.prompt(`重命名「${l1.folder_name}」为：`, l1.folder_name);
                                if (!next || next.trim() === l1.folder_name) return;
                                await api.renameFolder(selectedDomain, l1.folder_name, next.trim(), l1.id);
                                await refreshAll();
                              }}
                              className="icon-btn !p-1.5 opacity-50 group-hover:opacity-100"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>

                        {l1.children.length > 0 && (
                          <div className="ml-5 space-y-0.5 border-l-2 border-leaf-100 pl-2">
                            {l1.children.map((l2) => (
                              <div key={l2.id} className="group flex items-center gap-0.5">
                                <button
                                  onClick={() => setSelectedFolderPath(l2.fullRel)}
                                  className={`${folderRowClass(selectedFolderPath === l2.fullRel)} !py-1.5`}
                                >
                                  <span className="flex min-w-0 items-center gap-1.5">
                                    <Leaf className="h-3.5 w-3.5 shrink-0 text-leaf-400" />
                                    <span className="truncate">{l2.folder_name}</span>
                                  </span>
                                  <span className="text-xs font-bold text-ink-muted tabular-nums">{l2.count}</span>
                                </button>
                                <button
                                  title="重命名二级目录"
                                  onClick={async () => {
                                    const next = window.prompt(`重命名「${l2.folder_name}」为：`, l2.folder_name);
                                    if (!next || next.trim() === l2.folder_name) return;
                                    await api.renameFolder(selectedDomain, l2.folder_name, next.trim(), l2.id);
                                    await refreshAll();
                                  }}
                                  className="icon-btn !p-1.5 opacity-50 group-hover:opacity-100"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </aside>

                {/* Center: cards */}
                <div className="space-y-4 lg:col-span-6">
                  {filteredNodes.length === 0 && (
                    <EmptyState icon={<Sprout className="h-6 w-6" />} tone="leaf" text="当前目录下暂无符合条件的卡片。" />
                  )}
                  <AnimatePresence mode="popLayout">
                    {filteredNodes.map((node) => {
                      const currentRelPath =
                        (node.folder_path || `${node.domain_slug}/核心认知`).split('/').slice(1).join('/') || '核心认知';
                      return (
                        <NodeCard
                          key={node.id}
                          node={node}
                          expanded={expandedNodeId === node.id}
                          fresh={freshIds.has(node.id)}
                          busy={busyId === node.id}
                          disabled={busyId !== null}
                          folderPaths={folderTree.allPaths}
                          currentRelPath={currentRelPath}
                          onToggleExpand={() => setExpandedNodeId(expandedNodeId === node.id ? null : node.id)}
                          onMove={async (p) => {
                            await api.moveNodeFolder(node.id, p);
                            await refreshAll();
                          }}
                          onVerify={async () => {
                            await api.verifyNode(node.id);
                            await refreshAll();
                          }}
                          onSocratic={() => setSocraticNodeId(node.id)}
                          onPropose={() => handleProposeAction(node.id)}
                        />
                      );
                    })}
                  </AnimatePresence>
                </div>

                {/* Right: active actions */}
                <div className="space-y-3 lg:sticky lg:top-24 lg:col-span-3 lg:h-fit">
                  <h3 className="flex items-center gap-2 px-1 text-sm font-extrabold text-ink">
                    <CheckCircle2 className="h-4 w-4 text-leaf-600" />
                    本领域待执行行动
                    <span className="chip chip-leaf !py-0">{domainActiveActions.length}</span>
                  </h3>
                  {domainActiveActions.length === 0 && (
                    <div className="rounded-3xl border-2 border-dashed border-line p-6 text-center text-sm text-ink-muted">
                      点击卡片生成带理论依据的微实验。
                    </div>
                  )}
                  <AnimatePresence mode="popLayout">
                    {domainActiveActions.map((act) => (
                      <ActionCard key={act.id} act={{ ...act, node_title: undefined }} onAudit={() => setAuditTarget(act)} />
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Desktop Floating Action Ball */}
      <StreamFab
        domains={domains}
        streams={streams}
        hideFab={isMobile}
        externalOpen={captureOpen}
        onExternalClose={() => setCaptureOpen(false)}
        onRefresh={refreshAll}
        onDistilled={(text) => setBanner({ type: 'ok', text })}
        onError={(text) => setBanner({ type: 'err', text })}
      />

      {/* Mobile bottom navigation */}
      {isMobile && (
        <nav className="fixed inset-x-3 bottom-3 z-40 flex items-center justify-around rounded-3xl border border-line bg-surface/95 px-1 py-1.5 shadow-lift backdrop-blur">
          <MobileTab active={viewMode === 'workspace'} onClick={() => setViewMode('workspace')} icon={<LayoutGrid className="h-5 w-5" />} label="工作台" />
          <MobileTab active={viewMode === 'tree3d'} onClick={() => setViewMode('tree3d')} icon={<Globe className="h-5 w-5" />} label="知识树" />
          <motion.button
            onClick={() => setCaptureOpen(true)}
            whileTap={{ scale: 0.9 }}
            aria-label="捕获对话"
            className="flex h-14 w-14 -translate-y-4 items-center justify-center rounded-full border-4 border-paper bg-leaf-600 text-white shadow-[0_5px_0_var(--color-leaf-800)]"
          >
            <Plus className="h-6 w-6" strokeWidth={2.6} />
          </motion.button>
          <MobileTab
            active={false}
            onClick={() => {
              if (dueSocraticNodes.length > 0) setSocraticNodeId(dueSocraticNodes[0].id);
              else if (nodes.length > 0) setSocraticNodeId(nodes[0].id);
            }}
            icon={<GraduationCap className="h-5 w-5" />}
            label="陪练"
            badge={dueSocraticNodes.length}
          />
          <MobileTab active={viewMode === 'metrics'} onClick={() => setViewMode('metrics')} icon={<BarChart3 className="h-5 w-5" />} label="指标" />
        </nav>
      )}

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <SocraticModal
        initialNodeId={socraticNodeId}
        availableNodes={nodes}
        open={socraticNodeId !== null}
        onClose={() => setSocraticNodeId(null)}
        onCompleted={refreshAll}
      />
      <AuditModal
        action={auditTarget}
        onClose={() => setAuditTarget(null)}
        onSubmitted={() => {
          refreshAll();
          setBanner({ type: 'ok', text: '审计反馈已写入！权重与用户反馈记忆已更新。' });
        }}
      />

      <footer className="mt-12 pb-6 text-center text-xs text-ink-muted">
        <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer" className="hover:text-ink">
          湘ICP备2026033436号
        </a>
      </footer>
    </div>
  );
}

const pageFade = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const },
};

function EmptyState({ icon, text, tone }: { icon: React.ReactNode; text: string; tone: 'leaf' | 'sun' }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-line bg-surface/60 p-10 text-center">
      <motion.div animate={{ y: [0, -5, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}>
        <IconBadge tone={tone} size="lg">
          {icon}
        </IconBadge>
      </motion.div>
      <p className="text-sm text-ink-muted">{text}</p>
    </div>
  );
}

function MobileTab({
  active,
  onClick,
  icon,
  label,
  badge = 0,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center gap-0.5 rounded-2xl px-3 py-1 text-xs font-bold transition ${
        active ? 'text-leaf-700' : 'text-ink-muted'
      }`}
    >
      {active && (
        <motion.span
          layoutId="mobile-tab"
          className="absolute inset-0 rounded-2xl bg-leaf-50"
          transition={{ type: 'spring', stiffness: 500, damping: 36 }}
        />
      )}
      <span className="relative">
        {icon}
        {badge > 0 && (
          <span className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-mind-600 px-1 text-[0.65rem] text-white">
            {badge}
          </span>
        )}
      </span>
      <span className="relative">{label}</span>
    </button>
  );
}

export default App;
