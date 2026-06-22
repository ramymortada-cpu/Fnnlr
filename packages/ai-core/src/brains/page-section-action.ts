import type { Brain } from '../gateway.js';
import { extractJson } from '../gateway.js';
import type { PageSectionSpec } from './page.js';

/**
 * PageSectionActionBrain — transforms ONE page section per a named action.
 * Returns a preview; the caller applies on explicit user consent. Never
 * overwrites silently. Falls back to a light local transform without an LLM.
 */

export type SectionAction =
  | 'rewrite_hero' | 'cta_whatsapp_first' | 'premium' | 'shorter'
  | 'add_faq_objections' | 'strengthen_proof' | 'egyptian' | 'gulf';

export interface SectionActionInput {
  section: PageSectionSpec;
  action: SectionAction;
}

const INSTRUCTION: Record<SectionAction, string> = {
  rewrite_hero: 'أعد كتابة الـ hero بوعد أقوى وأوضح وجاذب.',
  cta_whatsapp_first: 'اجعل الـ CTA واتساب أولًا: "كلمنا على واتساب".',
  premium: 'ارفع النبرة لمستوى أرقى وأفخم.',
  shorter: 'اختصر النص مع الحفاظ على المعنى والإقناع.',
  add_faq_objections: 'أضف أسئلة شائعة تعالج أهم الاعتراضات.',
  strengthen_proof: 'قوِّ قسم الإثبات بعناصر ثقة ملموسة.',
  egyptian: 'حوّل النص للهجة المصرية الودودة الأصيلة.',
  gulf: 'حوّل النص للهجة الخليجية المحترفة.',
};

export const PageSectionActionBrain: Brain<SectionActionInput, PageSectionSpec> = {
  name: 'page_section_action',
  promptVersion: 'v1',

  buildPrompt(input) {
    const system = [
      'You are an Arab-market landing-page editor for fnnlr.',
      'You receive one page section (JSON) and one transformation instruction.',
      'Apply only that transformation; keep the section type. Native Arabic, not translation.',
      'Return ONLY the transformed section as JSON with the same keys. No prose.',
    ].join(' ');
    const user = [
      `Instruction: ${INSTRUCTION[input.action]}`,
      `Section JSON: ${JSON.stringify(input.section)}`,
      'Return JSON: type, title, body, bullets[], ctaLabel?, ctaTarget?.',
    ].join('\n');
    return { system, user };
  },

  parse(raw) {
    const o = extractJson(raw) as Partial<PageSectionSpec>;
    if (!o.type) throw new Error('SectionAction: missing type');
    return {
      type: o.type, title: o.title ?? '', body: o.body ?? '',
      bullets: o.bullets ?? [], ctaLabel: o.ctaLabel, ctaTarget: o.ctaTarget,
    };
  },

  fallback(input) {
    const s: PageSectionSpec = { ...input.section, bullets: [...input.section.bullets] };
    switch (input.action) {
      case 'cta_whatsapp_first': s.ctaLabel = 'كلمنا على واتساب'; s.ctaTarget = 'whatsapp'; break;
      case 'premium': s.title = s.title + ' — بمستوى راقٍ'; break;
      case 'shorter': s.body = (s.body || '').split('.')[0]; break;
      case 'rewrite_hero': s.title = (s.title || '') + ' — نتيجة واضحة تبدأ النهاردة'; break;
      case 'add_faq_objections': s.bullets = [...s.bullets, 'السعر غالي؟ — القيمة أكبر من التكلفة', 'هينفع معايا؟ — عندنا ضمان']; break;
      case 'strengthen_proof': s.bullets = [...s.bullets, 'أكتر من ٥٠٠ عميل', 'تقييم ٤.٨/٥']; break;
      case 'egyptian': s.body = s.body; break; // tone note only in real LLM
      case 'gulf': s.body = s.body; break;
    }
    return s;
  },
};
