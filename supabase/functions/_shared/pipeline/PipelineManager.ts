// ──────────────────────────────────────────────
// Data Quality Engine (Phase 2 Scaffold)
// Pipeline Manager for sequential execution
// ──────────────────────────────────────────────

import { CanonicalBusinessProfile } from '../types/canonical.ts';

export interface PipelineContext {
  businessId: string;
  projectId: string;
  rawInput: any;
  profile?: CanonicalBusinessProfile;
  errors: Error[];
  warnings: string[];
}

export interface PipelineStage {
  name: string;
  execute(context: PipelineContext): Promise<PipelineContext>;
}

export class PipelineManager {
  private stages: PipelineStage[] = [];

  constructor(public context: PipelineContext) {}

  addStage(stage: PipelineStage): this {
    this.stages.push(stage);
    return this;
  }

  async run(): Promise<PipelineContext> {
    for (const stage of this.stages) {
      try {
        console.log(`[Pipeline] Executing Stage: ${stage.name}`);
        this.context = await stage.execute(this.context);
      } catch (err: any) {
        console.error(`[Pipeline Error] Stage ${stage.name} failed:`, err);
        this.context.errors.push(err);
        // Depending on strictness, we might throw here or continue
        throw new Error(`Pipeline halted at stage ${stage.name}: ${err.message}`);
      }
    }
    return this.context;
  }
}

// ─── Example Stages (To be implemented in future steps) ───

export class NormalizerStage implements PipelineStage {
  name = 'Normalizer';
  async execute(context: PipelineContext): Promise<PipelineContext> {
    // 1. Clean URLs (remove trailing slashes, www)
    // 2. Format Phone Numbers (E.164)
    // 3. Lowercase emails
    return context;
  }
}

export class ValidatorStage implements PipelineStage {
  name = 'Validator';
  async execute(context: PipelineContext): Promise<PipelineContext> {
    // 1. Ping domains to check if active
    // 2. Validate email syntax
    return context;
  }
}

export class ProfileBuilderStage implements PipelineStage {
  name = 'ProfileBuilder';
  async execute(context: PipelineContext): Promise<PipelineContext> {
    // Use ProfileBuilder to construct the CanonicalBusinessProfile
    // context.profile = await profileBuilder.build(context.businessId);
    return context;
  }
}
