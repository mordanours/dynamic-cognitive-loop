import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, ClipboardCheck, Zap } from 'lucide-react';
import { ActionExperiment, api } from '../api';
import { IconBadge, Modal } from './ui/Modal';
import { Segmented } from './ui/Living';

interface Props {
  action: ActionExperiment | null;
  onClose: () => void;
  onSubmitted: () => void;
}

const SCORES = [
  { val: 2, label: '+2 显著有效' },
  { val: 1, label: '+1 有帮助' },
  { val: 0, label: '0 无感' },
  { val: -1, label: '-1 无效' },
  { val: -2, label: '-2 证实有害' },
];

const SCORE_TONE: Record<number, string> = {
  2: 'border-leaf-300 bg-leaf-50 text-leaf-700',
  1: 'border-leaf-200 bg-leaf-50 text-leaf-700',
  0: 'border-line-strong bg-paper-2 text-ink',
  [-1]: 'border-sun-200 bg-sun-50 text-sun-700',
  [-2]: 'border-coral-100 bg-coral-50 text-coral-700',
};

const FRICTIONS = [
  { val: 'none', label: '无阻力' },
  { val: 'forgot', label: '忘记触发' },
  { val: 'too_complex', label: '步骤太复杂' },
  { val: 'context_mismatch', label: '场景不匹配' },
  { val: 'hypothesis_wrong', label: '认知假设有误' },
];

export function AuditModal({ action, onClose, onSubmitted }: Props) {
  const [executed, setExecuted] = useState(true);
  const [score, setScore] = useState(1);
  const [friction, setFriction] = useState('none');
  const [reflection, setReflection] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Keep the last action rendered so the exit animation has content.
  const [shown, setShown] = useState<ActionExperiment | null>(action);
  if (action && action !== shown) setShown(action);
  const view = action ?? shown;

  const handleSubmit = async () => {
    if (!action) return;
    setSubmitting(true);
    try {
      await api.auditAction(action.id, {
        executed,
        outcome_score: executed ? score : 0,
        friction_tag: friction,
        user_reflection: reflection,
      });
      onSubmitted();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={!!action}
      onClose={onClose}
      maxWidth="sm:max-w-md"
      title="知行审计：提交真实反馈"
      icon={
        <IconBadge tone="leaf">
          <ClipboardCheck className="h-5 w-5" />
        </IconBadge>
      }
    >
      {view && (
        <>
          <div className="flex-1 space-y-5 overflow-y-auto p-5 text-sm">
            <div className="well space-y-1.5 p-4">
              <div className="flex items-start gap-2 font-bold text-ink">
                <Zap className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" />
                <span>微行动：{view.micro_action}</span>
              </div>
              <div className="pl-6 text-ink-muted">
                <span className="chip chip-sun mr-1.5">If</span>
                触发条件：{view.trigger_condition}
              </div>
            </div>

            <Segmented
              group="audit-executed"
              value={executed ? 'yes' : 'no'}
              onChange={(v) => setExecuted(v === 'yes')}
              className="flex w-full [&>button]:flex-1 [&>button]:justify-center [&>button]:!py-2"
              options={[
                {
                  value: 'yes',
                  label: (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-leaf-600" />
                      已实际执行
                    </>
                  ),
                  activeClass: '!bg-leaf-50 ring-1 ring-leaf-200',
                },
                {
                  value: 'no',
                  label: '未执行 / 放弃',
                  activeClass: '!bg-sun-50 ring-1 ring-sun-200',
                },
              ]}
            />

            <AnimatePresence initial={false}>
              {executed && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <label className="label">现实结果打分（将校准结晶权重）</label>
                  <div className="flex flex-wrap gap-2">
                    {SCORES.map((s) => {
                      const active = score === s.val;
                      return (
                        <motion.button
                          key={s.val}
                          onClick={() => setScore(s.val)}
                          whileTap={{ scale: 0.94 }}
                          animate={active ? { scale: [1, 1.06, 1] } : { scale: 1 }}
                          transition={{ duration: 0.25 }}
                          className={`rounded-xl border-2 px-3 py-1.5 text-sm font-bold transition-colors ${
                            active
                              ? SCORE_TONE[s.val]
                              : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink'
                          }`}
                        >
                          {s.label}
                        </motion.button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div>
              <label className="label">阻力标签</label>
              <select value={friction} onChange={(e) => setFriction(e.target.value)} className="input">
                {FRICTIONS.map((f) => (
                  <option key={f.val} value={f.val}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">一句话复盘（可选）</label>
              <textarea
                rows={2}
                value={reflection}
                onChange={(e) => setReflection(e.target.value)}
                placeholder="实际发生了什么？这个认知边界准确吗？"
                className="input resize-y"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
            <button onClick={onClose} className="btn btn-ghost">
              取消
            </button>
            <button onClick={handleSubmit} disabled={submitting} className="btn btn-primary btn-press">
              {submitting ? '校准中...' : '提交并回写权重'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
