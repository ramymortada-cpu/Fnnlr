export type DemoCapabilityId =
  | 'category_positioning'
  | 'product_flow'
  | 'evidence_based_recommendation'
  | 'human_approval_boundary'
  | 'trust_boundary_reset'
  | 'pilot_close'
  | 'objection_library'
  | 'cta_and_next_step';

export type DemoCapabilityStatus = 'READY' | 'CONTRACT_READY' | 'ROADMAP' | 'MISSING_EVIDENCE';

export type DemoCapability = {
  id: DemoCapabilityId;
  label: string;
  owner: 'Sales' | 'Product' | 'Support';
  status: DemoCapabilityStatus;
  evidence: string[];
  requiredForRepeatableDemo: boolean;
};

export type DemoReadinessReview = {
  decision: 'REPEATABLE_DEMO_READY' | 'CONTRACT_READY_WITH_GAPS' | 'DO_NOT_USE_DEMO';
  repeatableDemoReady: boolean;
  readyCapabilities: DemoCapabilityId[];
  gapCapabilities: DemoCapabilityId[];
  blockedCapabilities: DemoCapabilityId[];
  actions: Array<{
    owner: DemoCapability['owner'];
    action: string;
    evidenceRequired: string;
  }>;
};

export const FOUNDER_LED_DEMO_BASELINE: DemoCapability[] = [
  cap('category_positioning', 'Arabic-first AI Revenue Operations OS positioning', 'Sales', 'CONTRACT_READY', [
    'docs/FOUNDER_LED_DEMO_SCRIPT.md',
    'docs/SALES_PAGE_COPY.md',
  ], true),
  cap('product_flow', 'Demo flow covers page, WhatsApp CTA, capture, Revenue Desk, recommendation, and operating status', 'Product', 'CONTRACT_READY', [
    'docs/FOUNDER_LED_DEMO_SCRIPT.md',
  ], true),
  cap('evidence_based_recommendation', 'Recommendation demo is evidence-based, not fabricated', 'Product', 'CONTRACT_READY', [
    'modules/recommendations/src/engine.ts',
    'tests/recommendations.test.ts',
    'docs/FOUNDER_LED_DEMO_SCRIPT.md',
  ], true),
  cap('human_approval_boundary', 'Demo resets no auto-send and human approval boundary', 'Sales', 'CONTRACT_READY', [
    'docs/FOUNDER_LED_DEMO_SCRIPT.md',
    'docs/OBJECTION_HANDLING_LIBRARY.md',
  ], true),
  cap('trust_boundary_reset', 'Demo resets payment processing and guaranteed revenue claims', 'Sales', 'CONTRACT_READY', [
    'docs/FOUNDER_LED_DEMO_SCRIPT.md',
    'docs/OBJECTION_HANDLING_LIBRARY.md',
  ], true),
  cap('pilot_close', 'Close frames pilot around repeatable activation and workflow visibility', 'Sales', 'CONTRACT_READY', [
    'docs/FOUNDER_LED_DEMO_SCRIPT.md',
  ], true),
  cap('objection_library', 'Objection library covers guarantee, auto-send, payments, security, CRM, and self-serve objections', 'Sales', 'CONTRACT_READY', [
    'docs/OBJECTION_HANDLING_LIBRARY.md',
  ], true),
  cap('cta_and_next_step', 'Demo has measurable next step, owner, and proof request', 'Sales', 'ROADMAP', [
    'docs/FOUNDER_LED_DEMO_SCRIPT.md',
  ], true),
];

export function reviewFounderLedDemoReadiness(
  capabilities: DemoCapability[] = FOUNDER_LED_DEMO_BASELINE,
): DemoReadinessReview {
  const readyCapabilities = capabilities.filter(isReady).map((capability) => capability.id);
  const gapCapabilities = capabilities.filter(isGap).map((capability) => capability.id);
  const blockedCapabilities = capabilities.filter(isBlocked).map((capability) => capability.id);
  const repeatableDemoReady = capabilities
    .filter((capability) => capability.requiredForRepeatableDemo)
    .every(isReady);

  return {
    decision: demoDecision(blockedCapabilities, repeatableDemoReady),
    repeatableDemoReady,
    readyCapabilities,
    gapCapabilities,
    blockedCapabilities,
    actions: demoActions(capabilities, blockedCapabilities, gapCapabilities),
  };
}

function cap(
  id: DemoCapabilityId,
  label: string,
  owner: DemoCapability['owner'],
  status: DemoCapabilityStatus,
  evidence: string[],
  requiredForRepeatableDemo: boolean,
): DemoCapability {
  return { id, label, owner, status, evidence, requiredForRepeatableDemo };
}

function isReady(capability: DemoCapability) {
  return ['READY', 'CONTRACT_READY'].includes(capability.status) && capability.evidence.length > 0;
}

function isGap(capability: DemoCapability) {
  return capability.status === 'ROADMAP';
}

function isBlocked(capability: DemoCapability) {
  return capability.status === 'MISSING_EVIDENCE' || capability.evidence.length === 0;
}

function demoDecision(
  blockedCapabilities: DemoCapabilityId[],
  repeatableDemoReady: boolean,
): DemoReadinessReview['decision'] {
  if (blockedCapabilities.length > 0) return 'DO_NOT_USE_DEMO';
  return repeatableDemoReady ? 'REPEATABLE_DEMO_READY' : 'CONTRACT_READY_WITH_GAPS';
}

function demoActions(
  capabilities: DemoCapability[],
  blockedCapabilities: DemoCapabilityId[],
  gapCapabilities: DemoCapabilityId[],
): DemoReadinessReview['actions'] {
  const actions: DemoReadinessReview['actions'] = [];
  for (const capability of capabilities) {
    if (blockedCapabilities.includes(capability.id)) {
      actions.push({
        owner: capability.owner,
        action: `Attach founder-led demo evidence for ${capability.label}.`,
        evidenceRequired: 'Script section, objection response, product proof, or demo recording reference.',
      });
      continue;
    }
    if (gapCapabilities.includes(capability.id)) {
      actions.push({
        owner: capability.owner,
        action: `Keep ${capability.label} gap-labeled until demo close proof exists.`,
        evidenceRequired: 'Measurable CTA, assigned owner, pilot success criterion, and follow-up evidence link.',
      });
    }
  }
  return actions;
}
