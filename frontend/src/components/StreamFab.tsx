import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { FileUp, Hourglass, Loader2, Paperclip, Play, Plus, Sparkles, Sprout, Trash2 } from 'lucide-react';
import { api, DomainSlug, StreamItem, UserDomain } from '../api';
import { IconBadge, Modal } from './ui/Modal';
import { rise, stagger } from './ui/Living';

interface Props {
  domains: UserDomain[];
  streams: StreamItem[];
  hideFab?: boolean;
  externalOpen?: boolean;
  onExternalClose?: () => void;
  onDistilled: (msg: string) => void;
  onError: (msg: string) => void;
  onRefresh: () => Promise<void>;
}

export function StreamFab({
  domains,
  streams,
  hideFab = false,
  externalOpen = false,
  onExternalClose,
  onDistilled,
  onError,
  onRefresh,
}: Props) {
  const [open, setOpen] = useState(false);
  const [rawInput, setRawInput] = useState('');
  const [domainHint, setDomainHint] = useState<DomainSlug>(domains[0]?.slug || 'investing');
  const [attachments, setAttachments] = useState<{ id: string; filename: string; isImage: boolean }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ripple, setRipple] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (domains.length > 0 && !domains.some((d) => d.slug === domainHint)) {
      setDomainHint(domains[0].slug);
    }
  }, [domains, domainHint]);

  const isOpen = open || externalOpen;
  const closeModal = () => {
    setOpen(false);
    onExternalClose?.();
  };

  const inboxItems = streams.filter((s) => s.status === 'inbox');
  const domainName = (slug: string) => domains.find((d) => d.slug === slug)?.name || slug;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await api.uploadFile(file);
      setAttachments((prev) => [...prev, { id: res.file_id, filename: res.filename, isImage: res.is_image }]);
      if (res.extracted_text) {
        setRawInput((prev) =>
          prev ? `${prev}\n\n[附件: ${res.filename}]\n${res.extracted_text}` : `[附件: ${res.filename}]\n${res.extracted_text}`,
        );
      } else if (res.is_image) {
        setRawInput((prev) =>
          prev || `[已附加图片: ${res.filename}]（可在模型设置中开启视觉模型自动识图，或直接补充几句文字说明）`,
        );
      }
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveStream = async () => {
    if (rawInput.trim().length < 2) {
      onError('请先输入内容或上传文档/图片');
      return;
    }
    setBusyId('save');
    try {
      await api.createStream(
        rawInput.trim(),
        domainHint,
        attachments.map((a) => a.id),
      );
      setRawInput('');
      setAttachments([]);
      await onRefresh();
      onDistilled('已暂存至交互流收件箱 (7天 TTL)');
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveAndDistill = async () => {
    if (rawInput.trim().length < 2) {
      onError('请先输入内容或上传文档/图片');
      return;
    }
    setBusyId('distill_new');
    try {
      const created = await api.createStream(
        rawInput.trim(),
        domainHint,
        attachments.map((a) => a.id),
      );
      const res = await api.distillStream(created.id, domainHint);
      setRawInput('');
      setAttachments([]);
      await onRefresh();
      closeModal();
      onDistilled(
        `降维完成！提取 ${res.nodes.length} 条原子认知（压缩比 ${res.compression_ratio}:1）。已丢弃噪声：${res.discarded_noise_summary}`,
      );
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const handleDistillExisting = async (item: StreamItem) => {
    setBusyId(item.id);
    try {
      const res = await api.distillStream(item.id, item.domain_hint);
      await onRefresh();
      closeModal();
      onDistilled(`降维完成！提取 ${res.nodes.length} 条原子认知（压缩比 ${res.compression_ratio}:1）。`);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  /** Freshness of a raw stream within its 7-day TTL: 1 = new, 0 = about to wither. */
  const freshness = (item: StreamItem) => {
    const created = Date.parse(item.created_at || '');
    if (!Number.isFinite(created)) return 1;
    const days = (Date.now() - created) / 86_400_000;
    return Math.max(0, Math.min(1, 1 - days / 7));
  };

  const distilling = busyId === 'distill_new';

  return (
    <>
      {!hideFab && (
        <div className="fixed right-6 bottom-6 z-40">
          {/* breathing halo */}
          {!reduce && (
            <motion.span
              aria-hidden
              className="absolute inset-0 rounded-full bg-leaf-300"
              animate={{ scale: [1, 1.35, 1], opacity: [0.45, 0, 0.45] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
          <AnimatePresence>
            {ripple > 0 && (
              <motion.span
                key={ripple}
                aria-hidden
                className="absolute inset-0 rounded-full border-4 border-leaf-400"
                initial={{ scale: 1, opacity: 0.8 }}
                animate={{ scale: 2.2, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            )}
          </AnimatePresence>
          <motion.button
            onClick={() => {
              setRipple((r) => r + 1);
              setOpen(true);
            }}
            title="打开交互流捕获与降维提炼"
            aria-label="打开交互流捕获"
            whileHover={{ scale: 1.08, rotate: -6 }}
            whileTap={{ scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 400, damping: 18 }}
            className="relative flex h-16 w-16 items-center justify-center rounded-full bg-leaf-600 text-white shadow-[0_6px_0_var(--color-leaf-800),0_18px_30px_-10px_rgb(24_110_69/0.6)]"
          >
            <Plus className="h-7 w-7" strokeWidth={2.6} />
            {inboxItems.length > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1 -right-1 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-surface bg-sun-300 px-1 text-xs font-extrabold text-ink"
              >
                {inboxItems.length}
              </motion.span>
            )}
          </motion.button>
        </div>
      )}

      <Modal
        open={isOpen}
        onClose={closeModal}
        align="end"
        maxWidth="sm:max-w-lg"
        title="播下一颗认知种子"
        icon={
          <IconBadge tone="leaf">
            <Sprout className="h-5 w-5" />
          </IconBadge>
        }
        headerExtra={
          <select
            value={domainHint}
            onChange={(e) => setDomainHint(e.target.value)}
            aria-label="目标领域"
            className="input !w-auto max-w-[150px] !py-1.5 !text-sm"
          >
            {domains.map((d) => (
              <option key={d.slug} value={d.slug}>
                {d.name}
              </option>
            ))}
          </select>
        }
      >
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <div>
            <p className="mb-3 text-sm text-ink-muted">
              粘贴 AI 长对话或上传文档 / 图片，蒸馏师会把它们结晶为原子认知卡片。
            </p>
            <div className="relative">
              <textarea
                rows={7}
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
                placeholder="粘贴 AI 长对话（支持含表格/数据文本），或点击下方按钮上传 PDF / Word / 图片..."
                className="input min-h-[160px] resize-y leading-relaxed"
              />
              <AnimatePresence>
                {distilling && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-surface/85 backdrop-blur-[1px]"
                  >
                    <motion.div
                      animate={reduce ? undefined : { y: [0, -6, 0], rotate: [0, -8, 8, 0] }}
                      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                    >
                      <IconBadge tone="leaf" size="lg">
                        <Sprout className="h-6 w-6" />
                      </IconBadge>
                    </motion.div>
                    <span className="text-sm font-bold text-leaf-700">正在结晶认知…</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt,.md,.csv,image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || busyId !== null}
                className="btn btn-soft-clay btn-sm"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                {uploading ? '正在解析文件...' : '上传 PDF / Word / CSV / 图片'}
              </button>
              <AnimatePresence>
                {attachments.map((att) => (
                  <motion.span
                    key={att.id}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="chip chip-clay"
                  >
                    <Paperclip className="h-3 w-3" />
                    {att.filename}
                  </motion.span>
                ))}
              </AnimatePresence>
            </div>

            <div className="mt-4 flex gap-2.5">
              <button onClick={handleSaveStream} disabled={busyId !== null} className="btn btn-outline btn-press">
                {busyId === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                仅暂存流
              </button>
              <button
                onClick={handleSaveAndDistill}
                disabled={busyId !== null}
                className="btn btn-primary btn-press flex-1"
              >
                {distilling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                一键降维提炼
              </button>
            </div>
          </div>

          {inboxItems.length > 0 && (
            <div className="space-y-2.5 border-t border-line pt-5">
              <div className="flex items-center gap-2 text-sm font-extrabold text-ink">
                <Hourglass className="h-4 w-4 text-sun-600" />
                待提炼种子 ({inboxItems.length})
                <span className="text-xs font-semibold text-ink-muted">· 7 天后自然枯萎</span>
              </div>
              <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-2.5">
                {inboxItems.map((item) => {
                  const f = freshness(item);
                  return (
                    <motion.div
                      key={item.id}
                      variants={rise}
                      className="rounded-2xl border border-line bg-paper p-3.5 transition"
                      style={{ opacity: 0.55 + 0.45 * f, filter: `saturate(${0.4 + 0.6 * f})` }}
                    >
                      <div className="mb-1.5 flex items-center justify-between text-xs text-ink-muted">
                        <span className="flex items-center gap-2">
                          <span className="chip chip-leaf !py-0">{domainName(item.domain_hint)}</span>~
                          {item.token_count} tokens
                        </span>
                        <button
                          onClick={() => api.deleteStream(item.id).then(onRefresh)}
                          className="icon-btn hover:!text-coral-600"
                          aria-label="删除"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <p className="line-clamp-2 text-sm text-ink-soft">{item.raw_content}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-paper-3" title="剩余新鲜度">
                          <div className="h-full rounded-full bg-leaf-400" style={{ width: `${f * 100}%` }} />
                        </div>
                        <button
                          onClick={() => handleDistillExisting(item)}
                          disabled={busyId !== null}
                          className="btn btn-soft-leaf btn-sm"
                        >
                          {busyId === item.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Play className="h-3.5 w-3.5" />
                          )}
                          执行降维提取
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
