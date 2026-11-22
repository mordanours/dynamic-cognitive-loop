import { useEffect, useState } from 'react';
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
    <div className="rounded-2xl border border-violet-500/25 bg-slate-900/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <GitMerge className="h-4 w-4 text-violet-400" />
          <h3 className="text-xs font-semibold text-white">数据结构架构师</h3>
          {schemaStatus && (
            <span className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-0.5 text-[11px] text-slate-300">
              当前结构：v{schemaStatus.current_version} (L{schemaStatus.current_tier}) · 已验证行动{' '}
              <b className="text-emerald-400">
                {schemaStatus.actions_verified}/{schemaStatus.recommended_threshold}
              </b>
            </span>
          )}
          {proposals.length > 0 && (
            <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-bold text-violet-300">
              {proposals.length} 条待审批
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {schemaStatus && (
            <button
              onClick={() => setEvoBuilderOpen((v) => !v)}
              disabled={evolving || scanning}
              className="flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-500/25 disabled:opacity-50"
            >
              <ArrowUpCircle className="h-3.5 w-3.5" />
              自定义 v{schemaStatus.current_version} → v{schemaStatus.next_version} 演进
            </button>
          )}
          <button
            onClick={handleScan}
            disabled={scanning || evolving}
            className="flex items-center gap-1.5 rounded-xl bg-violet-600/25 px-3 py-1.5 text-xs font-medium text-violet-200 hover:bg-violet-600/40 disabled:opacity-50"
          >
            {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            扫描重复与低效卡片
          </button>
        </div>
      </div>

      {/* Custom Schema Evolution Builder */}
      {evoBuilderOpen && schemaStatus && (
        <div className="mt-3 space-y-3 rounded-xl border border-amber-500/30 bg-slate-950 p-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-semibold text-amber-300">
                自定义 v{schemaStatus.current_version} → v{schemaStatus.next_version} 演进结构
              </span>
              <span className="ml-2 text-[11px] text-slate-400">
                将自动融合本领域 {schemaStatus.socratic_logs_count} 条苏格拉底陪练回答与审计复盘
              </span>
            </div>
            <button
              onClick={() =>
                setCustomFields((prev) => [...prev, { key: `custom_${prev.length + 1}`, title: '新维度' }])
              }
              className="flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1 text-[11px] text-slate-200 hover:bg-slate-800"
            >
              <Plus className="h-3 w-3" />
              添加字段
            </button>
          </div>

          {/* Preset Hints */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-500">可选提示字段：</span>
            {PRESET_FIELD_HINTS.map((hint) => (
              <button
                key={hint.key}
                onClick={() => {
                  if (!customFields.some((f) => f.key === hint.key)) {
                    setCustomFields((prev) => [...prev, hint]);
                  }
                }}
                className="rounded-md border border-slate-800 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-300 hover:border-amber-500/40 hover:text-amber-200"
              >
                + {hint.title}
              </button>
            ))}
          </div>

          {/* Editable Fields */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {customFields.map((fld, idx) => (
              <div key={idx} className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/70 p-2">
                <input
                  value={fld.key}
                  onChange={(e) =>
                    setCustomFields((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, key: e.target.value } : item)),
                    )
                  }
                  placeholder="字段key"
                  className="w-28 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-200"
                />
                <input
                  value={fld.title}
                  onChange={(e) =>
                    setCustomFields((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, title: e.target.value } : item)),
                    )
                  }
                  placeholder="中文标题"
                  className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-100"
                />
                <button
                  onClick={() => setCustomFields((prev) => prev.filter((_, i) => i !== idx))}
                  className="p-1 text-slate-500 hover:text-rose-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <input
            value={evolutionGoal}
            onChange={(e) => setEvolutionGoal(e.target.value)}
            placeholder="演进融合目标（可选，例如：结合陪练中的盲区回答，提炼更贴合实战的防错与反例）..."
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none focus:border-amber-500"
          />

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setEvoBuilderOpen(false)}
              className="rounded-lg px-3 py-1.5 text-slate-400 hover:text-white"
            >
              取消
            </button>
            <button
              onClick={handlePreviewEvolution}
              disabled={evolving}
              className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-1.5 font-medium text-white hover:bg-amber-500 disabled:opacity-50"
            >
              {evolving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              融合陪练记录并生成演进 Diff
            </button>
          </div>
        </div>
      )}

      {proposals.length > 0 && (
        <div className="mt-3 space-y-3">
          {proposals.map((prop) => {
            const isSchemaEvo = prop.proposal_type === 'evolve_schema';
            const showOrig = !!expandedOriginals[prop.id];
            return (
              <div key={prop.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className={`font-semibold ${isSchemaEvo ? 'text-amber-300' : 'text-violet-300'}`}>
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
                      className="flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1 text-slate-400 hover:text-white"
                    >
                      <X className="h-3 w-3" />
                      驳回
                    </button>
                    {prop.proposal_type === 'merge_duplicates' && (
                      <button
                        onClick={() => setRefineOpenId(refineOpenId === prop.id ? null : prop.id)}
                        disabled={busyId !== null}
                        className="flex items-center gap-1 rounded-lg border border-indigo-500/40 bg-indigo-500/15 px-2.5 py-1 text-indigo-300 hover:bg-indigo-500/25"
                      >
                        <MessageSquarePlus className="h-3 w-3" />
                        提建议修订
                      </button>
                    )}
                    <button
                      onClick={() => handleApprove(prop.id, isSchemaEvo)}
                      disabled={busyId !== null}
                      className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 font-medium text-white hover:bg-emerald-500"
                    >
                      <Check className="h-3 w-3" />
                      {isSchemaEvo ? '批准升级并迁移卡片' : '批准执行'}
                    </button>
                  </div>
                </div>

                <p className="mb-3 text-slate-400">理由：{prop.rationale}</p>

                {/* Schema Evolution Side-by-Side Diff */}
                {isSchemaEvo && prop.proposed_node ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                        <div className="mb-1 text-[11px] font-medium text-slate-400">
                          旧结构 v{prop.proposed_node.from_version} 字段
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(prop.proposed_node.from_schema?.properties || {}).map(([k, v]) => (
                            <span key={k} className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
                              {k} ({v.title || k})
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5">
                        <div className="mb-1 text-[11px] font-medium text-amber-300">
                          新结构 v{prop.proposed_node.to_version} 字段 (升级后)
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(prop.proposed_node.to_schema?.properties || {}).map(([k, v]) => (
                            <span key={k} className="rounded bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-200">
                              + {k} ({v.title || k})
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {(prop.proposed_node.migrated_nodes || []).length > 0 && (
                      <div className="space-y-2">
                        <div className="text-[11px] font-medium text-slate-400">
                          待无损迁移卡片预览 ({prop.proposed_node.migrated_nodes?.length} 张)：
                        </div>
                        {prop.proposed_node.migrated_nodes?.map((mn) => (
                          <div key={mn.node_id} className="rounded-lg border border-slate-800 bg-slate-900/40 p-2.5">
                            <div className="mb-2 font-semibold text-white">{mn.title}</div>
                            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 text-[11px]">
                              <div className="rounded bg-slate-950 p-2 text-slate-400">
                                <div className="mb-1 font-medium text-slate-500">v1 原载荷</div>
                                {Object.entries(mn.old_payload).map(([k, v]) => (
                                  <div key={k}>
                                    <b>{k}:</b> {typeof v === 'string' ? v : JSON.stringify(v)}
                                  </div>
                                ))}
                              </div>
                              <div className="rounded border border-emerald-500/20 bg-emerald-500/5 p-2 text-slate-200">
                                <div className="mb-1 font-medium text-emerald-300">v2 演进载荷</div>
                                {Object.entries(mn.new_payload).map(([k, v]) => (
                                  <div key={k}>
                                    <b className="text-emerald-200">{k}:</b>{' '}
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
                    {refineOpenId === prop.id && (
                      <div className="mb-3 flex gap-2 rounded-xl border border-indigo-500/30 bg-slate-900 p-2.5">
                        <input
                          value={suggestion}
                          onChange={(e) => setSuggestion(e.target.value)}
                          placeholder="输入你的直觉或修改意见..."
                          className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-indigo-500"
                        />
                        <button
                          onClick={() => handleRefine(prop.id)}
                          disabled={busyId !== null || suggestion.trim().length < 2}
                          className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                        >
                          {busyId === prop.id && <Loader2 className="h-3 w-3 animate-spin" />}
                          重新合成
                        </button>
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-[11px] font-medium text-slate-400">
                            原目标卡片 ({prop.target_nodes.length} 张)
                          </span>
                          <button
                            onClick={() =>
                              setExpandedOriginals((prev) => ({ ...prev, [prop.id]: !showOrig }))
                            }
                            className="flex items-center gap-0.5 text-[11px] text-indigo-400 hover:text-indigo-300"
                          >
                            {showOrig ? (
                              <>
                                收起原内容 <ChevronUp className="h-3 w-3" />
                              </>
                            ) : (
                              <>
                                核实原卡片完整内容 <ChevronDown className="h-3 w-3" />
                              </>
                            )}
                          </button>
                        </div>
                        <div className="space-y-2.5">
                          {prop.target_nodes.map((tn) => (
                            <div key={tn.id} className="rounded-lg border border-slate-800/80 bg-slate-950/70 p-2.5">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-semibold text-slate-200">{tn.title}</span>
                                <span className="text-emerald-400">权重 {Math.round(tn.conversion_weight * 100)}%</span>
                              </div>
                              <p className="mt-1 text-[11px] text-slate-400">{tn.atomic_claim}</p>
                              {showOrig && tn.payload && (
                                <div className="mt-2 space-y-1 border-t border-slate-800 pt-1.5 text-[11px] text-slate-400">
                                  {Object.entries(tn.payload).map(([k, v]) => (
                                    <div key={k}>
                                      <span className="text-slate-500">{k}: </span>
                                      <span>{typeof v === 'string' ? v : JSON.stringify(v)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {prop.proposed_node && (
                        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3">
                          <div className="mb-1 text-[11px] font-medium text-emerald-300">
                            合并后新卡片 ({prop.proposed_node.short_keyword}) ·{' '}
                            {prop.proposed_node.node_type === 'knowledge' ? '知识类' : '决策类'}
                          </div>
                          <div className="text-xs font-semibold text-white">{prop.proposed_node.title}</div>
                          <div className="mt-1.5 rounded bg-slate-950/60 p-2 text-[11px] text-slate-300">
                            {prop.proposed_node.atomic_claim}
                          </div>
                          {prop.proposed_node.payload && (
                            <div className="mt-2 space-y-1 text-[11px] text-slate-300">
                              {Object.entries(prop.proposed_node.payload).map(([k, v]) => (
                                <div key={k}>
                                  <span className="text-slate-400">{k}: </span>
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
