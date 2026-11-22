import { useEffect, useState } from 'react';
import { GraduationCap, History, Lightbulb, Loader2, Sparkles, X } from 'lucide-react';
import {
  api,
  CrystallizedNode,
  DifficultyLevel,
  SocraticChallenge,
  SocraticEvalResult,
  SocraticLog,
} from '../api';

interface Props {
  initialNodeId: string | null;
  availableNodes: CrystallizedNode[];
  open: boolean;
  onClose: () => void;
  onCompleted: () => void;
}

const DIFFICULTIES: { val: DifficultyLevel; label: string; desc: string }[] = [
  { val: 'easy', label: '基础巩固', desc: '单一明确场景' },
  { val: 'medium', label: '实战两难', desc: '含干扰项与边界' },
  { val: 'hard', label: '极限推演', desc: '黑天鹅/跨界迁移' },
];

export function SocraticModal({ initialNodeId, availableNodes, open, onClose, onCompleted }: Props) {
  const [tab, setTab] = useState<'drill' | 'history'>('drill');
  const [selectedNodeId, setSelectedNodeId] = useState<string>('');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('medium');

  const [challenge, setChallenge] = useState<SocraticChallenge | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [answer, setAnswer] = useState('');
  const [evalResult, setEvalResult] = useState<SocraticEvalResult | null>(null);
  const [historyLogs, setHistoryLogs] = useState<SocraticLog[]>([]);

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTab('drill');
    setChallenge(null);
    setEvalResult(null);
    setAnswer('');
    setShowHint(false);
    setError(null);
    const targetId = initialNodeId || availableNodes[0]?.id || '';
    setSelectedNodeId(targetId);
    if (targetId) {
      api.getSocraticHistory(targetId).then(setHistoryLogs).catch(() => {});
    }
  }, [open, initialNodeId, availableNodes]);

  useEffect(() => {
    if (!open || !selectedNodeId) return;
    api.getSocraticHistory(selectedNodeId).then(setHistoryLogs).catch(() => {});
  }, [open, selectedNodeId]);

  if (!open) return null;

  const handleGenerate = async () => {
    if (!selectedNodeId) return;
    setChallenge(null);
    setEvalResult(null);
    setAnswer('');
    setShowHint(false);
    setError(null);
    setLoading(true);
    try {
      const ch = await api.generateSocraticChallenge(selectedNodeId, difficulty);
      setChallenge(ch);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!challenge || answer.trim().length < 2) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.evaluateSocraticAnswer(
        challenge.node_id,
        challenge.scenario_question,
        answer.trim(),
        difficulty,
      );
      setEvalResult(res);
      const updatedLogs = await api.getSocraticHistory(challenge.node_id);
      setHistoryLogs(updatedLogs);
      onCompleted();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
        {/* Header & Tabs */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-cyan-400" />
            <h2 className="text-base font-semibold text-white">苏格拉底式陪练</h2>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-xl border border-slate-800 bg-slate-950 p-0.5 text-xs">
              <button
                onClick={() => setTab('drill')}
                className={`rounded-lg px-3 py-1 font-medium ${
                  tab === 'drill' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                当前陪练
              </button>
              <button
                onClick={() => setTab('history')}
                className={`flex items-center gap-1 rounded-lg px-3 py-1 font-medium ${
                  tab === 'history' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <History className="h-3 w-3" />
                历史复盘 ({historyLogs.length})
              </button>
            </div>
            <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {/* Card & Difficulty Selector */}
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] text-slate-400">1. 自定义选择陪练卡片</label>
              <select
                value={selectedNodeId}
                onChange={(e) => {
                  setSelectedNodeId(e.target.value);
                  setChallenge(null);
                  setEvalResult(null);
                }}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100"
              >
                {availableNodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    [{n.node_type === 'knowledge' ? '知识' : '决策'}] {n.short_keyword || n.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] text-slate-400">2. 选择挑战难度</label>
              <div className="flex gap-1.5">
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d.val}
                    onClick={() => setDifficulty(d.val)}
                    title={d.desc}
                    className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-medium transition ${
                      difficulty === d.val
                        ? 'border-cyan-500 bg-cyan-500/20 text-cyan-200'
                        : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-white'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {tab === 'drill' ? (
            <>
              {!challenge && !loading && (
                <div className="flex justify-center py-4">
                  <button
                    onClick={handleGenerate}
                    disabled={!selectedNodeId}
                    className="flex items-center gap-2 rounded-xl bg-cyan-600 px-5 py-2.5 text-xs font-medium text-white hover:bg-cyan-500 disabled:opacity-50"
                  >
                    <Sparkles className="h-4 w-4" />
                    生成 {DIFFICULTIES.find((d) => d.val === difficulty)?.label} 场景挑战
                  </button>
                </div>
              )}

              {loading && (
                <div className="flex items-center justify-center gap-2 py-10 text-xs text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
                  正在结合历史记录构造场景题...
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
                  {error}
                </div>
              )}

              {challenge && !loading && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-cyan-500/20 bg-slate-950 p-4 text-sm leading-relaxed text-slate-100">
                    {challenge.scenario_question}
                  </div>

                  <div>
                    <button
                      onClick={() => setShowHint(!showHint)}
                      className="flex items-center gap-1 text-xs text-amber-300 hover:text-amber-200"
                    >
                      <Lightbulb className="h-3.5 w-3.5" />
                      {showHint ? '隐藏思考切入点' : '需要一点提示？'}
                    </button>
                    {showHint && (
                      <div className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                        {challenge.hint}
                      </div>
                    )}
                  </div>

                  {!evalResult ? (
                    <>
                      <textarea
                        rows={4}
                        value={answer}
                        onChange={(e) => setAnswer(e.target.value)}
                        placeholder="写下你的判断与理由（系统将对比你的历史回答并动态优化卡片密集度）..."
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-xs text-slate-100 outline-none focus:border-cyan-500"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={handleGenerate}
                          className="rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
                        >
                          换一题
                        </button>
                        <button
                          onClick={handleSubmit}
                          disabled={submitting || answer.trim().length < 2}
                          className="flex items-center gap-1.5 rounded-xl bg-cyan-600 px-4 py-2 text-xs font-medium text-white hover:bg-cyan-500 disabled:opacity-50"
                        >
                          {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          提交推演并动态更新卡片
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs">
                      <div className="flex items-center justify-between font-semibold text-emerald-300">
                        <span>综合评分：{evalResult.rating} / 4</span>
                        <span>FSRS 下次复习：{evalResult.next_review_days} 天后</span>
                      </div>
                      <p className="leading-relaxed text-slate-200">{evalResult.feedback}</p>
                      {evalResult.blind_spot_note && (
                        <div className="rounded-lg bg-amber-500/15 px-2.5 py-1.5 text-amber-200">
                          识别到盲区：{evalResult.blind_spot_note}
                        </div>
                      )}
                      {evalResult.card_evolution_note && (
                        <div className="rounded-lg bg-indigo-500/20 px-2.5 py-1.5 text-indigo-200">
                          卡片密集度演进：{evalResult.card_evolution_note}
                        </div>
                      )}
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setTab('history')}
                          className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-200 hover:bg-slate-800"
                        >
                          查看历史分区
                        </button>
                        <button onClick={onClose} className="rounded-lg bg-slate-800 px-4 py-1.5 text-white hover:bg-slate-700">
                          完成
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            /* History Tab: Saved Answers & AI Feedback Partition */
            <div className="space-y-3">
              {historyLogs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-xs text-slate-500">
                  该卡片暂无历史陪练记录。完成一次陪练后，你的回答与建议总结将永久保存于此。
                </div>
              ) : (
                historyLogs.map((log) => (
                  <div key={log.id} className="space-y-2 rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>
                        难度：{log.difficulty.toUpperCase()} · 评分 <b className="text-emerald-400">{log.rating}/4</b>
                      </span>
                      <span>{log.created_at}</span>
                    </div>
                    <div className="rounded-lg bg-slate-900 p-2.5 text-slate-200">
                      <span className="font-semibold text-cyan-300">场景题：</span>
                      {log.question}
                    </div>
                    <div className="rounded-lg bg-slate-900/70 p-2.5 text-slate-300">
                      <span className="font-semibold text-indigo-300">我的回答：</span>
                      {log.user_answer}
                    </div>
                    <div className="rounded-lg bg-emerald-500/10 p-2.5 text-emerald-100">
                      <span className="font-semibold text-emerald-300">AI 综合建议：</span>
                      {log.feedback}
                    </div>
                    {log.card_evolution_note && (
                      <div className="text-[11px] text-violet-300">
                        卡片演进：{log.card_evolution_note}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
