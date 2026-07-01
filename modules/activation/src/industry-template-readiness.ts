export type IndustryTemplateSlug = 'real-estate' | 'clinics' | 'education' | 'agencies' | 'ecommerce';

export type IndustryTemplateRequirementId =
  | 'goal'
  | 'funnel'
  | 'whatsapp_sequence'
  | 'qualification_rules'
  | 'handoff'
  | 'safety_boundary'
  | 'readiness_gate'
  | 'hosted_template_usage_evidence';

export type IndustryTemplateDecision =
  | 'TEMPLATE_DOC_READY'
  | 'CONTRACT_READY_WITH_HOSTED_GAPS'
  | 'DO_NOT_USE_TEMPLATE';

export type IndustryTemplateReview = {
  slug: IndustryTemplateSlug;
  decision: IndustryTemplateDecision;
  requiredSections: IndustryTemplateRequirementId[];
  passed: IndustryTemplateRequirementId[];
  gaps: IndustryTemplateRequirementId[];
  blocked: IndustryTemplateRequirementId[];
  unsafeClaims: Array<{ claim: string; line: string }>;
  metrics: {
    funnelSteps: number;
    whatsappSteps: number;
    qualificationRules: number;
  };
  actions: Array<{
    owner: 'Product' | 'Marketing' | 'Support' | 'Legal';
    action: string;
    evidenceRequired: string;
  }>;
};

const REGULATED_TEMPLATES = new Set<IndustryTemplateSlug>(['clinics']);

const UNSAFE_TEMPLATE_CLAIMS: Array<{ id: string; re: RegExp }> = [
  { id: 'guaranteed_revenue', re: /guarante(e|ed|es)\s+(revenue|sales|results?)|مضمون|ضمان\s+(مبيعات|ايراد|إيراد)/i },
  { id: 'auto_send', re: /auto[-\s]?send|send(s|ing)?\s+automatically|يبعت\s+تلقائ/i },
  { id: 'payment_processing', re: /process(es|ing)?\s+payments?|move(s|ing)?\s+money|يعالج\s+الدفع|بنقبض/i },
  { id: 'medical_claim', re: /diagnos(is|e)|treatment\s+promise|medical\s+advice|تشخيص|علاج\s+مضمون/i },
];

export function reviewIndustryTemplateDoc(
  slug: IndustryTemplateSlug,
  markdown: string,
): IndustryTemplateReview {
  const requiredSections = requiredTemplateSections(slug);
  const metrics = {
    funnelSteps: countListItemsInSection(markdown, 'Funnel'),
    whatsappSteps: countListItemsInSection(markdown, 'WhatsApp Sequence'),
    qualificationRules: countListItemsInSection(markdown, 'Qualification Rules'),
  };
  const unsafeClaims = findUnsafeTemplateClaims(markdown, slug);
  const passed: IndustryTemplateRequirementId[] = [];
  const gaps: IndustryTemplateRequirementId[] = [];
  const blocked: IndustryTemplateRequirementId[] = [];

  for (const requirement of requiredSections) {
    const status = requirementStatus(requirement, slug, markdown, metrics);
    if (status === 'PASS') passed.push(requirement);
    if (status === 'GAP') gaps.push(requirement);
    if (status === 'BLOCK') blocked.push(requirement);
  }

  if (unsafeClaims.length > 0) blocked.push('safety_boundary');
  const uniqueBlocked = [...new Set(blocked)];
  const decision = templateDecision(uniqueBlocked, gaps);

  return {
    slug,
    decision,
    requiredSections,
    passed,
    gaps,
    blocked: uniqueBlocked,
    unsafeClaims,
    metrics,
    actions: templateActions(slug, uniqueBlocked, gaps, unsafeClaims),
  };
}

export function findUnsafeTemplateClaims(markdown: string, slug: IndustryTemplateSlug) {
  const findings: IndustryTemplateReview['unsafeClaims'] = [];
  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const negated = /\b(no|not|never|does\s+not|do\s+not|without|cannot|should\s+not)\b/i.test(line) || /\bلا\b|مش|بدون|ليس|مفيش/.test(line);
    if (negated) continue;
    for (const claim of UNSAFE_TEMPLATE_CLAIMS) {
      if (claim.id === 'medical_claim' && slug !== 'clinics') continue;
      if (claim.re.test(line)) findings.push({ claim: claim.id, line: line.slice(0, 160) });
    }
  }
  return findings;
}

function requiredTemplateSections(slug: IndustryTemplateSlug): IndustryTemplateRequirementId[] {
  const sections: IndustryTemplateRequirementId[] = [
    'goal',
    'funnel',
    'whatsapp_sequence',
    'qualification_rules',
    'handoff',
    'readiness_gate',
    'hosted_template_usage_evidence',
  ];
  if (REGULATED_TEMPLATES.has(slug)) sections.push('safety_boundary');
  return sections;
}

function requirementStatus(
  requirement: IndustryTemplateRequirementId,
  slug: IndustryTemplateSlug,
  markdown: string,
  metrics: IndustryTemplateReview['metrics'],
): 'PASS' | 'GAP' | 'BLOCK' {
  if (requirement === 'goal') return hasHeading(markdown, 'Goal') ? 'PASS' : 'BLOCK';
  if (requirement === 'funnel') return hasHeading(markdown, 'Funnel') && metrics.funnelSteps >= 4 ? 'PASS' : 'BLOCK';
  if (requirement === 'whatsapp_sequence') {
    return hasHeading(markdown, 'WhatsApp Sequence') && metrics.whatsappSteps >= 3 ? 'PASS' : 'BLOCK';
  }
  if (requirement === 'qualification_rules') {
    return hasHeading(markdown, 'Qualification Rules') && metrics.qualificationRules >= 3 ? 'PASS' : 'BLOCK';
  }
  if (requirement === 'handoff') return /handoff/i.test(markdown) ? 'PASS' : 'BLOCK';
  if (requirement === 'safety_boundary') return hasHeading(markdown, 'Safety Boundary') ? 'PASS' : 'BLOCK';
  if (requirement === 'readiness_gate') return hasHeading(markdown, 'Readiness Gate') ? 'PASS' : 'GAP';
  if (requirement === 'hosted_template_usage_evidence') return /hosted|cohort|observed|usage evidence/i.test(markdown) ? 'PASS' : 'GAP';
  return slug ? 'BLOCK' : 'BLOCK';
}

function countListItemsInSection(markdown: string, heading: string) {
  const section = sectionText(markdown, heading);
  return section.split('\n').filter((line) => /^\s*(?:[-*]|\d+\.)\s+/.test(line)).length;
}

function hasHeading(markdown: string, heading: string) {
  return new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`, 'im').test(markdown);
}

function sectionText(markdown: string, heading: string) {
  const re = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`, 'im');
  const match = re.exec(markdown);
  if (!match) return '';
  const start = match.index + match[0].length;
  const rest = markdown.slice(start);
  const nextHeading = /^##\s+/im.exec(rest);
  return nextHeading ? rest.slice(0, nextHeading.index) : rest;
}

function templateDecision(
  blocked: IndustryTemplateRequirementId[],
  gaps: IndustryTemplateRequirementId[],
): IndustryTemplateDecision {
  if (blocked.length > 0) return 'DO_NOT_USE_TEMPLATE';
  return gaps.length > 0 ? 'CONTRACT_READY_WITH_HOSTED_GAPS' : 'TEMPLATE_DOC_READY';
}

function templateActions(
  slug: IndustryTemplateSlug,
  blocked: IndustryTemplateRequirementId[],
  gaps: IndustryTemplateRequirementId[],
  unsafeClaims: IndustryTemplateReview['unsafeClaims'],
): IndustryTemplateReview['actions'] {
  const actions: IndustryTemplateReview['actions'] = unsafeClaims.map((claim) => ({
    owner: 'Legal',
    action: `Remove unsafe ${slug} template claim "${claim.claim}".`,
    evidenceRequired: 'Updated template copy with no guaranteed revenue, auto-send, payment-processing, or unsupported regulated claim.',
  }));

  for (const requirement of blocked) {
    actions.push({
      owner: requirement === 'safety_boundary' ? 'Legal' : 'Product',
      action: `Complete blocked ${slug} template requirement: ${requirement}.`,
      evidenceRequired: 'Template section with concrete workflow, qualification, handoff, or safety evidence.',
    });
  }
  for (const requirement of gaps) {
    actions.push({
      owner: requirement === 'hosted_template_usage_evidence' ? 'Marketing' : 'Product',
      action: `Keep ${slug} template gap-labeled until ${requirement} exists.`,
      evidenceRequired: 'Hosted cohort/template usage evidence, readiness gate copy, or observed outcome link.',
    });
  }
  return actions;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
