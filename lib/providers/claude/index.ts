import path from 'node:path';
import os from 'node:os';
import { parseJsonlFile } from '@/lib/data-loader/parse-jsonl';
import { BUILTIN_PRICING, FALLBACK_BY_FAMILY } from '@/lib/pricing/builtin';
import { costFromUsage } from '@/lib/pricing/cost-from-usage';
import { shortenClaudeModel } from './shorten-model';
import type { Pricing } from '@/lib/types';
import type { ProviderAdapter, PricingResolution } from '../types';

// ===== 自定义模型定价（cc-switch 代理的第三方模型）=====
// 汇率：1 USD = 7.2 CNY
// 注意：ccgauge 的 Pricing 单位是 USD per 1M tokens
// DeepSeek 按官方高峰时段价计（空闲时段半价，暂不支持）；cacheRead=缓存命中价，input/cacheCreation=缓存未命中价

const CUSTOM_PRICING: Record<string, { input: number; output: number; cacheCreation5m: number; cacheCreation1h: number; cacheRead: number }> = {
  'deepseek-v4-pro': {
    input: 1.25,
    output: 3.75,
    cacheCreation5m: 1.25,
    cacheCreation1h: 1.25,
    cacheRead: 0.0417,
  },
  'deepseek-v4-flash': {
    input: 0.4167,
    output: 1.25,
    cacheCreation5m: 0.4167,
    cacheCreation1h: 0.4167,
    cacheRead: 0.0139,
  },
  'deepseek-v4-flash-vision-exp': {
    input: 0.4167,
    output: 1.25,
    cacheCreation5m: 0.4167,
    cacheCreation1h: 0.4167,
    cacheRead: 0.0139,
  },
  'kimi-for-coding': {
    input: 0, output: 0, cacheCreation5m: 0, cacheCreation1h: 0, cacheRead: 0,
  },
  'k2p6': {
    input: 0, output: 0, cacheCreation5m: 0, cacheCreation1h: 0, cacheRead: 0,
  },
};

const dateSuffix = /-\d{8}$/;
const prefixRe = /^(vertex_ai|bedrock|anthropic)\//;

// Runtime overlay published by lib/pricing/store.ts (loose globalThis contract so
// this file never imports the store — see codex/pricing.ts for the rationale).
interface PricingSlotState {
  claude?: Record<string, Pricing>;
  claudeFallback?: Record<string, Pricing>;
}
function slotState(): PricingSlotState | undefined {
  return (
    globalThis as unknown as { __ccgaugePricing?: { state?: PricingSlotState } }
  ).__ccgaugePricing?.state;
}
function activeClaude(): Record<string, Pricing> {
  return slotState()?.claude ?? BUILTIN_PRICING;
}
function activeClaudeFallback(): Record<string, Pricing> {
  return slotState()?.claudeFallback ?? FALLBACK_BY_FAMILY;
}

function resolvePricing(model: string): PricingResolution {
  if (!model) return { pricing: null, matchType: 'none', matchedKey: null };

  // 1. 自定义模型精确匹配（cc-switch 代理的第三方模型）
  if (CUSTOM_PRICING[model]) {
    return { pricing: CUSTOM_PRICING[model], matchType: 'exact', matchedKey: model };
  }

  const pricing = activeClaude();

  // 2. 模型精确匹配（运行时 overlay 优先，回退到内置快照）
  if (pricing[model]) {
    return { pricing: pricing[model], matchType: 'exact', matchedKey: model };
  }

  // 3. 日期后缀剥离
  const stripped = model.replace(dateSuffix, '');
  if (pricing[stripped]) {
    return {
      pricing: pricing[stripped],
      matchType: 'date-stripped',
      matchedKey: stripped,
    };
  }

  // 4. provider 前缀剥离
  const noPrefix = stripped.replace(prefixRe, '');
  if (pricing[noPrefix]) {
    return {
      pricing: pricing[noPrefix],
      matchType: 'prefix-stripped',
      matchedKey: noPrefix,
    };
  }

  // 5. 自定义模型日期后缀剥离（如 deepseek-v4-pro-20250521）
  if (CUSTOM_PRICING[stripped]) {
    return {
      pricing: CUSTOM_PRICING[stripped],
      matchType: 'date-stripped',
      matchedKey: stripped,
    };
  }

  // 6. 官方模型 family fallback
  const fallback = activeClaudeFallback();
  for (const family of ['fable', 'opus', 'sonnet', 'haiku']) {
    if (model.toLowerCase().includes(family)) {
      return {
        pricing: fallback[family] ?? null,
        matchType: 'family-fallback',
        matchedKey: `claude-${family}-(latest)`,
      };
    }
  }
  return { pricing: null, matchType: 'none', matchedKey: null };
}

// ===== 峰谷计费（DeepSeek 官方：空闲时段为高峰价半价）=====
// 高峰 = 北京时间周一至周五 09:00–12:00、14:00–18:00；其余（含周末）为空闲/半价。
// 仅对 cc-switch 代理的 deepseek-v4 系列启用；Kimi 等其余自定义模型照旧走 resolvePricing。
const PEAK_OFF_MODELS = new Set([
  'deepseek-v4-pro',
  'deepseek-v4-flash',
  'deepseek-v4-flash-vision-exp',
]);

function customDeepseekKey(model: string): string | null {
  if (PEAK_OFF_MODELS.has(model)) return model;
  const stripped = model.replace(dateSuffix, '');
  return PEAK_OFF_MODELS.has(stripped) ? stripped : null;
}

// 记录时间戳为 ISO-UTC（Claude Code 带 Z/offset），经 Intl 转为北京时间判峰谷。
// 无法解析 → 返回 true（高峰，保守）。周末总是空闲（周五 18:00 后至周一 09:00 前均空闲）。
function isBeijingPeak(iso: string): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return true;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value);
  if (wd === 'Sat' || wd === 'Sun') return false;
  return (hour >= 9 && hour < 12) || (hour >= 14 && hour < 18);
}

function resolvePricingAt(model: string, timestamp?: string): PricingResolution {
  const key = customDeepseekKey(model);
  if (!key || !timestamp) return resolvePricing(model);
  if (isBeijingPeak(timestamp)) return resolvePricing(model);
  const peak = CUSTOM_PRICING[key];
  if (!peak) return resolvePricing(model);
  const half = (v: number) => v / 2;
  const matchType = model === key ? 'exact' : 'date-stripped';
  return {
    pricing: {
      input: half(peak.input),
      output: half(peak.output),
      cacheCreation5m: half(peak.cacheCreation5m),
      cacheCreation1h: half(peak.cacheCreation1h),
      cacheRead: half(peak.cacheRead),
    },
    matchType,
    matchedKey: key,
  };
}

function getDirs(): string[] {
  const home = os.homedir();
  const candidates = [
    path.join(home, '.claude', 'projects'),
    path.join(home, '.config', 'claude', 'projects'),
  ];
  if (process.env.CCGAUGE_CONFIG_DIR) {
    candidates.push(path.join(process.env.CCGAUGE_CONFIG_DIR, 'projects'));
  }
  if (process.env.CLAUDE_CONFIG_DIR) {
    candidates.push(path.join(process.env.CLAUDE_CONFIG_DIR, 'projects'));
  }
  return Array.from(new Set(candidates));
}

export const claudeAdapter: ProviderAdapter = {
  id: 'claude',
  displayName: { en: 'Claude', zh: 'Claude' },
  shortLabel: 'C',
  color: { fg: '#b45309', bg: '#fef3c7' },
  logoSrc: '/claude-logo.webp',

  parserVersion: 'claude-v6-tool-result-sizes',
  capabilities: {
    hasCacheCreation: true,
    hasReasoningTokens: false,
    blockWindowMs: 5 * 60 * 60 * 1000,
  },
  getDirs,
  shouldSkipDir: (name) => name === 'tool-results' || name === 'memory',
  parseFile: async (file) => {
    const parsed = await parseJsonlFile(file);
    return parsed;
  },
  resolvePricing,
  resolvePricingAt,
  shortenModel: shortenClaudeModel,
  costFromUsage,
  costFootnoteKey: null,
};
