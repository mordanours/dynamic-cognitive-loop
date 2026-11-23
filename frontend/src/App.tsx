import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  BarChart3,
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronRight,
  Compass,
  Folder,
  FolderPlus,
  Globe,
  GraduationCap,
  LayoutGrid,
  Loader2,
  LogOut,
  Pencil,
  Plus,
  Settings,
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
import { RichMarkdown } from './components/RichMarkdown';
import { SettingsModal } from './components/SettingsModal';
import { SocraticModal } from './components/SocraticModal';
import { SphericalTree3D } from './components/SphericalTree3D';
import { StreamFab } from './components/StreamFab';
import { useIsMobile } from './hooks/useIsMobile';

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

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-xs text-slate-400">
        正在校验登录状态...
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onAuthenticated={(u) => setUser(u)} />;
  }

  return (
    <div className={`min-h-screen bg-slate-950 text-slate-100 ${isMobile ? 'pb-24' : 'pb-16'}`}>
      {/* Adaptive Header: Minimal on Mobile, Full Cockpit on Desktop */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-2.5 sm:py-3">
          <button
            onClick={() => {
              setViewMode('workspace');
              setSelectedDomain(null);
              setSelectedFolderPath(null);
            }}
            className="flex items-center gap-2 text-left"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600/20 text-indigo-400 sm:h-9 sm:w-9">
              <Brain className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-white">Cognitive Loop</h1>
              {!isMobile && <p className="text-[11px] text-slate-400">Agentic PKM · 动态认知闭环</p>}
            </div>
          </button>

          {/* Desktop Metrics Pill */}
          {!isMobile && metrics && (
            <div className="flex items-center gap-4 rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-1.5 text-xs">
              <div>
                <span className="text-slate-400">DCR </span>
                <span className="font-bold text-emerald-400">{metrics.dcr_percent}%</span>
              </div>
              <div className="h-3 w-px bg-slate-800" />
              <div>
                <span className="text-slate-400">压缩比 </span>
                <span className="font-bold text-indigo-300">{metrics.avg_compression_ratio}:1</span>
              </div>
              <div className="h-3 w-px bg-slate-800" />
              <div>
                <span className="text-slate-400">已验证 </span>
                <span className="font-bold text-slate-200">
                  {metrics.actions_verified}/{metrics.nodes_total}
                </span>
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {!isMobile && bandwidth !== 'low' && (
              <div className="flex rounded-xl border border-slate-800 bg-slate-900 p-0.5 text-xs">
                <button
                  onClick={() => setViewMode('workspace')}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1 font-medium transition ${
                    viewMode === 'workspace' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  工作台
                </button>
                <button
                  onClick={() => setViewMode('tree3d')}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1 font-medium transition ${
                    viewMode === 'tree3d' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Globe className="h-3.5 w-3.5" />
                  3D 知识树
                </button>
              </div>
            )}

            {!isMobile && bandwidth !== 'low' && dueSocraticNodes.length > 0 && (
              <button
                onClick={() => setSocraticNodeId(dueSocraticNodes[0].id)}
                className="flex items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-500/20"
              >
                <GraduationCap className="h-3.5 w-3.5" />
                陪练 ({dueSocraticNodes.length})
              </button>
            )}

            {/* Bandwidth Toggle */}
            <div className="flex rounded-xl border border-slate-800 bg-slate-900 p-0.5 text-[11px] sm:text-xs">
              {(['low', 'medium', 'high'] as Bandwidth[]).map((b) => (
                <button
                  key={b}
                  onClick={() => handleBandwidthChange(b)}
                  className={`rounded-lg px-2 py-1 font-medium transition sm:px-2.5 ${
                    bandwidth === b
                      ? b === 'low'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {b === 'low' ? 'Low' : b === 'medium' ? 'Med' : 'High'}
                </button>
              ))}
            </div>

            <button
              onClick={() => setSettingsOpen(true)}
              title="模型设置"
              className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-900 p-1.5 text-xs text-slate-300 hover:border-slate-700 hover:text-white sm:px-3"
            >
              <Settings className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              {!isMobile && <span>模型设置</span>}
            </button>

            <button
              onClick={clearSessionState}
              title={`退出登录 (${user.nickname})`}
              className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-900 p-1.5 text-xs text-slate-400 hover:border-rose-500/40 hover:text-rose-300 sm:px-2.5"
            >
              <LogOut className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              {!isMobile && <span>{user.nickname}</span>}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5">
        {banner && (
          <div
            className={`mb-4 flex items-center justify-between rounded-xl border px-4 py-2.5 text-xs ${
              banner.type === 'ok'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
            }`}
          >
            <span>{banner.text}</span>
            <button onClick={() => setBanner(null)} className="ml-4 shrink-0 text-slate-400 hover:text-white">
              关闭
            </button>
          </div>
        )}

        {/* MOBILE METRICS TAB */}
        {isMobile && viewMode === 'metrics' ? (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-white">认知转化指标与数据概览</h2>
            {metrics && (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                  <div className="text-xs text-slate-400">决策转化率 (DCR)</div>
                  <div className="mt-1 text-2xl font-bold text-emerald-400">{metrics.dcr_percent}%</div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                  <div className="text-xs text-slate-400">认知压缩比</div>
                  <div className="mt-1 text-2xl font-bold text-indigo-300">{metrics.avg_compression_ratio}:1</div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                  <div className="text-xs text-slate-400">活跃结晶节点</div>
                  <div className="mt-1 text-2xl font-bold text-white">{metrics.nodes_total}</div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                  <div className="text-xs text-slate-400">已验证行动</div>
                  <div className="mt-1 text-2xl font-bold text-emerald-300">{metrics.actions_verified}</div>
                </div>
              </div>
            )}
          </div>
        ) : bandwidth === 'low' ? (
          /* LOW BANDWIDTH MODE */
          <div className="mx-auto max-w-xl py-6">
            <div className="mb-4 flex items-center gap-2 text-amber-300">
              <Zap className="h-4 w-4" />
              <span className="text-xs font-medium tracking-wider">低精力带宽模式 · 仅保留今日唯一行动</span>
            </div>
            {activeActions.length > 0 ? (
              <div className="rounded-2xl border border-amber-500/30 bg-slate-900 p-5 shadow-xl">
                <div className="mb-1 text-xs text-slate-400">来自：{activeActions[0].node_title}</div>
                <h2 className="text-base font-semibold text-white sm:text-lg">{activeActions[0].micro_action}</h2>
                {activeActions[0].theoretical_basis && (
                  <p className="mt-2 text-xs text-indigo-300/90">理论依据：{activeActions[0].theoretical_basis}</p>
                )}
                <div className="mt-3 rounded-xl bg-slate-950 p-3 text-xs text-slate-300">
                  <div>
                    <span className="text-amber-400">If 触发：</span>
                    {activeActions[0].trigger_condition}
                  </div>
                  <div className="mt-1">
                    <span className="text-emerald-400">标准：</span>
                    {activeActions[0].success_metric}
                  </div>
                </div>
                <button
                  onClick={() => setAuditTarget(activeActions[0])}
                  className="mt-5 w-full rounded-xl bg-emerald-600 py-3 text-sm font-medium text-white hover:bg-emerald-500"
                >
                  完成并提交 1 分钟审计
                </button>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-400">
                当前没有待执行的微行动。
              </div>
            )}
          </div>
        ) : viewMode === 'tree3d' ? (
          /* 3D SPHERICAL KNOWLEDGE TREE */
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-white sm:text-lg">3D 球形知识树</h2>
              <p className="mt-1 text-xs text-slate-400">
                动态分布所有自定义领域与两级目录（青色=知识类名词，翠绿=决策类动词）。
              </p>
            </div>
            <SphericalTree3D
              domains={domains}
              nodes={nodes}
              folders={folders}
              onStartSocratic={(id) => setSocraticNodeId(id)}
              onProposeAction={handleProposeAction}
            />
          </div>
        ) : !selectedDomain ? (
          /* ROOT WORKSPACE: Custom Domains Grid */
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-white sm:text-lg">认知领域工作区</h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  支持自由新增与重命名领域；首页仅展示待执行有效行动摘要。
                </p>
              </div>
              <button
                onClick={() => setAddingDomain((v) => !v)}
                className="flex items-center gap-1.5 rounded-xl border border-indigo-500/40 bg-indigo-500/15 px-3.5 py-2 text-xs font-medium text-indigo-200 hover:bg-indigo-500/25"
              >
                <Plus className="h-3.5 w-3.5" />
                新建认知领域
              </button>
            </div>

            {addingDomain && (
              <div className="rounded-2xl border border-indigo-500/30 bg-slate-900 p-4 text-xs">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <input
                    value={newDomainName}
                    onChange={(e) => setNewDomainName(e.target.value)}
                    placeholder="领域名称（如：AI 工程架构、健康管理）"
                    className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500 sm:text-xs"
                  />
                  <input
                    value={newDomainDesc}
                    onChange={(e) => setNewDomainDesc(e.target.value)}
                    placeholder="一句话描述（可选）"
                    className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500 sm:text-xs"
                  />
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    onClick={() => setAddingDomain(false)}
                    className="rounded-lg px-3 py-1.5 text-slate-400 hover:text-white"
                  >
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
                    className="rounded-lg bg-indigo-600 px-4 py-1.5 font-medium text-white hover:bg-indigo-500"
                  >
                    创建领域
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {domains.map((dom) => {
                const dNodes = nodes.filter((n) => n.domain_slug === dom.slug);
                const dActions = activeActions.filter((a) => a.domain_slug === dom.slug);
                const knowledgeCount = dNodes.filter((n) => n.node_type === 'knowledge').length;
                const decisionCount = dNodes.filter((n) => n.node_type !== 'knowledge').length;

                return (
                  <div
                    key={dom.slug}
                    className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/70 p-5 transition hover:border-indigo-500/40"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-400">
                            <Folder className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <h3 className="text-base font-semibold text-white">{dom.name}</h3>
                              <button
                                title="重命名领域"
                                onClick={async () => {
                                  const next = window.prompt(`重命名领域「${dom.name}」为：`, dom.name);
                                  if (!next || next.trim() === dom.name) return;
                                  await api.updateDomain(dom.slug, { name: next.trim() });
                                  await refreshAll();
                                }}
                                className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            </div>
                            <p className="text-xs text-slate-400">{dom.description || '自定义认知领域'}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setSelectedDomain(dom.slug);
                            setSelectedFolderPath(null);
                            setTypeFilter('all');
                          }}
                          className="flex shrink-0 items-center gap-1 rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-medium text-indigo-300 hover:bg-slate-800"
                        >
                          进入
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="mt-4 space-y-2">
                        <div className="flex items-center justify-between text-[11px] font-medium text-slate-400">
                          <span>待执行行动 ({dActions.length})</span>
                          <span>
                            知识 {knowledgeCount} · 决策 {decisionCount}
                          </span>
                        </div>
                        {dActions.length > 0 ? (
                          dActions.slice(0, 2).map((act) => (
                            <div
                              key={act.id}
                              className="rounded-xl border border-emerald-500/20 bg-slate-950/90 p-3"
                            >
                              <div className="text-sm font-medium text-white sm:text-xs">{act.micro_action}</div>
                              <div className="mt-1 text-xs text-slate-400 sm:text-[11px]">
                                <span className="text-amber-400">If: </span>
                                {act.trigger_condition}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-xl border border-dashed border-slate-800 p-4 text-center text-xs text-slate-500">
                            暂无待执行微行动，点右上角「进入」从结晶卡片生成。
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* DOMAIN DRILL-DOWN: 2-Level Folder Tree + Rich Cards */
          <div className="space-y-5">
            {/* Breadcrumb & Type Filter */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div className="flex flex-wrap items-center gap-1.5 text-sm">
                <button
                  onClick={() => {
                    setSelectedDomain(null);
                    setSelectedFolderPath(null);
                  }}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-slate-900 hover:text-white"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  领域
                </button>
                <span className="text-slate-600">/</span>
                <button
                  onClick={() => setSelectedFolderPath(null)}
                  className={`font-semibold ${selectedFolderPath ? 'text-slate-300 hover:text-white' : 'text-white'}`}
                >
                  {selectedDomainObj?.name || selectedDomain}
                </button>
                {selectedFolderPath && (
                  <>
                    <span className="text-slate-600">/</span>
                    <span className="font-semibold text-indigo-300">{selectedFolderPath}</span>
                  </>
                )}
              </div>

              <div className="flex rounded-xl border border-slate-800 bg-slate-900 p-0.5 text-xs">
                {(
                  [
                    ['all', '全部'],
                    ['knowledge', '知识 (名词)'],
                    ['decision', '决策 (动词)'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setTypeFilter(key)}
                    className={`rounded-lg px-3 py-1 font-medium transition ${
                      typeFilter === key ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Architect Panel */}
            <ArchitectPanel
              domain={selectedDomain}
              proposals={proposals.filter((p) => p.domain_slug === selectedDomain)}
              onRefresh={refreshAll}
              onBanner={(type, text) => setBanner({ type, text })}
            />

            {/* Adaptive 2-Shell Content Area */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* 2-Level Folder Tree Sidebar (Left on Desktop, Compact Top Drawer on Mobile) */}
              <aside className="space-y-2 rounded-2xl border border-slate-800 bg-slate-900/50 p-3.5 lg:col-span-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">两级目录导航</span>
                  <button
                    onClick={() => {
                      setAddingFolderParentId('root');
                      setNewFolderName('');
                    }}
                    className="flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-[11px] text-indigo-300 hover:bg-slate-800"
                  >
                    <FolderPlus className="h-3 w-3" />
                    一级目录
                  </button>
                </div>

                {addingFolderParentId !== null && (
                  <div className="mb-2 space-y-1.5 rounded-xl border border-indigo-500/30 bg-slate-950 p-2.5 text-xs">
                    <div className="text-[11px] text-indigo-300">
                      {addingFolderParentId === 'root' ? '新建一级目录' : '新建二级子目录'}
                    </div>
                    <input
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder="目录名称..."
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white outline-none focus:border-indigo-500"
                    />
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => setAddingFolderParentId(null)}
                        className="px-2 py-1 text-[11px] text-slate-400"
                      >
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
                        className="rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] text-white"
                      >
                        确定
                      </button>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => setSelectedFolderPath(null)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs ${
                    !selectedFolderPath
                      ? 'bg-indigo-600/20 font-medium text-indigo-200'
                      : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
                  }`}
                >
                  <span>全部目录</span>
                  <span>{domainNodes.length}</span>
                </button>

                <div className="space-y-1">
                  {folderTree.level1.map((l1) => (
                    <div key={l1.id} className="space-y-0.5">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setSelectedFolderPath(l1.fullRel)}
                          className={`flex flex-1 items-center justify-between rounded-xl px-3 py-2 text-xs ${
                            selectedFolderPath === l1.fullRel
                              ? 'bg-indigo-600/20 font-medium text-indigo-200'
                              : 'text-slate-300 hover:bg-slate-800/60'
                          }`}
                        >
                          <span className="flex items-center gap-1.5 truncate">
                            <Folder className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                            <span className="truncate">{l1.folder_name}</span>
                            {l1.is_system === 1 && (
                              <span className="rounded bg-slate-800 px-1 text-[9px] text-slate-400">固定</span>
                            )}
                          </span>
                          <span className="text-[11px] text-slate-500">{l1.totalCount}</span>
                        </button>
                        <button
                          title="添加二级子目录"
                          onClick={() => {
                            setAddingFolderParentId(l1.id);
                            setNewFolderName('');
                          }}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-indigo-300"
                        >
                          <Plus className="h-3 w-3" />
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
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        )}
                      </div>

                      {/* Level-2 Children */}
                      {l1.children.length > 0 && (
                        <div className="ml-4 space-y-0.5 border-l border-slate-800 pl-2">
                          {l1.children.map((l2) => (
                            <div key={l2.id} className="flex items-center gap-1">
                              <button
                                onClick={() => setSelectedFolderPath(l2.fullRel)}
                                className={`flex flex-1 items-center justify-between rounded-lg px-2.5 py-1.5 text-xs ${
                                  selectedFolderPath === l2.fullRel
                                    ? 'bg-indigo-600/20 font-medium text-indigo-200'
                                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                                }`}
                              >
                                <span className="truncate">{l2.folder_name}</span>
                                <span className="text-[11px] text-slate-500">{l2.count}</span>
                              </button>
                              <button
                                title="重命名二级目录"
                                onClick={async () => {
                                  const next = window.prompt(`重命名「${l2.folder_name}」为：`, l2.folder_name);
                                  if (!next || next.trim() === l2.folder_name) return;
                                  await api.renameFolder(selectedDomain, l2.folder_name, next.trim(), l2.id);
                                  await refreshAll();
                                }}
                                className="rounded p-1 text-slate-600 hover:text-slate-300"
                              >
                                <Pencil className="h-2.5 w-2.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </aside>

              {/* Center: Crystallized Cards (Full-Width Single Column on Mobile, Grid on Desktop) */}
              <div className="space-y-4 lg:col-span-6">
                {filteredNodes.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-800 p-10 text-center text-xs text-slate-500">
                    当前目录下暂无符合条件的卡片。
                  </div>
                )}

                {filteredNodes.map((node) => {
                  const isKnowledge = node.node_type === 'knowledge';
                  const isExpanded = expandedNodeId === node.id;
                  const currentRelPath =
                    (node.folder_path || `${node.domain_slug}/核心认知`).split('/').slice(1).join('/') || '核心认知';

                  return (
                    <div
                      key={node.id}
                      className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5"
                    >
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                        <span
                          className={`flex items-center gap-1 rounded-md px-2 py-0.5 font-medium ${
                            isKnowledge ? 'bg-cyan-500/15 text-cyan-300' : 'bg-emerald-500/15 text-emerald-300'
                          }`}
                        >
                          {isKnowledge ? <BookOpen className="h-3 w-3" /> : <Compass className="h-3 w-3" />}
                          {isKnowledge ? '知识类' : '决策类'} · v{node.schema_version}
                        </span>
                        <span className="text-slate-400">
                          效用 <b className="text-emerald-400">{Math.round(node.conversion_weight * 100)}%</b>
                        </span>
                      </div>

                      <div className="text-xs font-medium text-indigo-300">{node.short_keyword || node.title}</div>
                      <h3 className="mt-0.5 text-base font-semibold text-white sm:text-sm">{node.title}</h3>

                      {node.needs_verification === 1 && (
                        <div className="mt-2 flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-200">
                          <span>v{node.schema_version} 迁移字段待核实</span>
                          <button
                            onClick={async () => {
                              await api.verifyNode(node.id);
                              await refreshAll();
                            }}
                            className="rounded bg-amber-500/20 px-2 py-0.5 font-medium text-amber-100"
                          >
                            确认已核实
                          </button>
                        </div>
                      )}

                      <div className="mt-2.5 rounded-xl bg-slate-950 p-3 text-sm leading-relaxed text-slate-200 sm:text-xs">
                        <RichMarkdown content={node.atomic_claim} />
                      </div>

                      {/* Rich Blocks (Tables / Structured Data preserved intact) */}
                      {(node.rich_blocks || []).map((rb, idx) => (
                        <div key={idx} className="mt-3 rounded-xl border border-indigo-500/25 bg-slate-950/90 p-3">
                          <div className="mb-1 text-xs font-semibold text-indigo-300">{rb.title}</div>
                          <RichMarkdown content={rb.markdown} />
                        </div>
                      ))}

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <button
                          onClick={() => setExpandedNodeId(isExpanded ? null : node.id)}
                          className="text-xs text-slate-400 hover:text-indigo-300 sm:text-[11px]"
                        >
                          {isExpanded ? '收起结构化字段 ▲' : '展开结构化字段 ▼'}
                        </button>
                        <select
                          value={currentRelPath}
                          onChange={async (e) => {
                            await api.moveNodeFolder(node.id, e.target.value);
                            await refreshAll();
                          }}
                          className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-300 sm:text-[11px]"
                        >
                          {folderTree.allPaths.map((p) => (
                            <option key={p} value={p}>
                              /{p}
                            </option>
                          ))}
                        </select>
                      </div>

                      {isExpanded && (
                        <div className="mt-2.5 space-y-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-300 sm:text-xs">
                          {Object.entries(node.payload).map(([k, v]) => (
                            <div key={k}>
                              <div className="font-semibold text-slate-400">{k}</div>
                              <RichMarkdown content={typeof v === 'string' ? v : JSON.stringify(v, null, 2)} />
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3">
                        <span className="text-[11px] text-slate-500">可信度 {Math.round(node.confidence * 100)}%</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setSocraticNodeId(node.id)}
                            className="flex items-center gap-1 rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-500/20"
                          >
                            <GraduationCap className="h-3.5 w-3.5" />
                            陪练
                          </button>
                          <button
                            onClick={() => handleProposeAction(node.id)}
                            disabled={busyId !== null}
                            className="flex items-center gap-1 rounded-lg bg-indigo-600/20 px-3 py-1.5 text-xs font-medium text-indigo-300 hover:bg-indigo-600/30 disabled:opacity-50"
                          >
                            {busyId === node.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Activity className="h-3.5 w-3.5" />
                            )}
                            {isKnowledge ? '理解检验' : '生成微行动'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Right: Domain Active Actions */}
              <div className="space-y-3 lg:col-span-3">
                <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wider text-slate-400">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  本领域待执行行动 ({domainActiveActions.length})
                </h3>
                {domainActiveActions.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-800 p-6 text-center text-xs text-slate-500">
                    点击卡片生成带理论依据的微实验。
                  </div>
                )}
                {domainActiveActions.map((act) => (
                  <div key={act.id} className="rounded-2xl border border-emerald-500/25 bg-slate-900/80 p-4">
                    <div className="text-sm font-semibold text-white sm:text-xs">{act.micro_action}</div>
                    {act.theoretical_basis && (
                      <div className="mt-2 rounded-lg bg-indigo-500/10 px-2.5 py-1.5 text-xs text-indigo-200 sm:text-[11px]">
                        <b>理论依据：</b>
                        {act.theoretical_basis}
                      </div>
                    )}
                    <div className="mt-2 space-y-1 rounded-xl bg-slate-950 p-2.5 text-xs text-slate-300 sm:text-[11px]">
                      <div>
                        <span className="text-amber-400">If 触发：</span>
                        {act.trigger_condition}
                      </div>
                      <div>
                        <span className="text-emerald-400">标准：</span>
                        {act.success_metric}
                      </div>
                    </div>
                    <button
                      onClick={() => setAuditTarget(act)}
                      className="mt-3 w-full rounded-xl bg-emerald-600 py-2.5 text-xs font-medium text-white hover:bg-emerald-500"
                    >
                      提交真实反馈
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
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

      {/* Mobile Fixed Bottom Navigation Bar */}
      {isMobile && (
        <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-slate-800 bg-slate-950/95 px-2 py-1.5 backdrop-blur">
          <button
            onClick={() => setViewMode('workspace')}
            className={`flex flex-col items-center gap-0.5 px-3 py-1 text-[10px] ${
              viewMode === 'workspace' ? 'text-indigo-400' : 'text-slate-400'
            }`}
          >
            <LayoutGrid className="h-5 w-5" />
            工作台
          </button>
          <button
            onClick={() => setViewMode('tree3d')}
            className={`flex flex-col items-center gap-0.5 px-3 py-1 text-[10px] ${
              viewMode === 'tree3d' ? 'text-indigo-400' : 'text-slate-400'
            }`}
          >
            <Globe className="h-5 w-5" />
            3D 树
          </button>
          <button
            onClick={() => setCaptureOpen(true)}
            className="flex h-11 w-11 -translate-y-2 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-600 to-violet-500 text-white shadow-lg"
          >
            <Plus className="h-5 w-5" />
          </button>
          <button
            onClick={() => {
              if (dueSocraticNodes.length > 0) setSocraticNodeId(dueSocraticNodes[0].id);
              else if (nodes.length > 0) setSocraticNodeId(nodes[0].id);
            }}
            className="flex flex-col items-center gap-0.5 px-3 py-1 text-[10px] text-slate-400 hover:text-cyan-300"
          >
            <GraduationCap className="h-5 w-5" />
            陪练
          </button>
          <button
            onClick={() => setViewMode('metrics')}
            className={`flex flex-col items-center gap-0.5 px-3 py-1 text-[10px] ${
              viewMode === 'metrics' ? 'text-indigo-400' : 'text-slate-400'
            }`}
          >
            <BarChart3 className="h-5 w-5" />
            指标
          </button>
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

      <footer className="mt-10 pb-6 text-center text-[11px] text-slate-600">
        <a
          href="https://beian.miit.gov.cn/"
          target="_blank"
          rel="noreferrer"
          className="hover:text-slate-400"
        >
          湘ICP备2026033436号
        </a>
      </footer>
    </div>
  );
}
export default App;
