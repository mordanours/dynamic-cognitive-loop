import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowUpCircle,
  Check,
  ChevronDown,
  ChevronUp,
  GitMerge,
  Loader2,
  MessageSquarePlus,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  api,
  ArchitectProposal,
  CustomSchemaField,
  DomainSlug,
  SchemaEvolutionStatus,
} from '../api';
import { IconBadge } from './ui/Modal';

interface Props {
  domain: DomainSlug;
  proposals: ArchitectProposal[];
  onRefresh: () => Promise<void>;
  onBanner: (type: 'ok' | 'err', text: string) => void;
}

const PRESET_FIELD_HINTS: CustomSchemaField[] = [
  { key: 'core_hypothesis', title: '核心假设' },
  { key: 'risk_exposure', title: '风险敞口与最坏情况' },
  { key: 'action_triggers', title: '行动触发条件' },
  { key: 'falsification_criteria', title: '证伪标准' },
  { key: 'socratic_blindspot_patch', title: '陪练盲区与实战补丁' },
];

const collapse = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto' },
  exit: { opacity: 0, height: 0 },
};

export function ArchitectPanel({ domain, proposals, onRefresh, onBanner }: Props) {
  const [scanning, setScanning] = useState(false);
  const [evolving, setEvolving] = useState(false);
  const [evoBuilderOpen, setEvoBuilderOpen] = useState(false);
  const [customFields, setCustomFields] = useState<CustomSchemaField[]>([]);
  const [evolutionGoal, setEvolutionGoal] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedOriginals, setExpandedOriginals] = useState<Record<string, boolean>>({});
  const [refineOpenId, setRefineOpenId] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState('');
  const [schemaStatus, setSchemaStatus] = useState<SchemaEvolutionStatus | null>(null);

  useEffect(() => {
    api
      .getSchemaStatus(domain)
      .then((st) => {
        setSchemaStatus(st);
        setCustomFields(st.suggested_fields || []);
      })
      .catch(() => {});
  }, [domain, proposals.length]);

  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await api.scanDomain(domain);
      await onRefresh();
      onBanner('ok', `架构师扫描完成：${res.summary}（新增 ${res.created_proposals.length} 条提案）`);
    } catch (e) {
      onBanner('err', (e as Error).message);
    } finally {
      setScanning(false);
    }
  };

  const handlePreviewEvolution = async () => {
    const validFields = customFields.filter((f) => f.key.trim() && f.title.trim());
    if (validFields.length === 0) {
      onBanner('err', '请至少保留或添加一个目标字段');
      return;
    }
    setEvolving(true);
    try {
      const res = await api.previewSchemaEvolution(domain, validFields, evolutionGoal.trim());
      setEvoBuilderOpen(false);
      await onRefresh();
      onBanner('ok', `已生成 v${schemaStatus?.current_version} → v${schemaStatus?.next_version} 融合演进 Diff：${res.rationale}`);
    } catch (e) {
      onBanner('err', (e as Error).message);
    } finally {
      setEvolving(false);
    }
  };

  const handleApprove = async (id: string, isSchemaEvo: boolean) => {
    setBusyId(id);
    try {
      await api.approveProposal(id);
      await onRefresh();
      const updated = await api.getSchemaStatus(domain);
      setSchemaStatus(updated);
      onBanner(
        'ok',
        isSchemaEvo
          ? '已批准 Schema 演进！领域已升级至 v2 实践期，迁移卡片已标记「待核实」。'
          : '已批准整理提案！重复节点已合并归档，活跃微行动已自动迁移。',
      );
    } catch (e) {
      onBanner('err', (e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (id: string) => {
    setBusyId(id);
    try {
      await api.rejectProposal(id);
      await onRefresh();
    } catch (e) {
      onBanner('err', (e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const handleRefine = async (id: string) => {
    if (suggestion.trim().length < 2) return;
    setBusyId(id);
    try {
      await api.refineProposal(id, suggestion.trim());
      setSuggestion('');
      setRefineOpenId(null);
      await onRefresh();
      onBanner('ok', '已按你的建议重新合成合并卡片，请核实后决定是否批准。');
    } catch (e) {
      onBanner('err', (e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="card overflow-hidden">
      {/* Clay header strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-clay-100 bg-clay-50 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <IconBadge tone="clay" size="sm">
            <GitMerge className="h-4 w-4" />
          </IconBadge>
          <h3 className="text-sm font-extrabold text-ink">数据结构架构师</h3>
          {schemaStatus && (
            <span className="chip border border-clay-100 bg-surface text-ink-soft">
              当前结构：v{schemaStatus.current_version} (L{schemaStatus.current_tier}) · 已验证行动{' '}
              <b className="text-leaf-700">
                {schemaStatus.actions_verified}/{schemaStatus.recommended_threshold}
              </b>
            </span>
          )}
          <AnimatePresence>
            {proposals.length > 0 && (
              <motion.span
                key="pending"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                className="chip bg-clay-500 text-surface"
              >
                {proposals.length} 条待审批
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {schemaStatus && (
            <button
              onClick={() => setEvoBuilderOpen((v) => !v)}
              disabled={evolving || scanning}
              className="btn btn-soft-sun btn-sm"
            >
              <ArrowUpCircle className="h-4 w-4" />
              自定义 v{schemaStatus.current_version} → v{schemaStatus.next_version} 演进
            </button>
          )}
          <button onClick={handleScan} disabled={scanning || evolving} className="btn btn-soft-clay btn-sm">
            {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            扫描重复与低效卡片
          </button>
        </div>
      </div>

      <div>
        {/* Custom Schema Evolution Builder */}
        <AnimatePresence initial={false}>
          {evoBuilderOpen && schemaStatus && (
            <motion.div key="evo-builder" {...collapse} className="overflow-hidden">
              <div className="m-4 space-y-4 rounded-2xl border border-sun-100 bg-sun-50 p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-bold text-sun-700">
                      自定义 v{schemaStatus.current_version} → v{schemaStatus.next_version} 演进结构
                    </div>
                    <div className="mt-0.5 text-xs text-ink-muted">
                      将自动融合本领域 {schemaStatus.socratic_logs_count} 条苏格拉底陪练回答与审计复盘
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      setCustomFields((prev) => [...prev, { key: `custom_${prev.length + 1}`, title: '新维度' }])
                    }
                    className="btn btn-outline btn-press btn-sm"
                  >
                    <Plus className="h-4 w-4" />
                    添加字段
                  </button>
                </div>

                {/* Preset Hints */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-ink-muted">可选提示字段：</span>
                  {PRESET_FIELD_HINTS.map((hint) => (
                    <button
                      key={hint.key}
                      onClick={() => {
                        if (!customFields.some((f) => f.key === hint.key)) {
                          setCustomFields((prev) => [...prev, hint]);
                        }
                      }}
                      className="chip border border-sun-100 bg-surface text-ink-soft transition-colors hover:border-sun-300 hover:text-sun-700"
                    >
                      + {hint.title}
                    </button>
                  ))}
                </div>

                {/* Editable Fields */}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <AnimatePresence initial={false}>
                    {customFields.map((fld, idx) => (
                      <motion.div
                        key={idx}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="flex items-center gap-1.5 rounded-xl border border-line bg-surface p-2"
                      >
                        <input
                          value={fld.key}
                          onChange={(e) =>
                            setCustomFields((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, key: e.target.value } : item)),
                            )
                          }
                          placeholder="字段key"
                          className="input !w-28 !px-2 !py-1 font-mono !text-xs"
                        />
                        <input
                          value={fld.title}
                          onChange={(e) =>
                            setCustomFields((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, title: e.target.value } : item)),
                            )
                          }
                          placeholder="中文标题"
                          className="input flex-1 !px-2 !py-1 !text-sm"
                        />
                        <button
                          onClick={() => setCustomFields((prev) => prev.filter((_, i) => i !== idx))}
                          className="icon-btn hover:!bg-coral-50 hover:!text-coral-600"
                          aria-label="删除字段"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                <input
                  value={evolutionGoal}
                  onChange={(e) => setEvolutionGoal(e.target.value)}
                  placeholder="演进融合目标（可选，例如：结合陪练中的盲区回答，提炼更贴合实战的防错与反例）..."
                  className="input"
                />

                <div className="flex justify-end gap-2">
                  <button onClick={() => setEvoBuilderOpen(false)} className="btn btn-ghost btn-sm">
                    取消
                  </button>
                  <button onClick={handlePreviewEvolution} disabled={evolving} className="btn btn-primary btn-press btn-sm">
                    {evolving && <Loader2 className="h-4 w-4 animate-spin" />}
                    融合陪练记录并生成演进 Diff
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div layout className={`space-y-3 ${proposals.length > 0 ? `px-4 pb-4 ${evoBuilderOpen ? '' : 'pt-4'}` : ''}`}>
          <AnimatePresence initial={false}>
            {proposals.map((prop) => {
              const isSchemaEvo = prop.proposal_type === 'evolve_schema';
              const showOrig = !!expandedOriginals[prop.id];
              return (
                <motion.div
                  key={prop.id}
                  layout
                  initial={{ opacity: 0, y: 14, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 24, scale: 0.96 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                  className={`rounded-2xl border bg-surface p-4 text-sm ${
                    isSchemaEvo ? 'border-sun-100' : 'border-clay-100'
                  }`}
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className={`chip ${isSchemaEvo ? 'chip-sun' : 'chip-clay'} !text-sm`}>
                      {isSchemaEvo
                        ? `动态 Schema 演进：v${prop.proposed_node?.from_version} → v${prop.proposed_node?.to_version}`
                        : prop.proposal_type === 'merge_duplicates'
                          ? '合并重复认知'
                          : '淘汰低效用卡片'}
                    </span>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleReject(prop.id)}
                        disabled={busyId !== null}
                        className="btn btn-ghost btn-sm"
                      >
                        <X className="h-4 w-4" />
                        驳回
                      </button>
                      {prop.proposal_type === 'merge_duplicates' && (
                        <button
                          onClick={() => setRefineOpenId(refineOpenId === prop.id ? null : prop.id)}
                          disabled={busyId !== null}
                          className="btn btn-soft-mind btn-sm"
                        >
                          <MessageSquarePlus className="h-4 w-4" />
                          提建议修订
                        </button>
                      )}
                      <button
                        onClick={() => handleApprove(prop.id, isSchemaEvo)}
                        disabled={busyId !== null}
                        className="btn btn-primary btn-press btn-sm"
                      >
                        {busyId === prop.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        {isSchemaEvo ? '批准升级并迁移卡片' : '批准执行'}
                      </button>
                    </div>
                  </div>

                  <p className="mb-3 leading-relaxed text-ink-muted">理由：{prop.rationale}</p>

                  {/* Schema Evolution Side-by-Side Diff */}
                  {isSchemaEvo && prop.proposed_node ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        <div className="well p-3">
                          <div className="mb-1.5 text-xs font-bold text-ink-muted">
                            旧结构 v{prop.proposed_node.from_version} 字段
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {Object.entries(prop.proposed_node.from_schema?.properties || {}).map(([k, v]) => (
                              <span key={k} className="chip chip-muted bg-surface">
                                {k} ({v.title || k})
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-sun-100 bg-sun-50 p-3">
                          <div className="mb-1.5 text-xs font-bold text-sun-700">
                            新结构 v{prop.proposed_node.to_version} 字段 (升级后)
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {Object.entries(prop.proposed_node.to_schema?.properties || {}).map(([k, v]) => (
                              <span key={k} className="chip bg-surface text-sun-700">
                                + {k} ({v.title || k})
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {(prop.proposed_node.migrated_nodes || []).length > 0 && (
                        <div className="space-y-2">
                          <div className="text-xs font-bold text-ink-muted">
                            待无损迁移卡片预览 ({prop.proposed_node.migrated_nodes?.length} 张)：
                          </div>
                          {prop.proposed_node.migrated_nodes?.map((mn) => (
                            <div key={mn.node_id} className="rounded-2xl border border-line p-3">
                              <div className="mb-2 font-bold text-ink">{mn.title}</div>
                              <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-2">
                                <div className="well p-2.5 text-ink-muted">
                                  <div className="mb-1 font-bold text-ink-soft">v1 原载荷</div>
                                  {Object.entries(mn.old_payload).map(([k, v]) => (
                                    <div key={k} className="leading-relaxed">
                                      <b>{k}:</b> {typeof v === 'string' ? v : JSON.stringify(v)}
                                    </div>
                                  ))}
                                </div>
                                <div className="rounded-2xl border border-leaf-100 bg-leaf-50 p-2.5 text-ink-soft">
                                  <div className="mb-1 font-bold text-leaf-700">v2 演进载荷</div>
                                  {Object.entries(mn.new_payload).map(([k, v]) => (
                                    <div key={k} className="leading-relaxed">
                                      <b className="text-leaf-700">{k}:</b>{' '}
                                      {typeof v === 'string' ? v : JSON.stringify(v)}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Merge / Deprecate Diff */
                    <>
                      <AnimatePresence initial={false}>
                        {refineOpenId === prop.id && (
                          <motion.div key="refine" {...collapse} className="overflow-hidden">
                            <div className="mb-3 flex gap-2 rounded-2xl border border-mind-100 bg-mind-50 p-2.5">
                              <input
                                value={suggestion}
                                onChange={(e) => setSuggestion(e.target.value)}
                                placeholder="输入你的直觉或修改意见..."
                                className="input flex-1 !py-1.5"
                              />
                              <button
                                onClick={() => handleRefine(prop.id)}
                                disabled={busyId !== null || suggestion.trim().length < 2}
                                className="btn btn-mind btn-press btn-sm"
                              >
                                {busyId === prop.id && <Loader2 className="h-4 w-4 animate-spin" />}
                                重新合成
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="well p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-ink-muted">
                              原目标卡片 ({prop.target_nodes.length} 张)
                            </span>
                            <button
                              onClick={() =>
                                setExpandedOriginals((prev) => ({ ...prev, [prop.id]: !showOrig }))
                              }
                              className="flex items-center gap-0.5 text-xs font-bold text-mind-700 hover:text-mind-600"
                            >
                              {showOrig ? (
                                <>
                                  收起原内容 <ChevronUp className="h-3.5 w-3.5" />
                                </>
                              ) : (
                                <>
                                  核实原卡片完整内容 <ChevronDown className="h-3.5 w-3.5" />
                                </>
                              )}
                            </button>
                          </div>
                          <div className="space-y-2">
                            {prop.target_nodes.map((tn) => (
                              <div key={tn.id} className="rounded-xl border border-line bg-surface p-2.5">
                                <div className="flex items-center justify-between gap-2 text-sm">
                                  <span className="font-bold text-ink">{tn.title}</span>
                                  <span className="chip chip-leaf shrink-0">
                                    权重 {Math.round(tn.conversion_weight * 100)}%
                                  </span>
                                </div>
                                <p className="mt-1 text-sm text-ink-muted">{tn.atomic_claim}</p>
                                <AnimatePresence initial={false}>
                                  {showOrig && tn.payload && (
                                    <motion.div key="orig" {...collapse} className="overflow-hidden">
                                      <div className="mt-2 space-y-1 border-t border-line pt-2 text-xs text-ink-soft">
                                        {Object.entries(tn.payload).map(([k, v]) => (
                                          <div key={k}>
                                            <span className="font-semibold text-ink-muted">{k}: </span>
                                            <span>{typeof v === 'string' ? v : JSON.stringify(v)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            ))}
                          </div>
                        </div>

                        {prop.proposed_node && (
                          <div className="rounded-2xl border border-leaf-100 bg-leaf-50 p-3">
                            <div className="mb-1 text-xs font-bold text-leaf-700">
                              合并后新卡片 ({prop.proposed_node.short_keyword}) ·{' '}
                              {prop.proposed_node.node_type === 'knowledge' ? '知识类' : '决策类'}
                            </div>
                            <div className="text-sm font-extrabold text-ink">{prop.proposed_node.title}</div>
                            <div className="mt-1.5 rounded-xl bg-surface p-2.5 text-sm text-ink-soft">
                              {prop.proposed_node.atomic_claim}
                            </div>
                            {prop.proposed_node.payload && (
                              <div className="mt-2 space-y-1 text-xs text-ink-soft">
                                {Object.entries(prop.proposed_node.payload).map(([k, v]) => (
                                  <div key={k}>
                                    <span className="font-semibold text-ink-muted">{k}: </span>
                                    <span>{typeof v === 'string' ? v : JSON.stringify(v)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
