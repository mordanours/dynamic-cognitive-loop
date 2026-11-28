import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { GraduationCap, History, Lightbulb, Loader2, Sparkles } from 'lucide-react';
import {
  api,
  CrystallizedNode,
  DifficultyLevel,
  SocraticChallenge,
  SocraticEvalResult,
  SocraticLog,
} from '../api';
import { IconBadge, Modal } from './ui/Modal';
import { rise, Segmented, stagger } from './ui/Living';

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
    <Modal
      open={open}
      onClose={onClose}
      maxWidth="sm:max-w-2xl"
      title="苏格拉底式陪练"
      icon={
        <IconBadge tone="mind">
          <GraduationCap className="h-5 w-5" />
        </IconBadge>
      }
      headerExtra={
        <Segmented
          group="socratic-tab"
          size="sm"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'drill', label: '当前陪练' },
            {
              value: 'history',
              label: (
                <>
                  <History className="h-3.5 w-3.5" />
                  历史复盘 ({historyLogs.length})
                </>
              ),
            },
          ]}
        />
      }
    >
      <div className="flex-1 space-y-4 overflow-y-auto p-5 text-sm">
        {/* Card & Difficulty Selector */}
        <div className="well grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
          <div>
            <label className="label">1. 自定义选择陪练卡片</label>
            <select
              value={selectedNodeId}
              onChange={(e) => {
                setSelectedNodeId(e.target.value);
                setChallenge(null);
                setEvalResult(null);
              }}
              className="input"
            >
              {availableNodes.map((n) => (
                <option key={n.id} value={n.id}>
                  [{n.node_type === 'knowledge' ? '知识' : '决策'}] {n.short_keyword || n.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">2. 选择挑战难度</label>
            <Segmented
              group="socratic-difficulty"
              value={difficulty}
              onChange={setDifficulty}
              className="flex w-full [&>button]:flex-1 [&>button]:justify-center"
              options={DIFFICULTIES.map((d) => ({
                value: d.val,
                label: <span title={d.desc}>{d.label}</span>,
                activeClass: '!bg-mind-50 ring-1 ring-mind-100',
              }))}
            />
          </div>
        </div>

        {tab === 'drill' ? (
          <>
            {!challenge && !loading && (
              <div className="flex justify-center py-6">
                <button onClick={handleGenerate} disabled={!selectedNodeId} className="btn btn-mind btn-press btn-lg">
                  <Sparkles className="h-4 w-4" />
                  生成 {DIFFICULTIES.find((d) => d.val === difficulty)?.label} 场景挑战
                </button>
              </div>
            )}

            {loading && (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
                <Loader2 className="h-4 w-4 animate-spin text-mind-600" />
                正在结合历史记录构造场景题...
              </div>
            )}

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="rounded-2xl border border-coral-100 bg-coral-50 p-3 text-sm text-coral-700"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {challenge && !loading && (
              <motion.div className="space-y-4" variants={stagger} initial="hidden" animate="show">
                <motion.div
                  variants={rise}
                  className="rounded-2xl border border-mind-100 bg-mind-50 p-4 text-base leading-relaxed text-ink"
                >
                  {challenge.scenario_question}
                </motion.div>

                <motion.div variants={rise}>
                  <button onClick={() => setShowHint(!showHint)} className="btn btn-ghost btn-sm !text-sun-700">
                    <Lightbulb className="h-4 w-4" />
                    {showHint ? '隐藏思考切入点' : '需要一点提示？'}
                  </button>
                  <AnimatePresence initial={false}>
                    {showHint && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-2 rounded-2xl border border-sun-100 bg-sun-50 px-3.5 py-2.5 text-sm text-sun-700">
                          {challenge.hint}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>

                {!evalResult ? (
                  <motion.div variants={rise} className="space-y-3">
                    <textarea
                      rows={4}
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      placeholder="写下你的判断与理由（系统将对比你的历史回答并动态优化卡片密集度）..."
                      className="input resize-y leading-relaxed"
                    />
                    <div className="flex justify-end gap-2">
                      <button onClick={handleGenerate} className="btn btn-outline btn-press">
                        换一题
                      </button>
                      <button
                        onClick={handleSubmit}
                        disabled={submitting || answer.trim().length < 2}
                        className="btn btn-mind btn-press"
                      >
                        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                        提交推演并动态更新卡片
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.94 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 20 }}
                    className="space-y-3 rounded-2xl border border-leaf-100 bg-leaf-50 p-4 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 font-bold text-leaf-700">
                      <span>综合评分：{evalResult.rating} / 4</span>
                      <span className="chip chip-leaf bg-surface">FSRS 下次复习：{evalResult.next_review_days} 天后</span>
                    </div>
                    <p className="leading-relaxed text-ink-soft">{evalResult.feedback}</p>
                    {evalResult.blind_spot_note && (
                      <div className="rounded-xl border border-sun-100 bg-sun-50 px-3 py-2 text-sun-700">
                        识别到盲区：{evalResult.blind_spot_note}
                      </div>
                    )}
                    {evalResult.card_evolution_note && (
                      <div className="rounded-xl border border-mind-100 bg-mind-50 px-3 py-2 text-mind-700">
                        卡片密集度演进：{evalResult.card_evolution_note}
                      </div>
                    )}
                    <div className="flex justify-end gap-2 pt-1">
                      <button onClick={() => setTab('history')} className="btn btn-outline btn-press btn-sm">
                        查看历史分区
                      </button>
                      <button onClick={onClose} className="btn btn-primary btn-press btn-sm">
                        完成
                      </button>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}
          </>
        ) : (
          /* History Tab: Saved Answers & AI Feedback Partition */
          <div className="space-y-3">
            {historyLogs.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-line-strong p-8 text-center text-sm text-ink-muted">
                该卡片暂无历史陪练记录。完成一次陪练后，你的回答与建议总结将永久保存于此。
              </div>
            ) : (
              <motion.div className="space-y-3" variants={stagger} initial="hidden" animate="show">
                {historyLogs.map((log) => (
                  <motion.div key={log.id} variants={rise} className="card space-y-2.5 p-4 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
                      <span className="flex items-center gap-1.5">
                        <span className="chip chip-muted">难度：{log.difficulty.toUpperCase()}</span>
                        <span className="chip chip-leaf">评分 {log.rating}/4</span>
                      </span>
                      <span>{log.created_at}</span>
                    </div>
                    <div className="rounded-xl bg-mind-50 p-3 text-ink">
                      <span className="font-bold text-mind-700">场景题：</span>
                      {log.question}
                    </div>
                    <div className="well p-3 text-ink-soft">
                      <span className="font-bold text-ink">我的回答：</span>
                      {log.user_answer}
                    </div>
                    <div className="rounded-xl bg-leaf-50 p-3 text-ink-soft">
                      <span className="font-bold text-leaf-700">AI 综合建议：</span>
                      {log.feedback}
                    </div>
                    {log.card_evolution_note && (
                      <div className="text-xs font-semibold text-clay-700">卡片演进：{log.card_evolution_note}</div>
                    )}
                  </motion.div>
                ))}
              </motion.div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
