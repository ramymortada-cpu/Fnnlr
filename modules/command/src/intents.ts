/**
 * Command taxonomy + deterministic Arabic classifier. PURE and testable.
 * The Command Bar is a revenue copilot bound to fnnlr objects — a CLOSED set of
 * intents, never an open chatbot. If nothing matches, we ask for clarification
 * rather than hallucinate an action.
 */

export const INTENTS = [
  // offer
  'improve_offer', 'rewrite_offer_tone', 'strengthen_objections', 'improve_cta', 'make_offer_premium',
  // page
  'rewrite_page_section', 'improve_page_cta', 'shorten_page', 'make_page_whatsapp_first', 'improve_proof', 'fix_page_leak',
  // whatsapp
  'draft_whatsapp_reply', 'rewrite_whatsapp_template', 'create_followup_message', 'respond_to_objection', 'generate_payment_reminder',
  // payment
  'create_payment_followup', 'explain_payment_steps', 'fix_waiting_payment_leak', 'find_stuck_payments',
  // leads
  'find_leads_needing_action', 'find_waiting_payment_leads', 'find_whatsapp_clicked_not_contacted', 'create_tasks_for_leads', 'draft_followup_for_filtered_leads',
  // leaks
  'explain_biggest_leak', 'suggest_fastest_fix', 'create_actions_from_leak', 'mark_leak_fixing', 'open_affected_leads',
  // report
  'summarize_week', 'create_team_report', 'explain_what_changed', 'generate_next_week_focus',
  // playbooks (Sprint 20)
  'explain_playbook', 'explain_funnel_reasoning', 'what_learned_payment',
  // playbook application (Sprint 21)
  'apply_best_playbook', 'optimize_funnel_from_learning', 'apply_page_playbook', 'apply_whatsapp_playbook', 'apply_payment_playbook',
  // playbook application outcomes (Sprint 22)
  'measure_application_outcome', 'did_application_work', 'what_learned_application',
  // portfolio intelligence (Sprint 23)
  'compare_funnels', 'strongest_funnel', 'weakest_funnel', 'funnels_needing_repair', 'best_offer_angle', 'transfer_playbook',
  // scheduled intelligence (Sprint 24)
  'refresh_business_intelligence', 'weekly_business_report', 'what_needs_measuring', 'what_is_overdue', 'refresh_portfolio_insights', 'measure_all_due',
  // revenue opportunities (Sprint 25)
  'nearest_revenue', 'list_opportunities', 'fastest_opportunity', 'leads_closest_to_payment', 'open_payment_opportunities', 'tasks_for_top_opportunities', 'summarize_opportunities', 'known_value_opportunities',
  // opportunity outcomes (Sprint 26)
  'which_opportunities_captured', 'what_learned_opportunities', 'check_opportunity_outcome', 'rank_by_conversion', 'high_priority_not_converting',
  // revenue attribution (Sprint 27)
  'what_drove_capture', 'which_actions_convert', 'best_action_for_waiting_payment', 'do_whatsapp_replies_work', 'rank_by_working_actions', 'explain_attribution',
  // action recommendations (Sprint 28)
  'what_to_do_now', 'best_action_for_opportunity', 'top_actions_today', 'rank_actions_by_conversion', 'write_suggested_message', 'task_for_best_opportunity',
  // recommendation outcomes (Sprint 29)
  'did_recommendation_work', 'measure_recommendation_outcomes', 'which_recommendations_worked', 'rank_recommendations_by_result', 'which_recommendations_fail', 'what_learned_recommendations',
  // revenue desk (Sprint 33)
  'open_revenue_desk', 'top_five_things', 'whats_waiting_approval', 'whats_needs_measurement', 'whats_blocked',
  // activation (Sprint 36)
  'continue_activation', 'whats_needed_to_publish', 'first_step_now', 'is_funnel_ready', 'where_first_signal', 'open_activation',
  // navigation
  'open_offer', 'open_page', 'open_leads', 'open_leaks', 'open_payment', 'open_whatsapp', 'open_report',
  // fallback
  'clarify',
] as const;
export type Intent = typeof INTENTS[number];

export type ResultType = 'informational' | 'navigation' | 'draft' | 'update' | 'task' | 'status' | 'bulk' | 'clarify';

/** What kind of approval each intent needs. Drives the UI buttons + safety. */
export const RESULT_TYPE: Record<Intent, ResultType> = {
  improve_offer: 'update', rewrite_offer_tone: 'update', strengthen_objections: 'update', improve_cta: 'update', make_offer_premium: 'update',
  rewrite_page_section: 'update', improve_page_cta: 'update', shorten_page: 'update', make_page_whatsapp_first: 'update', improve_proof: 'update', fix_page_leak: 'draft',
  draft_whatsapp_reply: 'draft', rewrite_whatsapp_template: 'update', create_followup_message: 'draft', respond_to_objection: 'draft', generate_payment_reminder: 'draft',
  create_payment_followup: 'draft', explain_payment_steps: 'informational', fix_waiting_payment_leak: 'informational', find_stuck_payments: 'navigation',
  find_leads_needing_action: 'navigation', find_waiting_payment_leads: 'navigation', find_whatsapp_clicked_not_contacted: 'navigation',
  create_tasks_for_leads: 'bulk', draft_followup_for_filtered_leads: 'draft',
  explain_biggest_leak: 'informational', suggest_fastest_fix: 'informational', create_actions_from_leak: 'task', mark_leak_fixing: 'status', open_affected_leads: 'navigation',
  summarize_week: 'informational', create_team_report: 'informational', explain_what_changed: 'informational', generate_next_week_focus: 'informational',
  explain_playbook: 'informational', explain_funnel_reasoning: 'informational', what_learned_payment: 'informational',
  apply_best_playbook: 'update', optimize_funnel_from_learning: 'update', apply_page_playbook: 'update', apply_whatsapp_playbook: 'update', apply_payment_playbook: 'update',
  measure_application_outcome: 'informational', did_application_work: 'informational', what_learned_application: 'informational',
  compare_funnels: 'informational', strongest_funnel: 'informational', weakest_funnel: 'informational', funnels_needing_repair: 'informational', best_offer_angle: 'informational', transfer_playbook: 'informational',
  refresh_business_intelligence: 'task', weekly_business_report: 'informational', what_needs_measuring: 'informational', what_is_overdue: 'informational', refresh_portfolio_insights: 'task', measure_all_due: 'task',
  nearest_revenue: 'informational', list_opportunities: 'navigation', fastest_opportunity: 'informational', leads_closest_to_payment: 'informational', open_payment_opportunities: 'navigation', tasks_for_top_opportunities: 'task', summarize_opportunities: 'informational', known_value_opportunities: 'informational',
  which_opportunities_captured: 'informational', what_learned_opportunities: 'informational', check_opportunity_outcome: 'informational', rank_by_conversion: 'task', high_priority_not_converting: 'informational',
  what_drove_capture: 'informational', which_actions_convert: 'informational', best_action_for_waiting_payment: 'informational', do_whatsapp_replies_work: 'informational', rank_by_working_actions: 'task', explain_attribution: 'informational',
  what_to_do_now: 'informational', best_action_for_opportunity: 'informational', top_actions_today: 'informational', rank_actions_by_conversion: 'task', write_suggested_message: 'draft', task_for_best_opportunity: 'task',
  did_recommendation_work: 'informational', measure_recommendation_outcomes: 'task', which_recommendations_worked: 'informational', rank_recommendations_by_result: 'task', which_recommendations_fail: 'informational', what_learned_recommendations: 'informational',
  open_revenue_desk: 'navigation', top_five_things: 'informational', whats_waiting_approval: 'informational', whats_needs_measurement: 'informational', whats_blocked: 'informational',
  continue_activation: 'navigation', whats_needed_to_publish: 'informational', first_step_now: 'informational', is_funnel_ready: 'informational', where_first_signal: 'informational', open_activation: 'navigation',
  open_offer: 'navigation', open_page: 'navigation', open_leads: 'navigation', open_leaks: 'navigation', open_payment: 'navigation', open_whatsapp: 'navigation', open_report: 'navigation',
  clarify: 'clarify',
};

const has = (s: string, ...words: string[]) => words.every((w) => s.includes(w));
const any = (s: string, ...words: string[]) => words.some((w) => s.includes(w));

/**
 * Deterministic classifier — used as the LLM fallback and as a fast path.
 * Returns the best-matching intent, or 'clarify' if nothing is confident.
 */
export function classifyCommand(textRaw: string): { intent: Intent; confidence: 'low' | 'medium' | 'high' } {
  const s = textRaw.trim();
  const med = (intent: Intent) => ({ intent, confidence: 'medium' as const });
  const hi = (intent: Intent) => ({ intent, confidence: 'high' as const });

  // recommendation outcomes (Sprint 29) — "اشتغلت/نتيجة/جابت" must win over generic recommendation
  if (any(s, 'التوصية', 'التوصيه') && any(s, 'اشتغلت', 'نجحت', 'اشتغل')) return hi('did_recommendation_work');
  if (any(s, 'قيس', 'اقيس') && any(s, 'التوصيات', 'توصيات')) return hi('measure_recommendation_outcomes');
  if (any(s, 'التوصيات', 'توصيات') && any(s, 'جابت', 'اشتغلت', 'نجحت') && any(s, 'نتيجة', 'اللي')) return hi('which_recommendations_worked');
  if (any(s, 'رتّب', 'رتب') && any(s, 'التوصيات', 'توصيات') && any(s, 'اشتغل', 'النتيجة', 'اللي')) return hi('rank_recommendations_by_result');
  if (any(s, 'التوصيات', 'توصيات') && any(s, 'مش', 'ماهيش') && any(s, 'بتشتغل', 'بتنفع')) return hi('which_recommendations_fail');
  if (any(s, 'اتعلمنا', 'اتعلّمنا') && any(s, 'التوصيات', 'توصيات')) return hi('what_learned_recommendations');

  // activation (Sprint 36) — getting a real business live
  if (any(s, 'كمّل', 'كمل', 'أكمل', 'اكمل') && any(s, 'تفعيل', 'التفعيل', 'تنشيط')) return hi('continue_activation');
  if (any(s, 'افتح') && any(s, 'تفعيل', 'التفعيل')) return hi('open_activation');
  if (any(s, 'تفعيل', 'التفعيل') && any(s, 'البيزنس', 'الفانل', 'القمع')) return hi('open_activation');
  if (any(s, 'ناقص', 'محتاج', 'عايز') && any(s, 'أنشر', 'انشر', 'النشر', 'publish')) return hi('whats_needed_to_publish');
  if (any(s, 'أول', 'اول') && any(s, 'خطوة', 'حاجة') && any(s, 'دلوقتي', 'أعمل', 'اعمل', 'ابدأ')) return hi('first_step_now');
  if (any(s, 'هل', 'الفانل', 'القمع') && any(s, 'جاهز', 'جاهزة', 'ready')) return hi('is_funnel_ready');
  if (any(s, 'فين', 'أين', 'وين') && any(s, 'signal', 'سيجنال', 'إشارة', 'live')) return hi('where_first_signal');

  // revenue desk (Sprint 33) — the unified operating surface (require explicit "مكتب"/"desk" to avoid collisions)
  if (any(s, 'مكتب') && any(s, 'الإيراد', 'الايراد', 'إيراد')) return hi('open_revenue_desk');
  if (any(s, 'desk', 'الديسك')) return hi('open_revenue_desk');
  if (any(s, 'أهم', 'اهم') && any(s, 'خمس', '٥', '5') && any(s, 'حاجات', 'حاجة', 'إجراءات')) return hi('top_five_things');
  if (any(s, 'محتاج', 'عايز', 'اللي') && any(s, 'موافقة', 'موافقه') && any(s, 'دلوقتي', 'إيه', 'ايه', 'حاجة')) return hi('whats_waiting_approval');
  if (any(s, 'فيه', 'في') && any(s, 'واقف', 'واقفة', 'متعطّل', 'متعطل')) return hi('whats_blocked');

  // action recommendations (Sprint 28) — proactive "what to do now"
  if ((any(s, 'اعمل', 'أعمل', 'نعمل') && any(s, 'إيه', 'ايه') && any(s, 'دلوقتي', 'دلوقت', 'النهارده', 'النهاردة')) || has(s, 'إيه', 'الخطوة')) return hi('what_to_do_now');
  if (any(s, 'أفضل', 'افضل', 'احسن', 'أحسن') && any(s, 'إجراء', 'اجراء') && any(s, 'الفرصة', 'للفرصة', 'فرصة')) return hi('best_action_for_opportunity');
  if (any(s, 'أفضل', 'افضل', 'أحسن') && any(s, 'إجراءات', 'اجراءات', '5', '٥', 'خمس') ) return hi('top_actions_today');
  if (any(s, 'رتّب', 'رتب') && any(s, 'الإجراءات', 'إجراءات', 'الاجراءات') && any(s, 'بيحوّل', 'بتحول', 'التحويل', 'بيحول')) return hi('rank_actions_by_conversion');
  if (any(s, 'اكتب', 'أكتب') && any(s, 'الرسالة', 'رسالة') && any(s, 'المقترحة', 'مقترحة', 'المقترح')) return hi('write_suggested_message');
  if (any(s, 'اعمل', 'أعمل') && any(s, 'task', 'مهمة') && any(s, 'أفضل', 'افضل', 'أحسن') && any(s, 'فرصة', 'الفرصة')) return hi('task_for_best_opportunity');

  // revenue attribution (Sprint 27) — "actions/إجراء/attribution/جاب" must win over generic outcome/فرص
  if (any(s, 'attribution') || (any(s, 'اشرح', 'وضّح', 'وضح') && any(s, 'النَسب', 'النسب', 'الإرجاع'))) return hi('explain_attribution');
  if ((any(s, 'إيه', 'ايه', 'اللي', 'مين') && any(s, 'جاب', 'سبب', 'ساعد') && any(s, 'التحصيل', 'التحويل', 'الفلوس')) ) return hi('what_drove_capture');
  if (any(s, 'actions', 'إجراءات', 'الإجراءات') && any(s, 'بتجيب', 'بيجيب', 'بتحوّل', 'بتحول', 'فلوس', 'نتيجة')) return hi('which_actions_convert');
  if (any(s, 'أكتر', 'اكتر', 'أنسب') && any(s, 'إجراء', 'اجراء') && any(s, 'waiting', 'الدفع', 'الانتظار')) return hi('best_action_for_waiting_payment');
  if (any(s, 'واتساب', 'whatsapp', 'رسائل') && any(s, 'بتجيب', 'بتشتغل', 'نتيجة', 'بتنفع')) return hi('do_whatsapp_replies_work');
  if (any(s, 'رتّب', 'رتب') && any(s, 'الفرص', 'فرص') && any(s, 'الإجراءات', 'إجراءات', 'بتشتغل')) return hi('rank_by_working_actions');

  // opportunity outcomes (Sprint 26) — "اتحولت/اتعلمنا" must win over generic "فرص"
  if (any(s, 'اتحولت', 'اتحوّلت', 'اتحصّلت', 'اتحصلت') && any(s, 'فرص', 'الفرص')) return hi('which_opportunities_captured');
  if (any(s, 'اتعلمنا', 'اتعلّمنا') && any(s, 'فرص', 'الفرص')) return hi('what_learned_opportunities');
  if ((any(s, 'قيس') && any(s, 'الفرصة', 'فرصة')) || (any(s, 'اتحصلت', 'اتحصّلت') && any(s, 'الفرصة'))) return hi('check_opportunity_outcome');
  if (any(s, 'رتّب', 'رتب') && any(s, 'الفرص', 'فرص') && any(s, 'بيتحول', 'التحويل', 'بتتحول')) return hi('rank_by_conversion');
  if (any(s, 'عالية', 'أولوية') && any(s, 'مش', 'ماهيش') && any(s, 'بتتحول', 'بيتحول')) return hi('high_priority_not_converting');

  // revenue opportunities (Sprint 25)
  if (has(s, 'أقرب', 'فلوس') || has(s, 'اقرب', 'فلوس') || has(s, 'فين', 'فلوس')) return hi('nearest_revenue');
  if (any(s, 'أسرع', 'اسرع') && any(s, 'فرصة')) return hi('fastest_opportunity');
  if (any(s, 'الأقرب', 'اقرب', 'أقرب') && any(s, 'للدفع', 'الدفع')) return hi('leads_closest_to_payment');
  if (any(s, 'tasks', 'مهام') && any(s, 'فرص', 'الفرص')) return hi('tasks_for_top_opportunities');
  if (any(s, 'لخّص', 'لخص', 'ملخص') && any(s, 'فرص', 'الفرص')) return hi('summarize_opportunities');
  if (any(s, 'قيمتها', 'قيمة') && any(s, 'معروفة')) return hi('known_value_opportunities');
  if (any(s, 'افتح') && any(s, 'فرص') && any(s, 'الدفع', 'دفع')) return hi('open_payment_opportunities');
  if (any(s, 'فرص') && any(s, 'الإيراد', 'إيراد', 'هات', 'الفرص')) return hi('list_opportunities');

  // scheduled intelligence (Sprint 24)
  if ((any(s, 'حدّث', 'حدث', 'شغّل', 'شغل') && any(s, 'ذكاء', 'البيزنس', 'refresh')) || has(s, 'refresh', 'النهاردة')) return hi('refresh_business_intelligence');
  if (any(s, 'تقرير') && any(s, 'أسبوعي', 'اسبوعي', 'البيزنس')) return hi('weekly_business_report');
  if (any(s, 'محتاج', 'محتاجة') && any(s, 'قياس')) return hi('what_needs_measuring');
  if (any(s, 'اتأخر', 'متأخر', 'overdue', 'فات')) return hi('what_is_overdue');
  if (any(s, 'حدّث', 'حدث') && any(s, 'portfolio', 'المحفظة', 'insights')) return hi('refresh_portfolio_insights');
  if (any(s, 'قيس', 'اقيس') && any(s, 'كل') && any(s, 'المستحقة', 'مستحقة', 'الإصلاحات', 'تطبيقات')) return hi('measure_all_due');

  // portfolio (Sprint 23) — cross-funnel comparisons
  if (any(s, 'قارن') && any(s, 'القمعات', 'قمعات')) return hi('compare_funnels');
  if (any(s, 'أقوى', 'اقوى', 'أحسن') && any(s, 'قمع')) return hi('strongest_funnel');
  if (any(s, 'أضعف', 'اضعف') && any(s, 'قمع')) return hi('weakest_funnel');
  if (any(s, 'القمعات', 'قمعات') && any(s, 'إصلاح', 'اصلاح', 'محتاجة')) return hi('funnels_needing_repair');
  if (any(s, 'انقل', 'نقل') && any(s, 'playbook', 'بلايبوك')) return hi('transfer_playbook');
  if (any(s, 'offer', 'العرض', 'عرض') && any(s, 'angle', 'زاوية', 'أفضل', 'افضل') && any(s, 'القمعات', 'قمعات', 'عندي')) return hi('best_offer_angle');

  // playbook application outcomes (Sprint 22) — "قيس/اشتغل/أثر" must win over "طبّق"
  if (any(s, 'قيس', 'اقيس', 're-measure', 'remeasure') && any(s, 'تطبيق', 'playbook', 'التغييرات')) return hi('measure_application_outcome');
  if ((has(s, 'تطبيق', 'اشتغل') || has(s, 'playbook', 'اشتغل')) || (any(s, 'أثر', 'اثر') && any(s, 'التغييرات', 'تطبيق'))) return hi('did_application_work');
  if (has(s, 'اتعلمنا', 'تطبيق') || has(s, 'اتعلمناه', 'تطبيق')) return hi('what_learned_application');

  // playbook application (Sprint 21) — "طبّق ..." must win over "اعرض playbook"
  if (any(s, 'طبّق', 'طبق') && any(s, 'playbook', 'بلايبوك', 'دليل', 'القمع', 'التعلم', 'التعلّم')) {
    if (any(s, 'الصفحة', 'صفحة')) return hi('apply_page_playbook');
    if (any(s, 'واتساب')) return hi('apply_whatsapp_playbook');
    if (any(s, 'الدفع', 'دفع')) return hi('apply_payment_playbook');
    return hi('apply_best_playbook');
  }
  if (has(s, 'optimization', 'plan') || (any(s, 'حسّن', 'حسن') && any(s, 'القمع') && any(s, 'التعلم', 'التعلّم'))) return hi('optimize_funnel_from_learning');

  // playbooks (Sprint 20) — check before leaks/payment so "ليه رتبت القمع" wins
  if ((has(s, 'ليه', 'رتبت') || has(s, 'ليه', 'القمع') || has(s, 'ليه', 'الترتيب'))) return hi('explain_funnel_reasoning');
  if (any(s, 'playbook', 'بلايبوك', 'دليل') && any(s, 'اعرض', 'وري', 'اعمل', 'استخدم', 'طبّق', 'طبق')) return hi('explain_playbook');
  if (has(s, 'اتعلمنا', 'الدفع') || has(s, 'تعلّمنا', 'الدفع') || has(s, 'اتعلمناه', 'الدفع')) return hi('what_learned_payment');

  // leaks
  if (has(s, 'أكبر', 'تسريب')) return hi('explain_biggest_leak');
  if (has(s, 'صلّح', 'تسريب') || has(s, 'صلح', 'تسريب') || has(s, 'أسرع', 'إصلاح')) return hi('suggest_fastest_fix');
  if (any(s, 'تسريب', 'تسريبات') && any(s, 'افتح')) return med('open_leaks');

  // payment
  if (any(s, 'الدفع', 'دفع') && any(s, 'واقف', 'واقفين', 'متوقف', 'منتظر', 'بانتظار', 'مستني')) return hi('find_waiting_payment_leads');
  if (has(s, 'تذكير', 'دفع') || has(s, 'فكّر', 'دفع')) return med('generate_payment_reminder');
  if (any(s, 'خطوات') && any(s, 'الدفع', 'دفع')) return med('explain_payment_steps');

  // whatsapp / followup
  if (any(s, 'متابعة', 'تابع') && any(s, 'سكتوا', 'سكت', 'اختفوا', 'ردوش', 'ماردوش', 'صمت')) return hi('create_followup_message');
  if (any(s, 'اعتراض') ) return med('respond_to_objection');
  if (any(s, 'واتساب') && any(s, 'متابعة', 'رد')) return med('create_followup_message');
  if (has(s, 'حوّل', 'لهجة') || has(s, 'حول', 'لهجة') || has(s, 'مصرية') || has(s, 'خليجية')) return med('rewrite_whatsapp_template');

  // offer
  if (any(s, 'العرض', 'عرض') && any(s, 'حسّن', 'حسن', 'طوّر', 'طور')) return hi('improve_offer');
  if (any(s, 'العرض', 'عرض') && any(s, 'premium', 'فخم', 'بريميوم')) return med('make_offer_premium');
  if (any(s, 'اعتراضات') && any(s, 'قوّي', 'قوي', 'حسّن', 'حسن')) return med('strengthen_objections');
  if (any(s, 'CTA', 'cta', 'زرار', 'الزر') && any(s, 'العرض', 'عرض')) return med('improve_cta');

  // page
  if (any(s, 'الصفحة', 'صفحة', 'الهبوط') && any(s, 'اختصر', 'قصّر', 'قصر')) return hi('shorten_page');
  if (any(s, 'الصفحة', 'صفحة') && any(s, 'CTA', 'cta', 'زرار', 'الزر')) return med('improve_page_cta');
  if (any(s, 'الصفحة', 'صفحة') && any(s, 'واتساب')) return med('make_page_whatsapp_first');
  if (any(s, 'الصفحة', 'صفحة') && any(s, 'حسّن', 'حسن')) return med('rewrite_page_section');

  // leads
  if (any(s, 'العملاء', 'عملاء', 'الليدز') && any(s, 'محتاجين', 'محتاج', 'تحرّك', 'تحرك', 'متابعة')) return hi('find_leads_needing_action');
  if (any(s, 'ضغطوا', 'ضغط') && any(s, 'واتساب')) return med('find_whatsapp_clicked_not_contacted');
  if (any(s, 'مهام', 'tasks', 'مهمة') && any(s, 'اعمل', 'أنشئ', 'انشئ')) return med('create_tasks_for_leads');

  // report
  if (any(s, 'تقرير') && any(s, 'الفريق', 'فريق')) return hi('create_team_report');
  if (any(s, 'تقرير', 'ملخص') && any(s, 'الأسبوع', 'اسبوع', 'الاسبوع')) return hi('summarize_week');
  if (any(s, 'تقرير')) return med('summarize_week');
  if (any(s, 'إيه', 'ايه') && any(s, 'اتغيّر', 'اتغير', 'اتحسّن', 'اتحسن')) return med('explain_what_changed');

  // navigation (generic "open X")
  if (any(s, 'افتح', 'روح', 'ودّيني', 'وريني')) {
    if (any(s, 'العرض', 'عرض')) return med('open_offer');
    if (any(s, 'الصفحة', 'صفحة')) return med('open_page');
    if (any(s, 'العملاء', 'عملاء', 'الليدز')) return med('open_leads');
    if (any(s, 'الدفع', 'دفع')) return med('open_payment');
    if (any(s, 'واتساب')) return med('open_whatsapp');
    if (any(s, 'تسريب', 'تسريبات')) return med('open_leaks');
    if (any(s, 'تقرير')) return med('open_report');
  }

  return { intent: 'clarify', confidence: 'low' };
}
