import { motion } from 'motion/react';
import {
  Activity,
  BookOpen,
  ChevronDown,
  Compass,
  FolderInput,
  GraduationCap,
  Loader2,
  ShieldCheck,
  Target,
  Zap,
} from 'lucide-react';
import { ActionExperiment, CrystallizedNode } from '../api';
import { AuthImage } from './AuthImage';
import { RichMarkdown } from './RichMarkdown';

/* ------------------------------------------------------------------ */
/* Meter: a small rounded bar that "grows"                             */
/* ------------------------------------------------------------------ */
export function Meter({
  value,
  tone = 'leaf',
  label,
}: {
  value: number;
  tone?: 'leaf' | 'mind' | 'sun';
  label: string;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const fill = tone === 'mind' ? 'bg-mind-500' : tone === 'sun' ? 'bg-sun-500' : 'bg-leaf-500';
  return (
    <div className="flex min-w-0 items-center gap-2" title={`${label} ${pct}%`}>
      <span className="shrink-0 text-xs font-semibold text-ink-muted">{label}</span>
      <div className="h-2 w-16 overflow-hidden rounded-full bg-paper-3">
        <motion.div
          className={`h-full rounded-full ${fill}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 90, damping: 18 }}
        />
      </div>
      <span className="text-xs font-extrabold text-ink tabular-nums">{pct}%</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* If-Then block                                                       */
/* ------------------------------------------------------------------ */
export function IfThen({ trigger, metric, compact = false }: { trigger: string; metric: string; compact?: boolean }) {
  return (
    <div className={`space-y-1.5 rounded-2xl bg-paper-2 ${compact ? 'p-2.5' : 'p-3'} text-sm text-ink-soft`}>
      <div className="flex gap-2">
        <span className="chip chip-sun h-fit shrink-0 !px-2 !py-0">
          <Zap className="h-3 w-3" />
          If
        </span>
        <span className="min-w-0">{trigger}</span>
      </div>
      <div className="flex gap-2">
        <span className="chip chip-leaf h-fit shrink-0 !px-2 !py-0">
          <Target className="h-3 w-3" />
          标准
        </span>
        <span className="min-w-0">{metric}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Action card (micro experiment)                                      */
/* ------------------------------------------------------------------ */
export function ActionCard({
  act,
  onAudit,
  variant = 'side',
}: {
  act: ActionExperiment;
  onAudit: () => void;
  variant?: 'side' | 'hero';
}) {
  const hero = variant === 'hero';
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className={`card relative overflow-hidden ${hero ? 'p-6 sm:p-7' : 'p-4'}`}
    >
      <div className="absolute inset-y-0 left-0 w-1.5 bg-leaf-400" aria-hidden />
      {act.node_title && <div className="mb-1 text-xs font-semibold text-ink-muted">来自：{act.node_title}</div>}
      <div className={`${hero ? 'text-lg sm:text-xl' : 'text-[15px]'} leading-snug font-extrabold text-ink`}>
        {act.micro_action}
      </div>
      {act.theoretical_basis && (
        <div className="mt-2.5 rounded-xl border border-mind-100 bg-mind-50 px-3 py-2 text-sm text-mind-700">
          <b>理论依据：</b>
          {act.theoretical_basis}
        </div>
      )}
      <div className="mt-2.5">
        <IfThen trigger={act.trigger_condition} metric={act.success_metric} compact={!hero} />
      </div>
      <button onClick={onAudit} className={`btn btn-primary btn-press mt-4 w-full ${hero ? 'btn-lg' : ''}`}>
        <ShieldCheck className="h-4 w-4" />
        {hero ? '完成并提交 1 分钟审计' : '提交真实反馈'}
      </button>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Crystallized node card                                              */
/* ------------------------------------------------------------------ */
export function NodeCard({
  node,
  expanded,
  fresh,
  busy,
  disabled,
  folderPaths,
  currentRelPath,
  onToggleExpand,
  onMove,
  onVerify,
  onSocratic,
  onPropose,
}: {
  node: CrystallizedNode;
  expanded: boolean;
  fresh: boolean;
  busy: boolean;
  disabled: boolean;
  folderPaths: string[];
  currentRelPath: string;
  onToggleExpand: () => void;
  onMove: (path: string) => void;
  onVerify: () => void;
  onSocratic: () => void;
  onPropose: () => void;
}) {
  const isKnowledge = node.node_type === 'knowledge';
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
      transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      className={`card relative overflow-hidden p-4 transition-shadow hover:shadow-lift sm:p-5 ${
        fresh ? 'ring-4 ring-leaf-200' : ''
      }`}
    >
      {/* crystallize flash for freshly distilled cards */}
      {fresh && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-leaf-100 via-sun-50 to-transparent"
          initial={{ opacity: 0.9 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 2.2, ease: 'easeOut' }}
        />
      )}
      <div className="relative">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <span className={`chip ${isKnowledge ? 'chip-mind' : 'chip-leaf'}`}>
            {isKnowledge ? <BookOpen className="h-3.5 w-3.5" /> : <Compass className="h-3.5 w-3.5" />}
            {isKnowledge ? '知识类' : '决策类'} · v{node.schema_version}
          </span>
          <Meter value={node.conversion_weight} label="效用" tone={isKnowledge ? 'mind' : 'leaf'} />
        </div>

        {node.short_keyword && node.short_keyword !== node.title && (
          <div className={`text-sm font-bold ${isKnowledge ? 'text-mind-700' : 'text-leaf-700'}`}>
            {node.short_keyword}
          </div>
        )}
        <h3 className="mt-0.5 text-base leading-snug font-extrabold text-ink sm:text-[17px]">{node.title}</h3>

        {node.needs_verification === 1 && (
          <div className="mt-2.5 flex items-center justify-between gap-2 rounded-xl border border-sun-100 bg-sun-50 px-3 py-1.5 text-sm text-sun-700">
            <span>v{node.schema_version} 迁移字段待核实</span>
            <button onClick={onVerify} className="btn btn-sun btn-press btn-sm">
              确认已核实
            </button>
          </div>
        )}

        <div className="mt-3 rounded-2xl bg-paper-2 px-3.5 py-2.5">
          <RichMarkdown content={node.atomic_claim} />
        </div>

        {(node.rich_blocks || []).map((rb, idx) => (
          <div key={idx} className="mt-3 rounded-2xl border border-line bg-surface p-3">
            <div className="mb-1 text-sm font-extrabold text-clay-700">{rb.title}</div>
            <RichMarkdown content={rb.markdown} />
          </div>
        ))}

        {(node.attachments || []).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {node.attachments?.map((att) => (
              <AuthImage key={att.id} fileId={att.id} filename={att.filename} isImage={att.is_image} />
            ))}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <button onClick={onToggleExpand} className="btn btn-ghost btn-sm !px-2">
            <motion.span animate={{ rotate: expanded ? 180 : 0 }} className="inline-flex">
              <ChevronDown className="h-4 w-4" />
            </motion.span>
            {expanded ? '收起结构化字段' : '展开结构化字段'}
          </button>
          <label className="flex items-center gap-1.5 text-xs text-ink-muted">
            <FolderInput className="h-3.5 w-3.5 text-clay-600" />
            <select
              value={currentRelPath}
              onChange={(e) => onMove(e.target.value)}
              className="rounded-lg border border-line bg-surface px-2 py-1 text-xs font-semibold text-ink-soft outline-none focus:border-leaf-400"
            >
              {folderPaths.map((p) => (
                <option key={p} value={p}>
                  /{p}
                </option>
              ))}
            </select>
          </label>
        </div>

        <motion.div
          initial={false}
          animate={{ height: expanded ? 'auto' : 0, opacity: expanded ? 1 : 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
        >
          <div className="mt-2.5 space-y-2.5 rounded-2xl border border-line bg-paper p-3.5">
            {Object.entries(node.payload).map(([k, v]) => (
              <div key={k}>
                <div className="eyebrow mb-0.5">{k}</div>
                <RichMarkdown content={typeof v === 'string' ? v : JSON.stringify(v, null, 2)} />
              </div>
            ))}
          </div>
        </motion.div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3.5">
          <Meter value={node.confidence} label="可信度" tone="sun" />
          <div className="flex items-center gap-2">
            <button onClick={onSocratic} className="btn btn-soft-mind btn-sm">
              <GraduationCap className="h-4 w-4" />
              陪练
            </button>
            <button onClick={onPropose} disabled={disabled} className="btn btn-primary btn-press btn-sm">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
              {isKnowledge ? '理解检验' : '生成微行动'}
            </button>
          </div>
        </div>
      </div>
    </motion.article>
  );
}
