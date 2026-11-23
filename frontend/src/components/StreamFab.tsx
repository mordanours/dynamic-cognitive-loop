import { useEffect, useRef, useState } from 'react';
import { FileUp, Flame, Loader2, Play, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { api, DomainSlug, StreamItem, UserDomain } from '../api';

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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  return (
    <>
      {!hideFab && (
        <button
          onClick={() => setOpen(true)}
          title="打开交互流捕获与降维提炼"
          className="fixed right-6 bottom-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-600 to-violet-500 text-white shadow-xl shadow-indigo-900/50 transition hover:scale-105 hover:from-indigo-500 hover:to-violet-400 active:scale-95"
        >
          <Plus className="h-6 w-6" />
          {inboxItems.length > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white shadow">
              {inboxItems.length}
            </span>
          )}
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/60 sm:p-6">
          <div className="flex max-h-[88vh] w-full flex-col rounded-t-2xl border border-slate-800 bg-slate-900 shadow-2xl sm:max-w-lg sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-orange-400" />
                <h2 className="text-sm font-semibold text-white">交互流捕获 (支持文档/图片)</h2>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={domainHint}
                  onChange={(e) => setDomainHint(e.target.value)}
                  className="max-w-[140px] rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-200"
                >
                  {domains.map((d) => (
                    <option key={d.slug} value={d.slug}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={closeModal}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
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
                    className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-indigo-300 hover:border-indigo-500 disabled:opacity-50"
                  >
                    {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
                    {uploading ? '正在解析文件...' : '上传 PDF / Word / CSV / 图片'}
                  </button>
                  {attachments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {attachments.map((att) => (
                        <span
                          key={att.id}
                          className="rounded-md bg-indigo-500/15 px-2 py-0.5 text-[11px] text-indigo-200"
                        >
                          {att.filename}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <textarea
                  rows={6}
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value)}
                  placeholder="粘贴 AI 长对话（支持含表格/数据文本），或点击上方按钮上传 PDF / Word / 图片..."
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm leading-relaxed text-slate-100 outline-none focus:border-indigo-500 sm:text-xs"
                />
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={handleSaveStream}
                    disabled={busyId !== null}
                    className="rounded-xl border border-slate-700 px-3.5 py-2.5 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                  >
                    仅暂存流
                  </button>
                  <button
                    onClick={handleSaveAndDistill}
                    disabled={busyId !== null}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {busyId === 'distill_new' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    一键降维提炼
                  </button>
                </div>
              </div>

              {inboxItems.length > 0 && (
                <div className="space-y-2 border-t border-slate-800 pt-4">
                  <div className="text-xs font-medium text-slate-400">
                    待提炼缓存 ({inboxItems.length})
                  </div>
                  {inboxItems.map((item) => (
                    <div key={item.id} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs">
                      <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
                        <span>
                          {domainName(item.domain_hint)} · ~{item.token_count} tokens
                        </span>
                        <button
                          onClick={() => api.deleteStream(item.id).then(onRefresh)}
                          className="text-slate-500 hover:text-rose-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <p className="line-clamp-2 text-slate-300">{item.raw_content}</p>
                      <button
                        onClick={() => handleDistillExisting(item)}
                        disabled={busyId !== null}
                        className="mt-2 flex items-center gap-1 text-indigo-400 hover:text-indigo-300"
                      >
                        {busyId === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                        执行降维提取
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
