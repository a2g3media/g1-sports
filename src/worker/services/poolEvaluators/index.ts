/**
 * Pool Evaluator Registry
 * Central factory for pool-type-specific evaluators
 */

import type { PoolEvaluator, EvaluatorRegistry } from './types';
import { survivorEvaluator } from './survivorEvaluator';
import { pickemEvaluator } from './pickemEvaluator';
import { confidenceEvaluator } from './confidenceEvaluator';
import { streakEvaluator } from './streakEvaluator';
import { upsetEvaluator } from './upsetEvaluator';
import { statEvaluator } from './statEvaluator';
import { specialEvaluator } from './specialEvaluator';
import { bracketEvaluator } from './bracketEvaluator';
import { squaresEvaluator } from './squaresEvaluator';
import { propsEvaluator } from './propsEvaluator';
import { bundleEvaluator } from './bundleEvaluator';
import { getCanonicalPoolType } from '../poolEngineService';

// Export all types
export * from './types';

// Registry of all evaluators
const evaluatorRegistry: EvaluatorRegistry = new Map();

// Register built-in evaluators
evaluatorRegistry.set('survivor', survivorEvaluator);
evaluatorRegistry.set('pickem', pickemEvaluator);
evaluatorRegistry.set('pick-em', pickemEvaluator); // alias
evaluatorRegistry.set('confidence', confidenceEvaluator);
evaluatorRegistry.set('ats', pickemEvaluator);
evaluatorRegistry.set('bracket', bracketEvaluator);
evaluatorRegistry.set('squares', squaresEvaluator);
evaluatorRegistry.set('props', propsEvaluator);
evaluatorRegistry.set('streak', streakEvaluator);
evaluatorRegistry.set('upset', upsetEvaluator);
evaluatorRegistry.set('stat', statEvaluator);
evaluatorRegistry.set('special', specialEvaluator);
evaluatorRegistry.set('bundle', bundleEvaluator);
evaluatorRegistry.set('bundle_pool', bundleEvaluator);

/**
 * Get an evaluator for a pool type
 */
export function getEvaluator(poolType: string): PoolEvaluator | undefined {
  const normalized = poolType.toLowerCase();
  return evaluatorRegistry.get(normalized) || evaluatorRegistry.get(getPoolTypeFromFormat(normalized));
}

/**
 * Get the survivor evaluator specifically (for backwards compatibility)
 */
export function getSurvivorEvaluator(): PoolEvaluator {
  return survivorEvaluator;
}

/**
 * Register a custom evaluator
 */
export function registerEvaluator(evaluator: PoolEvaluator): void {
  evaluatorRegistry.set(evaluator.poolType.toLowerCase(), evaluator);
}

/**
 * Check if an evaluator exists for a pool type
 */
export function hasEvaluator(poolType: string): boolean {
  return evaluatorRegistry.has(poolType.toLowerCase());
}

/**
 * Get all registered pool types
 */
export function getRegisteredPoolTypes(): string[] {
  return Array.from(evaluatorRegistry.keys());
}

/**
 * Map format_key to evaluator pool type
 * Handles variations in naming conventions
 */
export function getPoolTypeFromFormat(formatKey: string): string {
  const canonical = getCanonicalPoolType(formatKey);
  if (canonical) return canonical;
  return formatKey.toLowerCase();
}

// Export individual evaluators for direct use
export { survivorEvaluator } from './survivorEvaluator';
export { pickemEvaluator } from './pickemEvaluator';
export { confidenceEvaluator } from './confidenceEvaluator';
export { streakEvaluator } from './streakEvaluator';
export { upsetEvaluator } from './upsetEvaluator';
export { statEvaluator } from './statEvaluator';
export { specialEvaluator } from './specialEvaluator';
export { bracketEvaluator } from './bracketEvaluator';
export { squaresEvaluator } from './squaresEvaluator';
export { propsEvaluator } from './propsEvaluator';
export { bundleEvaluator } from './bundleEvaluator';
