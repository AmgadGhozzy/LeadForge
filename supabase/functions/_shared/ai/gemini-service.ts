// ──────────────────────────────────────────────
// Gemini Service (Stateless) - Phase 1.7
// ──────────────────────────────────────────────

import { PromptTemplate, ConsultantAnalysisResult, SalesGenerationResult } from './types.ts';
import { AiValidator } from './validator.ts';
import { Logger } from '../observability/logger.ts';

// ─── Trimmed EvidenceItem schema ────────────────────────────────────────────
// ─── Top-level consultant response schema ────────────────────────────────────
const consultantResponseSchema = {
  type: 'OBJECT',
  properties: {
    business_summary:             { type: 'STRING' },
    business_summary_confidence:  { type: 'NUMBER' },
    sales_angle:                  { type: 'STRING' },
    lead_score:                   { type: 'NUMBER' },
    score_explanation:            { type: 'STRING' },
    confidence_score:             { type: 'STRING' },
  },
  required: [
    'business_summary', 'business_summary_confidence',
    'sales_angle', 'lead_score', 'score_explanation', 'confidence_score',
  ],
};

export class GeminiService {
  private apiKey: string;
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';

  constructor(private logger: Logger) {
    const key = Deno.env.get('GEMINI_API_KEY');
    if (!key) throw new Error('GEMINI_API_KEY is missing');
    this.apiKey = key;
  }

  async analyze(
    userPrompt: string,
    template: PromptTemplate,
    model = 'gemini-2.5-flash',
    context: any = {}
  ): Promise<{ result: ConsultantAnalysisResult; tokens: { input: number; output: number } }> {
    const url = `${this.baseUrl}/${model}:generateContent?key=${this.apiKey}`;

    const sysInstructionString = typeof template.systemInstruction === 'function' 
      ? template.systemInstruction(context) 
      : template.systemInstruction;

    const payload = {
      system_instruction: { parts: [{ text: sysInstructionString }] },
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: consultantResponseSchema,
        temperature: 0.2,
      },
    };

    const startTime = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Gemini API Error: ${response.status} - ${errBody}`);
      }

      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error('No content returned from Gemini');

      const parsedJson = JSON.parse(rawText);
      const validatedResult = AiValidator.validate(parsedJson);

      const usage = data.usageMetadata || {};
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
      clearTimeout(timeout);
      if (error.name === 'AbortError') {
        this.logger.error('gemini.analyze_timeout', new Error('AI_TIMEOUT'), {
          durationMs: Math.round(performance.now() - startTime),
        });
        throw new Error('AI_TIMEOUT');
      }
      this.logger.error('gemini.analyze_failed', error, {
        durationMs: Math.round(performance.now() - startTime),
      });
      throw error;
    }
  }

  async generateSales(
    userPrompt: string,
    template: PromptTemplate,
    model = 'gemini-2.5-flash',
    context: any = {}
  ): Promise<{ result: SalesGenerationResult; tokens: { input: number; output: number } }> {
    const url = `${this.baseUrl}/${model}:generateContent?key=${this.apiKey}`;

    const schema = {
      type: 'OBJECT',
      properties: {
        selected_offer_slug: { type: 'STRING' },
        selection_reason:    { type: 'STRING' },
        urgency:             { type: 'STRING' },
        email_subject:       { type: 'STRING' },
        email_body:          { type: 'STRING' },
        whatsapp_message:    { type: 'STRING' },
        cold_call_script: {
          type: 'OBJECT',
          properties: {
            hook:                { type: 'STRING' },
            pitch:               { type: 'STRING' },
            objection_handling:  { type: 'STRING' },
          },
          required: ['hook', 'pitch', 'objection_handling'],
        },
        follow_up_sequence: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              day:     { type: 'INTEGER' },
              channel: { type: 'STRING' },
              goal:    { type: 'STRING' },
              message: { type: 'STRING' },
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

    const payload = {
      system_instruction: { parts: [{ text: sysInstructionString }] },
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: schema,
        temperature: 0.4,
      },
    };

    const startTime = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Gemini API Error: ${response.status} - ${errBody}`);
      }

      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error('No content returned from Gemini');

      const result = JSON.parse(rawText) as SalesGenerationResult;

      const usage = data.usageMetadata || {};
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
      clearTimeout(timeout);
      if (error.name === 'AbortError') {
        this.logger.error('gemini.generate_sales_timeout', new Error('AI_TIMEOUT'), {
          durationMs: Math.round(performance.now() - startTime),
        });
        throw new Error('AI_TIMEOUT');
      }
      this.logger.error('gemini.generate_sales_failed', error, {
        durationMs: Math.round(performance.now() - startTime),
      });
      throw error;
    }
  }
}
