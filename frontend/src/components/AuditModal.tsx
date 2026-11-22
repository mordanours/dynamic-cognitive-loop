import { useState } from 'react';
import { X } from 'lucide-react';
import { ActionExperiment, api } from '../api';

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

  if (!action) return null;

  const handleSubmit = async () => {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">知行审计：提交真实反馈</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 rounded-xl bg-slate-950 p-3 text-xs text-slate-300">
          <div className="font-medium text-indigo-300">微行动：{action.micro_action}</div>
          <div className="mt-1 text-slate-400">触发条件：{action.trigger_condition}</div>
        </div>

        <div className="space-y-4 text-sm">
          <div className="flex gap-2">
            <button
              onClick={() => setExecuted(true)}
              className={`flex-1 rounded-xl border py-2 text-xs font-medium ${
                executed
                  ? 'border-emerald-500 bg-emerald-500/20 text-emerald-200'
                  : 'border-slate-800 bg-slate-950 text-slate-400'
              }`}
            >
              已实际执行
            </button>
            <button
              onClick={() => setExecuted(false)}
              className={`flex-1 rounded-xl border py-2 text-xs font-medium ${
                !executed
                  ? 'border-amber-500 bg-amber-500/20 text-amber-200'
                  : 'border-slate-800 bg-slate-950 text-slate-400'
              }`}
            >
              未执行 / 放弃
            </button>
          </div>

          {executed && (
            <div>
              <label className="mb-1.5 block text-xs text-slate-400">现实结果打分（将校准结晶权重）</label>
              <div className="flex flex-wrap gap-1.5">
                {SCORES.map((s) => (
                  <button
                    key={s.val}
                    onClick={() => setScore(s.val)}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs ${
                      score === s.val
                        ? 'border-indigo-500 bg-indigo-500/20 text-indigo-200'
                        : 'border-slate-800 bg-slate-950 text-slate-400'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs text-slate-400">阻力标签</label>
            <select
              value={friction}
              onChange={(e) => setFriction(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100"
            >
              {FRICTIONS.map((f) => (
                <option key={f.val} value={f.val}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-slate-400">一句话复盘（可选）</label>
            <textarea
              rows={2}
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              placeholder="实际发生了什么？这个认知边界准确吗？"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-xs text-slate-400 hover:bg-slate-800">
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {submitting ? '校准中...' : '提交并回写权重'}
          </button>
        </div>
      </div>
    </div>
  );
}
