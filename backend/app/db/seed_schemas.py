from __future__ import annotations

SEED_SCHEMAS = [
    {
        "id": "schema_investing_v1",
        "domain_slug": "investing",
        "domain_name": "个人投资与决策",
        "version": 1,
        "mastery_tier": 1,
        "is_active": 1,
        "rationale": "L1 新手期默认结构：先建立直觉与风险边界，降低认知门槛。",
        "json_schema": {
            "type": "object",
            "required": ["concept", "analogy", "risk_boundary"],
            "properties": {
                "concept": {
                    "type": "string",
                    "title": "核心概念",
                    "description": "用通俗语言概括的投资或决策原则",
                },
                "analogy": {
                    "type": "string",
                    "title": "生活类比",
                    "description": "帮助直觉理解的具体类比或案例",
                },
                "risk_boundary": {
                    "type": "string",
                    "title": "风险边界",
                    "description": "该原则失效的前提条件或常见误区",
                },
            },
            "additionalProperties": False,
        },
    },
    {
        "id": "schema_investing_v2",
        "domain_slug": "investing",
        "domain_name": "个人投资与决策",
        "version": 2,
        "mastery_tier": 2,
        "is_active": 0,
        "rationale": "L2 实践期演进结构：完成多次行动复盘后引入赔率、风险敞口与证伪标准。",
        "json_schema": {
            "type": "object",
            "required": [
                "core_hypothesis",
                "risk_exposure",
                "action_triggers",
                "falsification_criteria",
            ],
            "properties": {
                "core_hypothesis": {"type": "string", "title": "核心假设"},
                "risk_exposure": {"type": "string", "title": "风险敞口与最坏情况"},
                "action_triggers": {
                    "type": "array",
                    "title": "行动触发条件",
                    "items": {
                        "type": "object",
                        "required": ["if", "then"],
                        "properties": {
                            "if": {"type": "string"},
                            "then": {"type": "string"},
                        },
                    },
                },
                "falsification_criteria": {"type": "string", "title": "证伪标准"},
            },
            "additionalProperties": False,
        },
    },
    {
        "id": "schema_learning_v1",
        "domain_slug": "learning",
        "domain_name": "教育学习",
        "version": 1,
        "mastery_tier": 1,
        "is_active": 1,
        "rationale": "L1 新手期默认结构：强调费曼式类比理解与防错提示。",
        "json_schema": {
            "type": "object",
            "required": ["concept", "analogy", "misconception_guard"],
            "properties": {
                "concept": {
                    "type": "string",
                    "title": "核心概念",
                    "description": "一句话说清本质是什么",
                },
                "analogy": {
                    "type": "string",
                    "title": "费曼类比",
                    "description": "用日常经验或具体例子解释该概念",
                },
                "misconception_guard": {
                    "type": "string",
                    "title": "易错点避坑",
                    "description": "初学者最容易混淆或误用的地方",
                },
            },
            "additionalProperties": False,
        },
    },
    {
        "id": "schema_learning_v2",
        "domain_slug": "learning",
        "domain_name": "教育学习",
        "version": 2,
        "mastery_tier": 2,
        "is_active": 0,
        "rationale": "L2 实践期演进结构：强调心智模型迁移与主动输出检验。",
        "json_schema": {
            "type": "object",
            "required": [
                "mental_model",
                "feynman_explanation",
                "transfer_scenarios",
                "mastery_check",
            ],
            "properties": {
                "mental_model": {"type": "string", "title": "底层心智模型"},
                "feynman_explanation": {"type": "string", "title": "无术语通俗复述"},
                "transfer_scenarios": {
                    "type": "array",
                    "title": "跨场景迁移应用",
                    "items": {"type": "string"},
                },
                "mastery_check": {"type": "string", "title": "掌握度自测标准"},
            },
            "additionalProperties": False,
        },
    },
]

DEFAULT_USER_PROFILE = {
    "current_bandwidth": "medium",
    "absorption_modality_weights": {
        "analogy": 0.90,
        "case_study": 0.80,
        "checklist": 0.75,
        "diagram": 0.70,
        "abstract_theory": 0.30,
    },
    "cognitive_blind_spots": [
        {
            "id": "bs_default_1",
            "pattern": "信息摄入过多但缺乏立即落地的触发条件，容易停留在‘懂了’的错觉",
            "domains": ["investing", "learning"],
            "severity": 0.65,
            "evidence_count": 1,
        }
    ],
    "domain_mastery": {
        "investing": {"tier": 1, "actions_verified": 0},
        "learning": {"tier": 1, "actions_verified": 0},
    },
}
