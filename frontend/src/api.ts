export type DomainSlug = 'investing' | 'learning';
export type NodeType = 'knowledge' | 'decision';
export type Bandwidth = 'low' | 'medium' | 'high';
export type ProviderType = 'deepseek' | 'openai_compatible' | 'local';

export interface StreamItem {
  id: string;
  source: string;
  domain_hint: DomainSlug;
  raw_content: string;
  token_count: number;
  status: string;
  created_at: string;
}

export interface CrystallizedNode {
  id: string;
  domain_slug: DomainSlug;
  schema_version: number;
  node_type: NodeType;
  folder_path: string;
  short_keyword: string;
  title: string;
  atomic_claim: string;
  payload: Record<string, unknown>;
  confidence: number;
  conversion_weight: number;
  status: string;
  discarded_noise?: string;
  compression_ratio?: number;
  needs_verification?: number;
  created_at: string;
}

export interface ActionExperiment {
  id: string;
  node_id: string;
  node_title?: string;
  domain_slug?: DomainSlug;
  atomic_claim?: string;
  conversion_weight?: number;
  theoretical_basis?: string;
  hypothesis: string;
  trigger_condition: string;
  micro_action: string;
  success_metric: string;
  bandwidth_cost: Bandwidth;
  status: string;
  check_in_at?: string;
  created_at: string;
}

export interface Metrics {
  dcr_percent: number;
  avg_compression_ratio: number;
  avg_conversion_weight: number;
  stream_total: number;
  stream_inbox: number;
  nodes_total: number;
  actions_total: number;
  actions_verified: number;
  actions_succeeded: number;
}

export interface ProviderProfile {
  label: string;
  base_url: string;
  api_key: string;
  fast_model: string;
  reasoning_model: string;
  has_api_key?: boolean;
  api_key_masked?: string;
}

export interface LLMSettings {
  active_provider: ProviderType;
  profiles: Record<ProviderType, ProviderProfile>;
}

export interface ArchitectProposal {
  id: string;
  domain_slug: DomainSlug;
  proposal_type: 'merge_duplicates' | 'deprecate_low_utility' | 'evolve_schema';
  target_node_ids: string[];
  target_nodes: {
    id: string;
    node_type?: NodeType;
    short_keyword?: string;
    title: string;
    atomic_claim: string;
    payload?: Record<string, unknown>;
    conversion_weight: number;
  }[];
  proposed_node?: {
    node_type?: NodeType;
    folder_path?: string;
    short_keyword?: string;
    title?: string;
    atomic_claim?: string;
    payload?: Record<string, unknown>;
    // For evolve_schema proposals
    from_version?: number;
    to_version?: number;
    from_schema?: { properties?: Record<string, { title?: string }> };
    to_schema?: { properties?: Record<string, { title?: string }> };
    migrated_nodes?: {
      node_id: string;
      title: string;
      old_payload: Record<string, unknown>;
      new_payload: Record<string, unknown>;
    }[];
  };
  rationale: string;
  status: string;
  created_at: string;
}

export interface CustomSchemaField {
  key: string;
  title: string;
  description?: string;
}

export interface SchemaEvolutionStatus {
  domain_slug: DomainSlug;
  current_version: number;
  current_tier: number;
  next_version: number;
  suggested_fields: CustomSchemaField[];
  actions_verified: number;
  socratic_logs_count: number;
  recommended_threshold: number;
  active_nodes_to_migrate: number;
}

export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export interface SocraticChallenge {
  node_id: string;
  node_title: string;
  difficulty: DifficultyLevel;
  scenario_question: string;
  hint: string;
}

export interface SocraticEvalResult {
  log_id: string;
  node_id: string;
  rating: number;
  feedback: string;
  blind_spot_note: string;
  card_evolution_note: string;
  next_review_days: number;
}

export interface SocraticLog {
  id: string;
  node_id: string;
  node_title: string;
  short_keyword: string;
  difficulty: DifficultyLevel;
  question: string;
  user_answer: string;
  rating: number;
  feedback: string;
  blind_spot_note: string;
  card_evolution_note: string;
  created_at: string;
}

export interface DomainFolder {
  id: string;
  domain_slug: DomainSlug;
  folder_name: string;
  is_system: number;
  created_at: string;
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || '请求失败');
  }
  return res.json();
}

export const api = {
  getMetrics: () => req<Metrics>('/api/metrics'),
  getProfile: () => req<{ current_bandwidth: Bandwidth; domain_mastery: Record<string, { tier: number; actions_verified: number }> }>('/api/profile'),
  setBandwidth: (bandwidth: Bandwidth) =>
    req<{ current_bandwidth: Bandwidth }>('/api/profile/bandwidth', {
      method: 'PATCH',
      body: JSON.stringify({ bandwidth }),
    }),
  listStream: () => req<StreamItem[]>('/api/stream'),
  createStream: (raw_content: string, domain_hint: DomainSlug) =>
    req<StreamItem>('/api/stream', {
      method: 'POST',
      body: JSON.stringify({ raw_content, domain_hint }),
    }),
  deleteStream: (id: string) => req<{ deleted: string }>(`/api/stream/${id}`, { method: 'DELETE' }),
  distillStream: (stream_id: string, domain_slug: DomainSlug) =>
    req<{
      stream_id: string;
      discarded_noise_summary: string;
      compression_ratio: number;
      nodes: CrystallizedNode[];
    }>('/api/nodes/distill', {
      method: 'POST',
      body: JSON.stringify({ stream_id, domain_slug }),
    }),
  listNodes: () => req<CrystallizedNode[]>('/api/nodes'),
  listActions: () => req<ActionExperiment[]>('/api/actions'),
  proposeAction: (node_id: string) =>
    req<ActionExperiment>('/api/actions/propose', {
      method: 'POST',
      body: JSON.stringify({ node_id }),
    }),
  auditAction: (
    action_id: string,
    payload: {
      executed: boolean;
      outcome_score: number;
      friction_tag: string;
      user_reflection: string;
    },
  ) =>
    req<{ audit_id: string; calibration_delta: Record<string, unknown> }>(
      `/api/actions/${action_id}/audit`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),
  getLLMSettings: () => req<LLMSettings>('/api/settings/llm'),
  saveLLMSettings: (settings: LLMSettings) =>
    req<LLMSettings>('/api/settings/llm', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
  testLLM: () =>
    req<{ status: string; model: string; reply: string }>('/api/settings/llm/test', {
      method: 'POST',
    }),
  scanDomain: (domain_slug: DomainSlug) =>
    req<{ summary: string; created_proposals: ArchitectProposal[] }>('/api/architect/scan', {
      method: 'POST',
      body: JSON.stringify({ domain_slug }),
    }),
  listProposals: (domain_slug?: DomainSlug) =>
    req<ArchitectProposal[]>(
      domain_slug ? `/api/architect/proposals?domain_slug=${domain_slug}` : '/api/architect/proposals',
    ),
  approveProposal: (id: string) =>
    req<{ proposal_id: string; status: string }>(`/api/architect/proposals/${id}/approve`, {
      method: 'POST',
    }),
  rejectProposal: (id: string) =>
    req<{ proposal_id: string; status: string }>(`/api/architect/proposals/${id}/reject`, {
      method: 'POST',
    }),
  refineProposal: (id: string, user_suggestion: string) =>
    req<{ proposal_id: string; rationale: string }>(`/api/architect/proposals/${id}/refine`, {
      method: 'POST',
      body: JSON.stringify({ user_suggestion }),
    }),
  getDueSocratic: () =>
    req<{ suppressed_by_low_bandwidth: boolean; due_nodes: CrystallizedNode[] }>('/api/socratic/due'),
  getSocraticHistory: (node_id?: string) =>
    req<SocraticLog[]>(
      node_id ? `/api/socratic/history?node_id=${node_id}` : '/api/socratic/history',
    ),
  generateSocraticChallenge: (node_id: string, difficulty: DifficultyLevel = 'medium') =>
    req<SocraticChallenge>('/api/socratic/challenge', {
      method: 'POST',
      body: JSON.stringify({ node_id, difficulty }),
    }),
  evaluateSocraticAnswer: (
    node_id: string,
    question: string,
    user_answer: string,
    difficulty: DifficultyLevel = 'medium',
  ) =>
    req<SocraticEvalResult>('/api/socratic/evaluate', {
      method: 'POST',
      body: JSON.stringify({ node_id, question, user_answer, difficulty }),
    }),
  listFolders: (domain_slug?: DomainSlug) =>
    req<DomainFolder[]>(
      domain_slug ? `/api/nodes/folders?domain_slug=${domain_slug}` : '/api/nodes/folders',
    ),
  createFolder: (domain_slug: DomainSlug, folder_name: string) =>
    req<DomainFolder>('/api/nodes/folders', {
      method: 'POST',
      body: JSON.stringify({ domain_slug, folder_name }),
    }),
  renameFolder: (domain_slug: DomainSlug, old_name: string, new_name: string) =>
    req<{ domain_slug: DomainSlug; old_name: string; new_name: string }>('/api/nodes/folders', {
      method: 'PATCH',
      body: JSON.stringify({ domain_slug, old_name, new_name }),
    }),
  moveNodeFolder: (node_id: string, folder_name: string) =>
    req<{ id: string; folder_path: string }>(`/api/nodes/${node_id}/folder`, {
      method: 'PATCH',
      body: JSON.stringify({ folder_name }),
    }),
  verifyNode: (node_id: string) =>
    req<{ id: string; needs_verification: number }>(`/api/nodes/${node_id}/verify`, {
      method: 'POST',
    }),
  getSchemaStatus: (domain_slug: DomainSlug) =>
    req<SchemaEvolutionStatus>(`/api/architect/schema-status/${domain_slug}`),
  previewSchemaEvolution: (
    domain_slug: DomainSlug,
    custom_fields?: CustomSchemaField[],
    evolution_goal?: string,
  ) =>
    req<{ proposal_id: string; rationale: string }>('/api/architect/evolve-schema/preview', {
      method: 'POST',
      body: JSON.stringify({ domain_slug, custom_fields, evolution_goal }),
    }),
};
