import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Gem, Loader2, Lock, MessageSquareText, RefreshCcw, Target, UserPlus } from 'lucide-react';
import { api, AuthUser, setStoredToken } from '../api';
import { Logo } from './ui/Logo';
import { LivingBackground, Segmented } from './ui/Living';

interface Props {
  onAuthenticated: (user: AuthUser) => void;
}

const LOOP_STEPS = [
  { icon: MessageSquareText, label: '捕获对话', desc: '粘贴 AI 长对话', tone: 'bg-clay-50 text-clay-600 border-clay-100' },
  { icon: Gem, label: '结晶认知', desc: '降维成原子卡片', tone: 'bg-mind-50 text-mind-600 border-mind-100' },
  { icon: Target, label: '微行动', desc: 'If-Then 实验', tone: 'bg-sun-50 text-sun-700 border-sun-100' },
  { icon: RefreshCcw, label: '反馈进化', desc: '权重随现实生长', tone: 'bg-leaf-50 text-leaf-600 border-leaf-100' },
];

/** Four-step loop orbiting a growing sprout. */
function LoopIllustration() {
  const R = 118;
  return (
    <div className="relative mx-auto h-[300px] w-[300px]">
      <svg viewBox="0 0 300 300" className="absolute inset-0" aria-hidden>
        <motion.circle
          cx="150"
          cy="150"
          r={R}
          fill="none"
          stroke="var(--color-leaf-200)"
          strokeWidth="2.5"
          strokeDasharray="6 10"
          strokeLinecap="round"
          animate={{ rotate: 360 }}
          style={{ originX: '150px', originY: '150px' }}
          transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
        />
      </svg>
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 160, damping: 14, delay: 0.2 }}
      >
        <div className="animate-breathe rounded-[2rem] shadow-lift">
          <Logo size={96} />
        </div>
      </motion.div>
      {LOOP_STEPS.map((s, i) => {
        const a = (i / LOOP_STEPS.length) * Math.PI * 2 - Math.PI / 2;
        const x = 150 + R * Math.cos(a);
        const y = 150 + R * Math.sin(a);
        const Icon = s.icon;
        return (
          <motion.div
            key={s.label}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: x, top: y }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1, y: [0, -5, 0] }}
            transition={{
              opacity: { delay: 0.4 + i * 0.15 },
              scale: { delay: 0.4 + i * 0.15, type: 'spring', stiffness: 220, damping: 14 },
              y: { duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: i * 0.5 },
            }}
          >
            <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-2 whitespace-nowrap shadow-soft">
              <span className={`flex h-8 w-8 items-center justify-center rounded-xl border ${s.tone}`}>
                <Icon className="h-4 w-4" />
              </span>
              <div className="leading-tight">
                <div className="text-sm font-extrabold text-ink">{s.label}</div>
                <div className="text-xs text-ink-muted">{s.desc}</div>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

export function AuthScreen({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [inviteRequired, setInviteRequired] = useState(false);
  const [hasUsers, setHasUsers] = useState(true);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getAuthConfig()
      .then((cfg) => {
        setInviteRequired(cfg.invite_required);
        setHasUsers(cfg.has_users);
        if (!cfg.has_users) setMode('register');
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res =
        mode === 'login'
          ? await api.login({ username, password })
          : await api.register({ username, password, nickname, invite_code: inviteCode });
      setStoredToken(res.access_token);
      onAuthenticated(res.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative isolate flex min-h-screen flex-col text-ink">
      <LivingBackground />
      <div className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 items-center gap-10 px-5 py-10 lg:grid-cols-2 lg:gap-16">
        {/* Brand hero */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="text-center lg:text-left"
        >
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-leaf-100 bg-leaf-50 px-3 py-1 text-xs font-bold text-leaf-700">
            <span className="h-2 w-2 animate-pulse rounded-full bg-leaf-500" />
            Agentic PKM · 动态认知闭环
          </div>
          <h1 className="font-display text-3xl leading-tight font-extrabold tracking-tight text-ink sm:text-4xl lg:text-5xl">
            让每一次对话
            <br />
            <span className="relative isolate inline-block text-leaf-600">
              长成真实的行动
              <svg viewBox="0 0 300 16" className="absolute -bottom-2 left-0 -z-10 w-full" aria-hidden>
                <motion.path
                  d="M4 10 C 80 2, 180 16, 296 6"
                  fill="none"
                  stroke="var(--color-sun-300)"
                  strokeWidth="6"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.9, delay: 0.5, ease: 'easeOut' }}
                />
              </svg>
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-md text-base text-ink-soft lg:mx-0">
            捕获 AI 长对话，结晶为原子认知卡片，再转化成 If-Then 微行动。你的真实反馈会让知识像植物一样持续生长、修剪与进化。
          </p>
          <div className="mt-8 hidden lg:block">
            <LoopIllustration />
          </div>
        </motion.section>

        {/* Form card */}
        <motion.section
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 24, delay: 0.1 }}
          className="card mx-auto w-full max-w-md p-6 sm:p-8"
        >
          <div className="mb-6 flex items-center gap-3">
            <Logo size={44} />
            <div>
              <h2 className="text-lg font-extrabold text-ink">Dynamic Cognitive Loop</h2>
              <p className="text-sm text-ink-muted">个人动态认知闭环 · 账户隔离</p>
            </div>
          </div>

          {!hasUsers && (
            <div className="mb-4 rounded-2xl border border-sun-100 bg-sun-50 p-3 text-sm text-sun-700">
              首次初始化：注册的第一个账号将自动成为管理员并继承已有认知数据。
            </div>
          )}

          <Segmented
            group="auth-mode"
            value={mode}
            onChange={(m) => {
              setMode(m);
              setError(null);
            }}
            className="mb-5 grid w-full grid-cols-2"
            options={[
              { value: 'login', label: '登录' },
              { value: 'register', label: '注册新账户' },
            ]}
          />

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">用户名</label>
              <input
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="例如 mordanours"
                className="input"
              />
            </div>

            {mode === 'register' && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                <label className="label">显示昵称（可选）</label>
                <input
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="你的昵称"
                  className="input"
                />
              </motion.div>
            )}

            <div>
              <label className="label">密码（至少 6 位）</label>
              <input
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input"
              />
            </div>

            {mode === 'register' && inviteRequired && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                <label className="label !text-sun-700">邀请码（必填）</label>
                <input
                  required
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="请输入服务器邀请码"
                  className="input !border-sun-200"
                />
              </motion.div>
            )}

            {error && (
              <motion.div
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: [0, -6, 6, -3, 0] }}
                className="rounded-2xl border border-coral-100 bg-coral-50 px-3 py-2 text-sm text-coral-700"
              >
                {error}
              </motion.div>
            )}

            <button type="submit" disabled={busy} className="btn btn-primary btn-press btn-lg mt-2 w-full">
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : mode === 'login' ? (
                <Lock className="h-4 w-4" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              {mode === 'login' ? '登录工作台' : '注册并进入'}
            </button>
          </form>
        </motion.section>
      </div>

      <footer className="pb-6 text-center text-xs text-ink-muted">
        <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer" className="hover:text-ink">
          湘ICP备2026033436号
        </a>
      </footer>
    </div>
  );
}
