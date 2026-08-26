import type { AssistantRecord, CostBreakdown } from '../types';
import { getProvider } from '../providers';
import { costFromUsage, totalTokens } from './cost-from-usage';

export { costFromUsage, totalTokens };

export function costOfRecord(rec: AssistantRecord): CostBreakdown {
  const provider = getProvider(rec.source);
  // Prefer time-aware resolution (uses rec.timestamp for e.g. DeepSeek peak/off-peak);
  // fall back to the model-only default when the provider doesn't implement it.
  const { pricing } =
    provider.resolvePricingAt?.(rec.model, rec.timestamp) ??
    provider.resolvePricing(rec.model);
  return provider.costFromUsage(rec.usage, pricing, rec.model);
}
