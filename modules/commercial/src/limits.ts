export type CommercialPlan = 'starter' | 'growth' | 'scale' | 'enterprise';
export type LimitResource = 'seats' | 'activeWorkflows' | 'contacts' | 'integrations' | 'aiBudgetUsdMonthly';

export type PlanLimit = number | 'custom';

export type PlanLimitProfile = {
  plan: CommercialPlan;
  label: string;
  limits: Record<LimitResource, PlanLimit>;
  supportTier: string;
  requiresHumanReview: boolean;
};

export type UsageSnapshot = Partial<Record<LimitResource, number>>;

export type LimitDecision =
  | {
      allowed: true;
      plan: CommercialPlan;
      resource: LimitResource;
      limit: PlanLimit;
      current: number;
      requested: number;
      remaining: number | 'custom';
    }
  | {
      allowed: false;
      plan: CommercialPlan;
      resource: LimitResource;
      limit: number;
      current: number;
      requested: number;
      overBy: number;
      reason: 'PLAN_LIMIT_EXCEEDED';
      upgradeHint: CommercialPlan;
    };

export const PLAN_LIMITS: Record<CommercialPlan, PlanLimitProfile> = {
  starter: {
    plan: 'starter',
    label: 'Starter',
    limits: {
      seats: 2,
      activeWorkflows: 3,
      contacts: 2_000,
      integrations: 1,
      aiBudgetUsdMonthly: 25,
    },
    supportTier: 'Email/async launch support',
    requiresHumanReview: false,
  },
  growth: {
    plan: 'growth',
    label: 'Growth',
    limits: {
      seats: 5,
      activeWorkflows: 15,
      contacts: 20_000,
      integrations: 3,
      aiBudgetUsdMonthly: 150,
    },
    supportTier: 'Priority support and monthly review',
    requiresHumanReview: false,
  },
  scale: {
    plan: 'scale',
    label: 'Scale',
    limits: {
      seats: 15,
      activeWorkflows: 50,
      contacts: 100_000,
      integrations: 8,
      aiBudgetUsdMonthly: 750,
    },
    supportTier: 'Priority support and operating review',
    requiresHumanReview: false,
  },
  enterprise: {
    plan: 'enterprise',
    label: 'Enterprise',
    limits: {
      seats: 'custom',
      activeWorkflows: 'custom',
      contacts: 'custom',
      integrations: 'custom',
      aiBudgetUsdMonthly: 'custom',
    },
    supportTier: 'SLA, security review, procurement packet',
    requiresHumanReview: true,
  },
};

export function normalizePlan(plan: string): CommercialPlan {
  const normalized = plan.trim().toLowerCase();
  if (normalized in PLAN_LIMITS) return normalized as CommercialPlan;
  throw new Error(`unknown commercial plan: ${plan}`);
}

export function getPlanLimit(plan: CommercialPlan, resource: LimitResource): PlanLimit {
  return PLAN_LIMITS[plan].limits[resource];
}

export function nextCommercialPlan(plan: CommercialPlan): CommercialPlan {
  if (plan === 'starter') return 'growth';
  if (plan === 'growth') return 'scale';
  return 'enterprise';
}

export function canConsumePlanResource(
  planInput: CommercialPlan | string,
  resource: LimitResource,
  usage: UsageSnapshot,
  requested = 1,
): LimitDecision {
  if (!Number.isFinite(requested) || requested <= 0) throw new Error('requested usage must be a positive number');

  const plan = typeof planInput === 'string' ? normalizePlan(planInput) : planInput;
  const limit = getPlanLimit(plan, resource);
  const current = usage[resource] ?? 0;

  if (limit === 'custom') {
    return { allowed: true, plan, resource, limit, current, requested, remaining: 'custom' };
  }

  const next = current + requested;
  if (next <= limit) {
    return { allowed: true, plan, resource, limit, current, requested, remaining: limit - next };
  }

  return {
    allowed: false,
    plan,
    resource,
    limit,
    current,
    requested,
    overBy: next - limit,
    reason: 'PLAN_LIMIT_EXCEEDED',
    upgradeHint: nextCommercialPlan(plan),
  };
}

export function planLimitRows(): Array<{
  plan: CommercialPlan;
  label: string;
  resource: LimitResource;
  limit: PlanLimit;
  supportTier: string;
  requiresHumanReview: boolean;
}> {
  return Object.values(PLAN_LIMITS).flatMap((profile) =>
    Object.entries(profile.limits).map(([resource, limit]) => ({
      plan: profile.plan,
      label: profile.label,
      resource: resource as LimitResource,
      limit,
      supportTier: profile.supportTier,
      requiresHumanReview: profile.requiresHumanReview,
    })),
  );
}
