import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, AlertCircle, Loader2, Eye, ChevronDown, Settings2 } from 'lucide-react';
import { api, LLMSettings, ProviderType, VisionConfig } from '../api';
import { IconBadge, Modal } from './ui/Modal';
import { Segmented } from './ui/Living';

interface Props {
  open: boolean;
  onClose: () => void;
}

const DEFAULT_VISION: VisionConfig = {
  enabled: false,
  base_url: 'https://api.openai.com/v1',
  api_key: '',
  model: 'gpt-4o-mini',
};

export function SettingsModal({ open, onClose }: Props) {
  const [settings, setSettings] = useState<LLMSettings | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [visionKeyInput, setVisionKeyInput] = useState('');
  const [showVision, setShowVision] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setMessage(null);
    api.getLLMSettings().then((data) => {
      setSettings({ ...data, vision: data.vision || DEFAULT_VISION });
      const active = data.profiles[data.active_provider];
      setApiKeyInput(active.has_api_key ? '__KEEP__' : active.api_key || '');
      setVisionKeyInput(data.vision?.has_api_key ? '__KEEP__' : data.vision?.api_key || '');
    });
  }, [open]);

  // Settings not loaded yet: render nothing (modal stays closed until data arrives).
  if (!settings) return <Modal open={false} onClose={onClose}>{null}</Modal>;

  const activeKey = settings.active_provider;
  const profile = settings.profiles[activeKey];
  const vision = settings.vision || DEFAULT_VISION;

  const handleProviderSwitch = (next: ProviderType) => {
    setSettings({ ...settings, active_provider: next });
    const nextProf = settings.profiles[next];
    setApiKeyInput(nextProf.has_api_key ? '__KEEP__' : nextProf.api_key || '');
    setMessage(null);
  };

  const updateField = (field: 'base_url' | 'fast_model' | 'reasoning_model', val: string) => {
    setSettings({
      ...settings,
      profiles: {
        ...settings.profiles,
        [activeKey]: { ...profile, [field]: val },
      },
    });
  };

  const updateVision = (patch: Partial<VisionConfig>) => {
    setSettings({
      ...settings,
      vision: { ...vision, ...patch },
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const payload: LLMSettings = {
        ...settings,
        profiles: {
          ...settings.profiles,
          [activeKey]: { ...profile, api_key: apiKeyInput },
        },
        vision: { ...vision, api_key: visionKeyInput },
      };
      const saved = await api.saveLLMSettings(payload);
      setSettings(saved);
      setApiKeyInput(saved.profiles[activeKey].has_api_key ? '__KEEP__' : saved.profiles[activeKey].api_key || '');
      setVisionKeyInput(saved.vision?.has_api_key ? '__KEEP__' : saved.vision?.api_key || '');
      setMessage({ type: 'ok', text: '模型配置已加密保存至个人账户' });
    } catch (e) {
      setMessage({ type: 'err', text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    await handleSave();
    setTesting(true);
    try {
      const res = await api.testLLM();
      setMessage({ type: 'ok', text: `连接成功 (${res.model})：${res.reply}` });
    } catch (e) {
      setMessage({ type: 'err', text: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      maxWidth="sm:max-w-lg"
      title="模型接口设置 (OpenAI 兼容协议)"
      icon={
        <IconBadge tone="leaf">
          <Settings2 className="h-5 w-5" />
        </IconBadge>
      }
    >
      <div className="flex-1 space-y-5 overflow-y-auto p-5 text-sm">
        <Segmented
          group="settings-provider"
          value={activeKey}
          onChange={handleProviderSwitch}
          className="flex w-full [&>button]:flex-1 [&>button]:justify-center [&>button]:!py-2"
          options={(['deepseek', 'openai_compatible', 'local'] as ProviderType[]).map((key) => ({
            value: key,
            label: key === 'deepseek' ? 'DeepSeek API' : key === 'openai_compatible' ? 'OpenAI 兼容' : '本地 Ollama',
            activeClass: '!bg-leaf-50 ring-1 ring-leaf-200',
          }))}
        />

        <div className="space-y-4">
          <div>
            <label className="label">Base URL</label>
            <input value={profile.base_url} onChange={(e) => updateField('base_url', e.target.value)} className="input" />
          </div>
          <div>
            <label className="label">
              API Key{' '}
              {profile.api_key_masked ? (
                <span className="font-semibold text-leaf-700">(已配置: {profile.api_key_masked})</span>
              ) : (
                ''
              )}
            </label>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder={activeKey === 'local' ? 'ollama (本地无需真实 Key)' : 'sk-...'}
              className="input"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Fast 模型 (轻量/低带宽)</label>
              <input
                value={profile.fast_model}
                onChange={(e) => updateField('fast_model', e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="label">Reasoning 模型 (提炼/推理)</label>
              <input
                value={profile.reasoning_model}
                onChange={(e) => updateField('reasoning_model', e.target.value)}
                className="input"
              />
            </div>
          </div>
        </div>

        {/* Optional Vision Model Config */}
        <div className="border-t border-line pt-4">
          <button
            type="button"
            onClick={() => setShowVision((v) => !v)}
            className="flex w-full items-center justify-between gap-3 rounded-xl px-1 py-1 text-left text-sm font-bold text-ink-soft hover:text-ink"
          >
            <span className="flex items-center gap-2">
              <IconBadge tone="mind" size="sm">
                <Eye className="h-4 w-4" />
              </IconBadge>
              视觉识别模型设置 (用于图片/截图 OCR 与表格提取)
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              <span className={`chip ${vision.enabled ? 'chip-leaf' : 'chip-muted'}`}>
                {vision.enabled ? '已启用' : '未启用'}
              </span>
              <ChevronDown className={`h-4 w-4 transition-transform ${showVision ? 'rotate-180' : ''}`} />
            </span>
          </button>

          <AnimatePresence initial={false}>
            {showVision && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="well mt-3 space-y-4 p-4">
                  <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-soft">
                    <input
                      type="checkbox"
                      checked={vision.enabled}
                      onChange={(e) => updateVision({ enabled: e.target.checked })}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded accent-leaf-600"
                    />
                    启用视觉识别模型（支持 Qwen-VL / GPT-4o-mini / Gemini 等 OpenAI 兼容接口）
                  </label>
                  <div>
                    <label className="label">Vision Base URL</label>
                    <input
                      value={vision.base_url}
                      onChange={(e) => updateVision({ base_url: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="label">
                        Vision Key {vision.api_key_masked ? `(${vision.api_key_masked})` : ''}
                      </label>
                      <input
                        type="password"
                        value={visionKeyInput}
                        onChange={(e) => setVisionKeyInput(e.target.value)}
                        placeholder="sk-..."
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label">Vision 模型名</label>
                      <input
                        value={vision.model}
                        onChange={(e) => updateVision({ model: e.target.value })}
                        placeholder="gpt-4o-mini / qwen-vl-max"
                        className="input"
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence mode="wait">
          {message && (
            <motion.div
              key={message.text}
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 26 }}
              className={`flex items-start gap-2 rounded-2xl border px-3.5 py-2.5 text-sm ${
                message.type === 'ok'
                  ? 'border-leaf-100 bg-leaf-50 text-leaf-700'
                  : 'border-coral-100 bg-coral-50 text-coral-700'
              }`}
            >
              {message.type === 'ok' ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <span className="break-all">{message.text}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
        <button onClick={handleTest} disabled={testing || saving} className="btn btn-outline btn-press">
          {testing && <Loader2 className="h-4 w-4 animate-spin" />}
          保存并测试连接
        </button>
        <button onClick={handleSave} disabled={saving || testing} className="btn btn-primary btn-press">
          保存配置
        </button>
      </div>
    </Modal>
  );
}
