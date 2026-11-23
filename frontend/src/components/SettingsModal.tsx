import { useEffect, useState } from 'react';
import { X, CheckCircle2, AlertCircle, Loader2, Eye } from 'lucide-react';
import { api, LLMSettings, ProviderType, VisionConfig } from '../api';

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

  if (!open || !settings) return null;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">模型接口设置 (OpenAI 兼容协议)</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          {(['deepseek', 'openai_compatible', 'local'] as ProviderType[]).map((key) => (
            <button
              key={key}
              onClick={() => handleProviderSwitch(key)}
              className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${
                activeKey === key
                  ? 'border-indigo-500 bg-indigo-500/20 text-indigo-200'
                  : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
              }`}
            >
              {key === 'deepseek' ? 'DeepSeek API' : key === 'openai_compatible' ? 'OpenAI 兼容' : '本地 Ollama'}
            </button>
          ))}
        </div>

        <div className="space-y-3 text-sm">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Base URL</label>
            <input
              value={profile.base_url}
              onChange={(e) => updateField('base_url', e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              API Key {profile.api_key_masked ? `(已配置: ${profile.api_key_masked})` : ''}
            </label>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder={activeKey === 'local' ? 'ollama (本地无需真实 Key)' : 'sk-...'}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-indigo-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-slate-400">Fast 模型 (轻量/低带宽)</label>
              <input
                value={profile.fast_model}
                onChange={(e) => updateField('fast_model', e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Reasoning 模型 (提炼/推理)</label>
              <input
                value={profile.reasoning_model}
                onChange={(e) => updateField('reasoning_model', e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Optional Vision Model Config */}
        <div className="mt-5 border-t border-slate-800 pt-4">
          <button
            type="button"
            onClick={() => setShowVision((v) => !v)}
            className="flex w-full items-center justify-between text-xs font-medium text-indigo-300 hover:text-indigo-200"
          >
            <span className="flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5" />
              视觉识别模型设置 (用于图片/截图 OCR 与表格提取)
            </span>
            <span>{vision.enabled ? '已启用' : '未启用'}</span>
          </button>

          {showVision && (
            <div className="mt-3 space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 text-xs">
              <label className="flex items-center gap-2 text-slate-200">
                <input
                  type="checkbox"
                  checked={vision.enabled}
                  onChange={(e) => updateVision({ enabled: e.target.checked })}
                  className="rounded border-slate-700"
                />
                启用视觉识别模型（支持 Qwen-VL / GPT-4o-mini / Gemini 等 OpenAI 兼容接口）
              </label>
              <div>
                <label className="mb-1 block text-slate-400">Vision Base URL</label>
                <input
                  value={vision.base_url}
                  onChange={(e) => updateVision({ base_url: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-slate-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-slate-400">
                    Vision Key {vision.api_key_masked ? `(${vision.api_key_masked})` : ''}
                  </label>
                  <input
                    type="password"
                    value={visionKeyInput}
                    onChange={(e) => setVisionKeyInput(e.target.value)}
                    placeholder="sk-..."
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-slate-400">Vision 模型名</label>
                  <input
                    value={vision.model}
                    onChange={(e) => updateVision({ model: e.target.value })}
                    placeholder="gpt-4o-mini / qwen-vl-max"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-slate-100"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {message && (
          <div
            className={`mt-4 flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
              message.type === 'ok' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'
            }`}
          >
            {message.type === 'ok' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
            <span>{message.text}</span>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={handleTest}
            disabled={testing || saving}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
          >
            {testing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            保存并测试连接
          </button>
          <button
            onClick={handleSave}
            disabled={saving || testing}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            保存配置
          </button>
        </div>
      </div>
    </div>
  );
}
