// ──────────────────────────────────────────────
// Gemini Service (Stateless) - Phase 1.7
// ──────────────────────────────────────────────

import { PromptTemplate, ConsultantAnalysisResult, SalesGenerationResult } from './types.ts';
import { AiValidator } from './validator.ts';
import { Logger } from '../observability/logger.ts';
import { GoogleGenAI, Type } from "npm:@google/genai";

// ─── Top-level consultant response schema ────────────────────────────────────
const consultantResponseSchema = {
  type: Type.OBJECT,
  properties: {
    business_summary:             { type: Type.STRING },
    business_summary_confidence:  { type: Type.NUMBER },
    sales_angle:                  { type: Type.STRING },
    lead_score:                   { type: Type.NUMBER },
    score_explanation:            { type: Type.STRING },
    confidence_score:             { type: Type.STRING },
  },
  required: [
    'business_summary', 'business_summary_confidence',
    'sales_angle', 'lead_score', 'score_explanation', 'confidence_score',
  ],
};

export class GeminiService {
  private ai: GoogleGenAI;

  constructor(private logger: Logger) {
    const config: any = {
      vertexai: true,
      project: 'gen-lang-client-0841388254',
      location: 'us-central1'
    };

    const gcpServiceAccountKey = Deno.env.get('GCP_SERVICE_ACCOUNT_KEY');
    
    if (gcpServiceAccountKey) {
      try {
        config.googleAuthOptions = {
          credentials: JSON.parse(gcpServiceAccountKey)
        };
      } catch (err) {
        this.logger.error("Failed to parse GCP_SERVICE_ACCOUNT_KEY", err as Error);
      }
    } else {
      const apiKeyOverride = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('VERTEX_AI_API_KEY');
      if (apiKeyOverride) {
        config.vertexai = false;
        config.apiKey = apiKeyOverride;
      } else {
        throw new Error('Neither GCP_SERVICE_ACCOUNT_KEY nor GEMINI_API_KEY are configured.');
      }
    }

    this.ai = new GoogleGenAI(config);
  }

  private async generateWithRetry(model: string, contents: any[], config: any, timeoutMs: number, maxRetries = 3): Promise<any> {
    let attempt = 0;
    while (attempt < maxRetries) {
      const startTime = performance.now();
      
      try {
        // We use Promise.race to enforce timeout since the SDK might not have a strict timeout property exposed
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('AI_TIMEOUT')), timeoutMs)
        );
        
        const response: any = await Promise.race([
          this.ai.models.generateContent({
            model,
            contents,
            config
          }),
          timeoutPromise
        ]);

        return response;
      } catch (error: any) {
        const isRateLimit = error?.status === 429 || error?.status === 503 || error?.message?.includes('429');
        const isTimeout = error?.message === 'AI_TIMEOUT' || error?.name === 'AbortError';
        
        if ((isRateLimit || isTimeout) && attempt < maxRetries - 1) {
          attempt++;
          const backoff = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
          this.logger.warn(`gemini.retry`, { attempt, isTimeout, isRateLimit, backoff });
          await new Promise(res => setTimeout(res, backoff));
          continue;
        }

        throw error;
      }
    }
  }

  async analyze(
    userPrompt: string,
    template: PromptTemplate,
    model = 'gemini-2.5-flash',
    context: any = {}
  ): Promise<{ result: ConsultantAnalysisResult; tokens: { input: number; output: number } }> {
    const sysInstructionString = typeof template.systemInstruction === 'function' 
      ? template.systemInstruction(context) 
      : template.systemInstruction;

    const startTime = performance.now();

    try {
      const response = await this.generateWithRetry(
        model,
        [{ role: 'user', parts: [{ text: userPrompt }] }],
        {
          systemInstruction: sysInstructionString,
          responseMimeType: 'application/json',
          responseSchema: consultantResponseSchema,
          temperature: 0.2,
        },
        90_000,
        4
      );

      const rawText = typeof response.text === 'function' ? response.text() : response.text;
      if (!rawText) throw new Error('No content returned from Gemini');

      const parsedJson = JSON.parse(rawText);
      const validatedResult = AiValidator.validate(parsedJson);

      const usage = response.usageMetadata || {};
      const tokens = {
        input: usage.promptTokenCount || 0,
        output: usage.candidatesTokenCount || 0,
      };

      this.logger.info('gemini.analyze_success', {
        durationMs: Math.round(performance.now() - startTime),
        tokens,
      });

      return { result: validatedResult, tokens };

    } catch (error: any) {
      if (error.message === 'AI_TIMEOUT') {
        this.logger.error('gemini.analyze_timeout', error, {
          durationMs: Math.round(performance.now() - startTime),
        });
      } else {
        this.logger.error('gemini.analyze_failed', error, {
          durationMs: Math.round(performance.now() - startTime),
        });
      }
      throw error;
    }
  }

  async generateSales(
    userPrompt: string,
    template: PromptTemplate,
    model = 'gemini-2.5-flash',
    context: any = {}
  ): Promise<{ result: SalesGenerationResult; tokens: { input: number; output: number } }> {
    const schema = {
      type: Type.OBJECT,
      properties: {
        selected_offer_slug: { type: Type.STRING },
        selection_reason:    { type: Type.STRING },
        urgency:             { type: Type.STRING },
        email_subject:       { type: Type.STRING },
        email_body:          { type: Type.STRING },
        whatsapp_message:    { type: Type.STRING },
        cold_call_script: {
          type: Type.OBJECT,
          properties: {
            hook:                { type: Type.STRING },
            pitch:               { type: Type.STRING },
            objection_handling:  { type: Type.STRING },
          },
          required: ['hook', 'pitch', 'objection_handling'],
        },
        follow_up_sequence: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              day:     { type: Type.INTEGER },
              channel: { type: Type.STRING },
              goal:    { type: Type.STRING },
              message: { type: Type.STRING },
            },
            required: ['day', 'channel', 'goal', 'message'],
          },
        },
      },
      required: [
        'selected_offer_slug', 'selection_reason', 'urgency',
        'email_subject', 'email_body', 'whatsapp_message',
        'cold_call_script', 'follow_up_sequence',
      ],
    };

    const sysInstructionString = typeof template.systemInstruction === 'function' 
      ? template.systemInstruction(context) 
      : template.systemInstruction;

    const startTime = performance.now();

    try {
      const response = await this.generateWithRetry(
        model,
        [{ role: 'user', parts: [{ text: userPrompt }] }],
        {
          systemInstruction: sysInstructionString,
          responseMimeType: 'application/json',
          responseSchema: schema,
          temperature: 0.4,
        },
        60_000,
        4
      );

      const rawText = typeof response.text === 'function' ? response.text() : response.text;
      if (!rawText) throw new Error('No content returned from Gemini');

      const result = JSON.parse(rawText) as SalesGenerationResult;

      const usage = response.usageMetadata || {};
      const tokens = {
        input: usage.promptTokenCount || 0,
        output: usage.candidatesTokenCount || 0,
      };

      this.logger.info('gemini.generate_sales_success', {
        durationMs: Math.round(performance.now() - startTime),
        tokens,
        selectedOffer: result.selected_offer_slug,
      });

      return { result, tokens };

    } catch (error: any) {
      if (error.message === 'AI_TIMEOUT') {
        this.logger.error('gemini.generate_sales_timeout', error, {
          durationMs: Math.round(performance.now() - startTime),
        });
      } else {
        this.logger.error('gemini.generate_sales_failed', error, {
          durationMs: Math.round(performance.now() - startTime),
        });
      }
      throw error;
    }
  }
}
