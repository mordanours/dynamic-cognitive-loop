import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeft,
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
} from './api';
import { ArchitectPanel } from './components/ArchitectPanel';
import { AuditModal } from './components/AuditModal';
import { AuthScreen } from './components/AuthScreen';
import { SettingsModal } from './components/SettingsModal';
import { SocraticModal } from './components/SocraticModal';
import { SphericalTree3D } from './components/SphericalTree3D';
import { StreamFab } from './components/StreamFab';

const DOMAINS: { slug: DomainSlug; name: string; desc: string }[] = [
  {
    slug: 'investing',
    name: '个人投资与决策',
    desc: '仓位纪律、赔率模型与风险边界',
  },
  {
    slug: 'learning',
    name: '教育学习',
    desc: '费曼类比、心智模型与跨场景迁移',
  },
];

export function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [bandwidth, setBandwidth] = useState<Bandwidth>('medium');
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [streams, setStreams] = useState<StreamItem[]>([]);
  const [nodes, setNodes] = useState<CrystallizedNode[]>([]);
  const [actions, setActions] = useState<ActionExperiment[]>([]);
  const [proposals, setProposals] = useState<ArchitectProposal[]>([]);
  const [dueSocraticNodes, setDueSocraticNodes] = useState<CrystallizedNode[]>([]);
  const [folders, setFolders] = useState<DomainFolder[]>([]);
  const [newFolderName, setNewFolderName] = useState('');
  const [addingFolder, setAddingFolder] = useState(false);

  // View mode & folder path navigation state
  const [viewMode, setViewMode] = useState<'workspace' | 'tree3d'>('workspace');
  const [selectedDomain, setSelectedDomain] = useState<DomainSlug | null>(null);
  const [selectedSubfolder, setSelectedSubfolder] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<'all' | NodeType>('all');
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [auditTarget, setAuditTarget] = useState<ActionExperiment | null>(null);
  const [socraticNodeId, setSocraticNodeId] = useState<string | null>(null);

  const refreshAll = useCallback(async () => {
    const [m, p, s, n, a, prop, due, flds] = await Promise.all([
      api.getMetrics(),
      api.getProfile(),
      api.listStream(),
      api.listNodes(),
      api.listActions(),
      api.listProposals(),
      api.getDueSocratic(),
      api.listFolders(),
    ]);
    setMetrics(m);
    setBandwidth(p.current_bandwidth);
    setStreams(s);
    setNodes(n);
    setActions(a);
    setProposals(prop);
    setDueSocraticNodes(due.due_nodes);
    setFolders(flds);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
    });
    const token = getStoredToken();
    if (!token) {
      setAuthChecked(true);
      return;
    }
    api
      .me()
      .then((u) => {
        setUser(u);
      })
      .catch(() => {
        setStoredToken(null);
        setUser(null);
      })
      .finally(() => setAuthChecked(true));
  }, []);

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

  const subfolders = useMemo(() => {
    const map = new Map<string, { count: number; isSystem: boolean }>();
    // Fixed system folder first
    map.set('核心认知', { count: 0, isSystem: true });
    if (selectedDomain) {
      for (const f of folders.filter((fld) => fld.domain_slug === selectedDomain)) {
        map.set(f.folder_name, { count: 0, isSystem: f.is_system === 1 });
      }
    }
    for (const n of domainNodes) {
      const sub = (n.folder_path || `${n.domain_slug}/核心认知`).split('/').slice(1).join('/') || '核心认知';
      const prev = map.get(sub) || { count: 0, isSystem: sub === '核心认知' };
      map.set(sub, { count: prev.count + 1, isSystem: prev.isSystem });
    }
    return Array.from(map.entries());
  }, [domainNodes, folders, selectedDomain]);

  const filteredNodes = useMemo(() => {
    return domainNodes.filter((n) => {
      const normalizedType: NodeType = n.node_type === 'knowledge' ? 'knowledge' : 'decision';
      if (typeFilter !== 'all' && normalizedType !== typeFilter) return false;
      if (selectedSubfolder) {
        const sub = (n.folder_path || `${n.domain_slug}/核心认知`).split('/').slice(1).join('/') || '核心认知';
        if (sub !== selectedSubfolder) return false;
      }
      return true;
    });
  }, [domainNodes, selectedSubfolder, typeFilter]);

  const domainActiveActions = useMemo(
    () => (selectedDomain ? activeActions.filter((a) => a.domain_slug === selectedDomain) : []),
    [activeActions, selectedDomain],
  );

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
    <div className="min-h-screen bg-slate-950 pb-24 text-slate-100">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <button
            onClick={() => {
              setSelectedDomain(null);
              setSelectedSubfolder(null);
            }}
            className="flex items-center gap-2.5 text-left"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600/20 text-indigo-400">
              <Brain className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-white">Dynamic Cognitive Loop</h1>
              <p className="text-[11px] text-slate-400">Agentic PKM · 渐进披露认知驾驶舱</p>
            </div>
          </button>

          {metrics && (
            <div className="flex items-center gap-4 rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-1.5 text-xs">
              <div>
                <span className="text-slate-400">DCR 转化率 </span>
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

          <div className="flex items-center gap-2">
            {bandwidth !== 'low' && (
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
            {bandwidth !== 'low' && dueSocraticNodes.length > 0 && (
              <button
                onClick={() => setSocraticNodeId(dueSocraticNodes[0].id)}
                className="flex items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-500/20"
              >
                <GraduationCap className="h-3.5 w-3.5" />
                苏格拉底陪练 ({dueSocraticNodes.length})
              </button>
            )}
            <div className="flex rounded-xl border border-slate-800 bg-slate-900 p-0.5 text-xs">
              {(['low', 'medium', 'high'] as Bandwidth[]).map((b) => (
                <button
                  key={b}
                  onClick={() => handleBandwidthChange(b)}
                  className={`rounded-lg px-2.5 py-1 font-medium transition ${
                    bandwidth === b
                      ? b === 'low'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {b === 'low' ? 'Low 低带宽' : b === 'medium' ? 'Med' : 'High'}
                </button>
              ))}
            </div>
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-700 hover:text-white"
            >
              <Settings className="h-3.5 w-3.5" />
              模型设置
            </button>
            <button
              onClick={() => {
                setStoredToken(null);
                setUser(null);
              }}
              title={`当前用户: ${user.nickname} (点击退出)`}
              className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-400 hover:border-rose-500/40 hover:text-rose-300"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{user.nickname}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {banner && (
          <div
            className={`mb-5 flex items-center justify-between rounded-xl border px-4 py-2.5 text-xs ${
              banner.type === 'ok'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
            }`}
          >
            <span>{banner.text}</span>
            <button onClick={() => setBanner(null)} className="ml-4 text-slate-400 hover:text-white">
              关闭
            </button>
          </div>
        )}

        {/* LOW BANDWIDTH MODE */}
        {bandwidth === 'low' ? (
          <div className="mx-auto max-w-xl py-8">
            <div className="mb-4 flex items-center gap-2 text-amber-300">
              <Zap className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">
                低精力带宽模式 · 仅保留今日唯一行动
              </span>
            </div>
            {activeActions.length > 0 ? (
              <div className="rounded-2xl border border-amber-500/30 bg-slate-900 p-6 shadow-xl">
                <div className="mb-1 text-xs text-slate-400">来自：{activeActions[0].node_title}</div>
                <h2 className="text-lg font-semibold text-white">{activeActions[0].micro_action}</h2>
                {activeActions[0].theoretical_basis && (
                  <p className="mt-2 text-xs text-indigo-300/90">
                    理论依据：{activeActions[0].theoretical_basis}
                  </p>
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
                  className="mt-5 w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-500"
                >
                  完成并提交 1 分钟审计
                </button>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-400">
                当前没有待执行的微行动。点击右下角悬浮球可随时录入新对话。
              </div>
            )}
          </div>
        ) : viewMode === 'tree3d' ? (
          <div className="space-y-4">
            <div className="flex items-end justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">3D 球形知识树</h2>
                <p className="mt-1 text-xs text-slate-400">
                  中心为认知中枢，内层为领域、中层为目录路径、外层为原子认知（青色=知识类名词，翠绿=决策类动词，球体大小代表效用权重）。
                </p>
              </div>
            </div>
            <SphericalTree3D
              nodes={nodes}
              folders={folders}
              onStartSocratic={(id) => setSocraticNodeId(id)}
              onProposeAction={handleProposeAction}
            />
          </div>
        ) : !selectedDomain ? (
          /* ROOT VIEW: Spacious Domain Folder Cards (Progressive Disclosure) */
          <div className="space-y-6">
            <div className="flex items-end justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">认知领域工作区</h2>
                <p className="mt-1 text-xs text-slate-400">
                  首页仅展示各领域当前最有效的待执行行动；点击领域文件夹进入完整结晶与路径视图。
                </p>
              </div>
              <span className="text-xs text-slate-500">右下角悬浮球可随时捕获 AI 对话</span>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {DOMAINS.map((dom) => {
                const dNodes = nodes.filter((n) => n.domain_slug === dom.slug);
                const dActions = activeActions.filter((a) => a.domain_slug === dom.slug);
                const knowledgeCount = dNodes.filter((n) => n.node_type === 'knowledge').length;
                const decisionCount = dNodes.filter((n) => n.node_type !== 'knowledge').length;
                const uniqueFolders = Array.from(
                  new Set(
                    dNodes.map(
                      (n) => (n.folder_path || `${dom.slug}/核心认知`).split('/').slice(1).join('/') || '核心认知',
                    ),
                  ),
                );

                return (
                  <div
                    key={dom.slug}
                    className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/70 p-6 transition hover:border-indigo-500/40"
                  >
                    <div>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-400">
                            <Folder className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="text-base font-semibold text-white">{dom.name}</h3>
                            <p className="text-xs text-slate-400">{dom.desc}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setSelectedDomain(dom.slug);
                            setSelectedSubfolder(null);
                            setTypeFilter('all');
                          }}
                          className="flex items-center gap-1 rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-medium text-indigo-300 hover:bg-slate-800"
                        >
                          展开目录
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Subfolder path pills */}
                      {uniqueFolders.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-1.5">
                          {uniqueFolders.map((sub) => (
                            <button
                              key={sub}
                              onClick={() => {
                                setSelectedDomain(dom.slug);
                                setSelectedSubfolder(sub);
                                setTypeFilter('all');
                              }}
                              className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-[11px] text-slate-300 hover:border-indigo-500/50 hover:text-indigo-300"
                            >
                              /{sub}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Low-Bandwidth Summary: Top Active Actions ONLY */}
                      <div className="mt-5 space-y-2.5">
                        <div className="flex items-center justify-between text-[11px] font-medium text-slate-400">
                          <span>当前待执行有效行动 ({dActions.length})</span>
                          <span>
                            知识 {knowledgeCount} · 决策 {decisionCount}
                          </span>
                        </div>
                        {dActions.length > 0 ? (
                          dActions.slice(0, 2).map((act) => (
                            <div
                              key={act.id}
                              className="rounded-xl border border-emerald-500/20 bg-slate-950/90 p-3.5"
                            >
                              <div className="text-xs font-medium text-white">{act.micro_action}</div>
                              <div className="mt-1 text-[11px] text-slate-400">
                                <span className="text-amber-400">If: </span>
                                {act.trigger_condition}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-xl border border-dashed border-slate-800 p-4 text-center text-xs text-slate-500">
                            暂无待执行微行动，点右上角「展开目录」从结晶卡片生成。
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
          /* FOLDER DRILL-DOWN VIEW */
          <div className="space-y-5">
            {/* Breadcrumb & Filters */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2 text-sm">
                <button
                  onClick={() => {
                    setSelectedDomain(null);
                    setSelectedSubfolder(null);
                  }}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-slate-900 hover:text-white"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  领域总览
                </button>
                <span className="text-slate-600">/</span>
                <button
                  onClick={() => setSelectedSubfolder(null)}
                  className={`font-semibold ${selectedSubfolder ? 'text-slate-300 hover:text-white' : 'text-white'}`}
                >
                  {DOMAINS.find((d) => d.slug === selectedDomain)?.name}
                </button>
                {selectedSubfolder && (
                  <>
                    <span className="text-slate-600">/</span>
                    <span className="font-semibold text-indigo-300">{selectedSubfolder}</span>
                  </>
                )}
              </div>

              {/* Type Filter: Knowledge vs Decision */}
              <div className="flex rounded-xl border border-slate-800 bg-slate-900 p-0.5 text-xs">
                {(
                  [
                    ['all', '全部卡片'],
                    ['knowledge', '知识类 (名词)'],
                    ['decision', '决策类 (动词)'],
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

            {/* Subfolder Tabs + Custom Folder Creation */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setSelectedSubfolder(null)}
                className={`rounded-xl border px-3 py-1.5 text-xs ${
                  !selectedSubfolder
                    ? 'border-indigo-500 bg-indigo-500/15 text-indigo-200'
                    : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                全部目录 ({domainNodes.length})
              </button>
              {subfolders.map(([sub, meta]) => (
                <div key={sub} className="flex items-center">
                  <button
                    onClick={() => setSelectedSubfolder(sub)}
                    className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs ${
                      selectedSubfolder === sub
                        ? 'border-indigo-500 bg-indigo-500/15 text-indigo-200'
                        : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Folder className="h-3.5 w-3.5" />
                    {sub} ({meta.count})
                    {meta.isSystem && (
                      <span className="rounded bg-slate-800 px-1 text-[10px] text-slate-400">固定</span>
                    )}
                  </button>
                  {!meta.isSystem && (
                    <button
                      title="重命名目录"
                      onClick={async () => {
                        const nextName = window.prompt(`重命名目录「${sub}」为：`, sub);
                        if (!nextName || nextName.trim() === sub) return;
                        try {
                          await api.renameFolder(selectedDomain, sub, nextName.trim());
                          if (selectedSubfolder === sub) setSelectedSubfolder(nextName.trim());
                          await refreshAll();
                        } catch (e) {
                          setBanner({ type: 'err', text: (e as Error).message });
                        }
                      }}
                      className="ml-1 rounded-lg p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}

              {addingFolder ? (
                <div className="flex items-center gap-1.5">
                  <input
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="新目录名..."
                    className="w-32 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-100 outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={async () => {
                      if (!newFolderName.trim()) return;
                      try {
                        await api.createFolder(selectedDomain, newFolderName.trim());
                        setNewFolderName('');
                        setAddingFolder(false);
                        await refreshAll();
                      } catch (e) {
                        setBanner({ type: 'err', text: (e as Error).message });
                      }
                    }}
                    className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs text-white hover:bg-indigo-500"
                  >
                    确定
                  </button>
                  <button
                    onClick={() => setAddingFolder(false)}
                    className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:text-white"
                  >
                    取消
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingFolder(true)}
                  className="flex items-center gap-1 rounded-xl border border-dashed border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:border-indigo-500 hover:text-indigo-300"
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                  新建目录
                </button>
              )}
            </div>

            {/* Architect Panel (Consolidation & GC) */}
            <ArchitectPanel
              domain={selectedDomain}
              proposals={proposals.filter((p) => p.domain_slug === selectedDomain)}
              onRefresh={refreshAll}
              onBanner={(type, text) => setBanner({ type, text })}
            />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* Left 8 cols: Crystallized Cards Grid */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:col-span-8">
                {filteredNodes.length === 0 && (
                  <div className="col-span-full rounded-2xl border border-dashed border-slate-800 p-10 text-center text-xs text-slate-500">
                    当前路径下暂无符合条件的卡片。
                  </div>
                )}
                {filteredNodes.map((node) => {
                  const isKnowledge = node.node_type === 'knowledge';
                  const isExpanded = expandedNodeId === node.id;

                  return (
                    <div
                      key={node.id}
                      className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/70 p-4 transition hover:border-slate-700"
                    >
                      <div>
                        <div className="mb-2 flex items-center justify-between text-[11px]">
                          <span
                            className={`flex items-center gap-1 rounded-md px-2 py-0.5 font-medium ${
                              isKnowledge
                                ? 'bg-cyan-500/15 text-cyan-300'
                                : 'bg-emerald-500/15 text-emerald-300'
                            }`}
                          >
                            {isKnowledge ? <BookOpen className="h-3 w-3" /> : <Compass className="h-3 w-3" />}
                            {isKnowledge ? '知识类' : '决策类'} · v{node.schema_version}
                          </span>
                          <span className="text-slate-400">
                            效用 <b className="text-emerald-400">{Math.round(node.conversion_weight * 100)}%</b>
                          </span>
                        </div>

                        <div className="text-xs font-medium text-indigo-300">
                          {node.short_keyword || node.title}
                        </div>
                        <h3 className="mt-0.5 text-sm font-semibold text-white">{node.title}</h3>
                        {node.needs_verification === 1 && (
                          <div className="mt-1.5 flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-200">
                            <span>v{node.schema_version} 迁移字段待核实</span>
                            <button
                              onClick={async () => {
                                await api.verifyNode(node.id);
                                await refreshAll();
                              }}
                              className="rounded bg-amber-500/20 px-2 py-0.5 font-medium text-amber-100 hover:bg-amber-500/30"
                            >
                              确认已核实
                            </button>
                          </div>
                        )}
                        <p className="mt-2 rounded-lg bg-slate-950 p-2.5 text-xs leading-relaxed text-slate-300">
                          {node.atomic_claim}
                        </p>

                        <div className="mt-2.5 flex items-center justify-between gap-2">
                          <button
                            onClick={() => setExpandedNodeId(isExpanded ? null : node.id)}
                            className="text-[11px] text-slate-400 hover:text-indigo-300"
                          >
                            {isExpanded ? '收起结构化字段 ▲' : '展开结构化字段 ▼'}
                          </button>
                          <select
                            value={(node.folder_path || `${node.domain_slug}/核心认知`).split('/').slice(1).join('/') || '核心认知'}
                            onChange={async (e) => {
                              await api.moveNodeFolder(node.id, e.target.value);
                              await refreshAll();
                            }}
                            title="移动到子目录"
                            className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-0.5 text-[11px] text-slate-400 hover:text-slate-200"
                          >
                            {subfolders.map(([sub]) => (
                              <option key={sub} value={sub}>
                                /{sub}
                              </option>
                            ))}
                          </select>
                        </div>

                        {isExpanded && (
                          <div className="mt-2 space-y-1.5 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-300">
                            {Object.entries(node.payload).map(([k, v]) => (
                              <div key={k}>
                                <span className="font-medium text-slate-400">{k}: </span>
                                <span>{typeof v === 'string' ? v : JSON.stringify(v)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3">
                        <span className="text-[11px] text-slate-500">
                          可信度 {Math.round(node.confidence * 100)}%
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setSocraticNodeId(node.id)}
                            className="flex items-center gap-1 rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-2.5 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-500/20"
                          >
                            <GraduationCap className="h-3 w-3" />
                            陪练
                          </button>
                          <button
                            onClick={() => handleProposeAction(node.id)}
                            disabled={busyId !== null}
                            className="flex items-center gap-1 rounded-lg bg-indigo-600/20 px-3 py-1.5 text-xs font-medium text-indigo-300 hover:bg-indigo-600/30 disabled:opacity-50"
                          >
                            {busyId === node.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Activity className="h-3 w-3" />
                            )}
                            {isKnowledge ? '理解检验' : '生成微行动'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Right 4 cols: Domain Active Actions */}
              <div className="space-y-3 lg:col-span-4">
                <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  本领域待执行行动 ({domainActiveActions.length})
                </h3>
                {domainActiveActions.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-800 p-6 text-center text-xs text-slate-500">
                    点击左侧卡片生成带理论依据的微实验。
                  </div>
                )}
                {domainActiveActions.map((act) => (
                  <div key={act.id} className="rounded-2xl border border-emerald-500/25 bg-slate-900/80 p-4">
                    <div className="text-xs font-semibold text-white">{act.micro_action}</div>
                    {act.theoretical_basis && (
                      <div className="mt-2 rounded-lg bg-indigo-500/10 px-2.5 py-1.5 text-[11px] text-indigo-200">
                        <b>理论依据：</b>
                        {act.theoretical_basis}
                      </div>
                    )}
                    <div className="mt-2 space-y-1 rounded-xl bg-slate-950 p-2.5 text-[11px] text-slate-300">
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
                      className="mt-3 w-full rounded-xl bg-emerald-600 py-2 text-xs font-medium text-white hover:bg-emerald-500"
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

      {/* Bottom-Right Floating Ball for Stream Layer */}
      <StreamFab
        streams={streams}
        onRefresh={refreshAll}
        onDistilled={(text) => setBanner({ type: 'ok', text })}
        onError={(text) => setBanner({ type: 'err', text })}
      />

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

      <footer className="mt-12 pb-6 text-center text-[11px] text-slate-600">
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
