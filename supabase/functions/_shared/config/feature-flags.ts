// ──────────────────────────────────────────────
// Feature Flags
// ──────────────────────────────────────────────

export const features = {
  // Core Modules
  enableAI: Deno.env.get('FEATURE_AI') !== 'false',
  enableScraping: Deno.env.get('FEATURE_SCRAPING') !== 'false',
  enableScoring: Deno.env.get('FEATURE_SCORING') !== 'false',
  enableCostTracking: Deno.env.get('FEATURE_COST_TRACKING') !== 'false',
  
  // Limits
  maxImportPages: parseInt(Deno.env.get('MAX_IMPORT_PAGES') || '3', 10),
  maxConcurrentJobs: parseInt(Deno.env.get('MAX_CONCURRENT_JOBS') || '1', 10),
};
