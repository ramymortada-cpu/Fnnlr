export type ActivationEventName =
  | 'workspace_created'
  | 'template_selected'
  | 'first_workflow_created'
  | 'first_publish'
  | 'first_lead_action'
  | 'first_signal_received'
  | 'onboarding_abandoned';

export type ActivationEvent = {
  tenantId: string;
  workspaceId: string;
  businessId?: string;
  eventName: ActivationEventName;
  occurredAt: Date | string;
  industry?: string;
  goal?: string;
  templateId?: string;
  source?: string;
  abandonmentStep?: string;
  abandonmentReason?: string;
};

export type ActivationMetrics = {
  workspaceId: string;
  timeToFirstWorkflowMinutes: number | null;
  timeToFirstPublishMinutes: number | null;
  timeToFirstLeadActionMinutes: number | null;
  firstSignalReceived: boolean;
  selectedTemplateIds: string[];
  selectedIndustries: string[];
  selectedGoals: string[];
  onboardingAbandoned: boolean;
  abandonmentStep: string | null;
  abandonmentReason: string | null;
  missingEvidence: Array<'workspace_created' | 'first_workflow_created' | 'first_publish' | 'first_lead_action'>;
};

export type ActivationAbandonmentBreakdown = {
  value: string;
  count: number;
};

export function computeActivationMetrics(workspaceId: string, events: ActivationEvent[]): ActivationMetrics {
  const scoped = events
    .filter((event) => event.workspaceId === workspaceId)
    .slice()
    .sort((a, b) => timestamp(a) - timestamp(b));

  const workspaceCreated = first(scoped, 'workspace_created');
  const firstWorkflow = first(scoped, 'first_workflow_created');
  const firstPublish = first(scoped, 'first_publish');
  const firstLeadAction = first(scoped, 'first_lead_action');
  const abandonment = first(scoped, 'onboarding_abandoned');
  const missingEvidence = new Set<ActivationMetrics['missingEvidence'][number]>();

  if (!workspaceCreated) missingEvidence.add('workspace_created');
  if (!firstWorkflow) missingEvidence.add('first_workflow_created');
  if (!firstPublish) missingEvidence.add('first_publish');
  if (!firstLeadAction) missingEvidence.add('first_lead_action');

  return {
    workspaceId,
    timeToFirstWorkflowMinutes: minutesBetween(workspaceCreated, firstWorkflow),
    timeToFirstPublishMinutes: minutesBetween(workspaceCreated, firstPublish),
    timeToFirstLeadActionMinutes: minutesBetween(workspaceCreated, firstLeadAction),
    firstSignalReceived: scoped.some((event) => event.eventName === 'first_signal_received'),
    selectedTemplateIds: [...new Set(scoped.filter((event) => event.eventName === 'template_selected').map((event) => event.templateId).filter(Boolean) as string[])],
    selectedIndustries: [...new Set(scoped.map((event) => event.industry).filter(Boolean) as string[])],
    selectedGoals: [...new Set(scoped.map((event) => event.goal).filter(Boolean) as string[])],
    onboardingAbandoned: !!abandonment,
    abandonmentStep: abandonment?.abandonmentStep ?? null,
    abandonmentReason: abandonment?.abandonmentReason ?? null,
    missingEvidence: [...missingEvidence],
  };
}

export function activationCohortSummary(metrics: ActivationMetrics[]): {
  workspaces: number;
  activatedWorkflows: number;
  published: number;
  leadActionActivated: number;
  abandoned: number;
  topAbandonmentSteps: ActivationAbandonmentBreakdown[];
  topAbandonmentReasons: ActivationAbandonmentBreakdown[];
  medianTimeToFirstWorkflowMinutes: number | null;
  medianTimeToFirstPublishMinutes: number | null;
} {
  return {
    workspaces: metrics.length,
    activatedWorkflows: metrics.filter((metric) => metric.timeToFirstWorkflowMinutes !== null).length,
    published: metrics.filter((metric) => metric.timeToFirstPublishMinutes !== null).length,
    leadActionActivated: metrics.filter((metric) => metric.timeToFirstLeadActionMinutes !== null).length,
    abandoned: metrics.filter((metric) => metric.onboardingAbandoned).length,
    topAbandonmentSteps: breakdown(metrics.map((metric) => metric.abandonmentStep)),
    topAbandonmentReasons: breakdown(metrics.map((metric) => metric.abandonmentReason)),
    medianTimeToFirstWorkflowMinutes: median(metrics.map((metric) => metric.timeToFirstWorkflowMinutes)),
    medianTimeToFirstPublishMinutes: median(metrics.map((metric) => metric.timeToFirstPublishMinutes)),
  };
}

function first(events: ActivationEvent[], eventName: ActivationEventName): ActivationEvent | undefined {
  return events.find((event) => event.eventName === eventName);
}

function minutesBetween(start?: ActivationEvent, end?: ActivationEvent): number | null {
  if (!start || !end) return null;
  const minutes = Math.round((timestamp(end) - timestamp(start)) / 60_000);
  return minutes >= 0 ? minutes : null;
}

function timestamp(event: ActivationEvent): number {
  return new Date(event.occurredAt).getTime();
}

function median(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null).sort((a, b) => a - b);
  if (!present.length) return null;
  const middle = Math.floor(present.length / 2);
  if (present.length % 2 === 1) return present[middle];
  return Math.round((present[middle - 1] + present[middle]) / 2);
}

function breakdown(values: Array<string | null>): ActivationAbandonmentBreakdown[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}
