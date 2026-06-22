import type { Brain } from '../gateway.js';
import { extractJson } from '../gateway.js';

/**
 * ReportBrain — writes the weekly diagnosis report's narrative in plain Arabic.
 * It only narrates the numbers it's given; it never invents figures or revenue.
 * Fallback is fully rule-based so the report works with no LLM.
 */

export interface ReportInput {
  funnelName: string;
  periodLabel: string;
  enoughData: boolean;
  topLeaks: { title: string; severity: string; fastestFix: string }[];
  biggestLeak: { title: string; fastestFix: string } | null;
  leadsNeedingAction: number;
  paymentStuck: number;
  whatsappClickedNoContact: number;
  pageViews: number;
  ctaClicks: number;
  wins: string[];
  topActions: { title: string; recommendedAction: string }[];
}

export interface ReportOutput {
  executiveSummary: string;
  topPriorities: string[];
  narrative: string;
  nextWeekFocus: string;
  ownerMessage: string;
}

export const ReportBrain: Brain<ReportInput, ReportOutput> = {
  name: 'report',
  promptVersion: 'v1',

  buildPrompt(input) {
    const system = [
      'You are fnnlr\'s revenue analyst writing a weekly funnel diagnosis for an Arab SMB owner.',
      'Write plain, practical Egyptian-Arabic. Narrate ONLY the numbers provided — never invent figures or revenue.',
      'Be honest if data is insufficient. Return ONLY JSON.',
    ].join(' ');
    const user = [
      `Funnel: ${input.funnelName} · Period: ${input.periodLabel} · enoughData: ${input.enoughData}`,
      `Top leaks: ${JSON.stringify(input.topLeaks)}`,
      `Biggest leak: ${JSON.stringify(input.biggestLeak)}`,
      `Leads needing action: ${input.leadsNeedingAction} · Payment stuck: ${input.paymentStuck} · WA clicked-no-contact: ${input.whatsappClickedNoContact}`,
      `Page views: ${input.pageViews} · CTA clicks: ${input.ctaClicks}`,
      `Wins: ${JSON.stringify(input.wins)} · Top actions: ${JSON.stringify(input.topActions)}`,
      '',
      'Return JSON: executiveSummary, topPriorities[], narrative, nextWeekFocus, ownerMessage.',
    ].join('\n');
    return { system, user };
  },

  parse(raw) {
    const o = extractJson(raw) as Partial<ReportOutput>;
    if (!o.executiveSummary) throw new Error('Report: missing executiveSummary');
    return {
      executiveSummary: o.executiveSummary,
      topPriorities: Array.isArray(o.topPriorities) ? o.topPriorities : [],
      narrative: o.narrative ?? '',
      nextWeekFocus: o.nextWeekFocus ?? '',
      ownerMessage: o.ownerMessage ?? '',
    };
  },

  fallback(input) {
    if (!input.enoughData) {
      return {
        executiveSummary: `لسه مفيش بيانات مرصودة كفاية عن «${input.funnelName}» للفترة دي. فعّل التتبّع وانشر الصفحة وابدأ تجيب ضغطات عشان نقدر نشخّص.`,
        topPriorities: ['فعّل التتبّع', 'انشر صفحة الهبوط', 'أنشئ رابط واتساب متتبَّع'],
        narrative: 'التشخيص بيشتغل على بيانات حقيقية بس — مش هنفبرك أرقام.',
        nextWeekFocus: 'جهّز التتبّع عشان تقرير الأسبوع الجاي يبقى مفيد.',
        ownerMessage: 'خطوتك دلوقتي: فعّل التتبّع.',
      };
    }
    const biggest = input.biggestLeak ? `أكبر تسريب الأسبوع ده: ${input.biggestLeak.title} — أسرع إصلاح: ${input.biggestLeak.fastestFix}.` : 'مفيش تسريب حرِج واضح الأسبوع ده.';
    const priorities = [
      ...input.topActions.slice(0, 5).map((a) => `${a.title} — ${a.recommendedAction}`),
    ];
    const summary = [
      `تقرير «${input.funnelName}» — ${input.periodLabel}.`,
      biggest,
      `عندك ${input.leadsNeedingAction} عميل محتاج تحرّك، و${input.paymentStuck} في الدفع متوقف، و${input.whatsappClickedNoContact} ضغطوا واتساب من غير رد.`,
      input.pageViews ? `الصفحة جابت ${input.pageViews} زيارة و${input.ctaClicks} ضغطة CTA.` : '',
    ].filter(Boolean).join(' ');
    return {
      executiveSummary: summary,
      topPriorities: priorities.length ? priorities : ['تابع العملاء المحتاجين تحرّك'],
      narrative: input.topLeaks.length
        ? 'أهم التسريبات: ' + input.topLeaks.map((l) => `${l.title} (${l.severity}) — ${l.fastestFix}`).join('؛ ') + '.'
        : 'مفيش تسريبات كبيرة الأسبوع ده.',
      nextWeekFocus: input.biggestLeak ? `ركّز على: ${input.biggestLeak.fastestFix}` : 'حافظ على المتابعة السريعة والدفع المنظّم.',
      ownerMessage: input.wins.length ? `مكسب الأسبوع: ${input.wins[0]}. كمّل كده 💪` : 'في إجراءات واضحة قدامك الأسبوع ده — ابدأ بالأهم.',
    };
  },
};
