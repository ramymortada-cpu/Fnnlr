import type { Brain } from '../gateway.js';
import { extractJson } from '../gateway.js';
import { INTENTS, classifyCommand, type Intent } from '../../../../modules/command/src/intents.js';

/**
 * CommandBrain — classifies an Arabic command into fnnlr's CLOSED intent set,
 * using the provided context. Not an open assistant: the output intent must be
 * one of INTENTS, else 'clarify'. Fallback is the deterministic classifier so
 * no command silently fails and nothing is hallucinated.
 */

export interface CommandContext {
  tab?: string;
  funnelName?: string;
  hasOffer?: boolean;
  hasPage?: boolean;
  biggestLeakTitle?: string | null;
  waitingPaymentCount?: number;
  leadsNeedingAction?: number;
  selectedLeadId?: string | null;
  selectedLeakId?: string | null;
}

export interface CommandInput {
  text: string;
  context: CommandContext;
}

export interface CommandClassification {
  intent: Intent;
  confidence: 'low' | 'medium' | 'high';
  explanation: string;
  safetyNotes: string;
}

export const CommandBrain: Brain<CommandInput, CommandClassification> = {
  name: 'command',
  promptVersion: 'v1',

  buildPrompt(input) {
    const system = [
      'You are fnnlr\'s revenue-copilot command classifier — NOT a chatbot.',
      'Map the user\'s Arabic command to EXACTLY ONE intent from the allowed list.',
      'Use the provided context. If you are not confident, return intent "clarify".',
      'Never invent an action outside the list. Return ONLY JSON.',
    ].join(' ');
    const user = [
      `Allowed intents: ${INTENTS.join(', ')}`,
      `Context: ${JSON.stringify(input.context)}`,
      `Command: "${input.text}"`,
      '',
      'Return JSON: intent (one of the allowed), confidence (low|medium|high), explanation (Arabic, short), safetyNotes (Arabic, short).',
    ].join('\n');
    return { system, user };
  },

  parse(raw) {
    const o = extractJson(raw) as Partial<CommandClassification>;
    if (!o.intent || !INTENTS.includes(o.intent as Intent)) {
      throw new Error('Command: invalid/missing intent');
    }
    return {
      intent: o.intent as Intent,
      confidence: (o.confidence as any) ?? 'medium',
      explanation: o.explanation ?? '',
      safetyNotes: o.safetyNotes ?? '',
    };
  },

  /** Deterministic classification — used with no LLM key. */
  fallback(input) {
    const { intent, confidence } = classifyCommand(input.text);
    return {
      intent,
      confidence,
      explanation: intent === 'clarify'
        ? 'مش متأكّد من المطلوب — محتاج توضيح.'
        : 'تم تحديد الأمر من الكلمات المفتاحية.',
      safetyNotes: 'مفيش تنفيذ مدمّر من غير موافقة.',
    };
  },
};
