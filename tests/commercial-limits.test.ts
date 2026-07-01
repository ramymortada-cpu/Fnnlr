import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  PLAN_LIMITS,
  canConsumePlanResource,
  getPlanLimit,
  nextCommercialPlan,
  normalizePlan,
  planLimitRows,
} from '../modules/commercial/src/limits.js';

function pricingMatrixRows() {
  const markdown = fs.readFileSync(path.join(process.cwd(), 'docs', 'PRICING_AND_LIMITS_MATRIX.md'), 'utf8');
  return markdown
    .split('\n')
    .filter((line) => line.startsWith('| ') && !line.includes('---') && !line.startsWith('| Plan |'))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => ['Starter', 'Growth', 'Scale', 'Enterprise'].includes(cells[0]))
    .map(([label, target, seats, activeWorkflows, contacts, integrations, aiBudgetPosture, support]) => ({
      label,
      target,
      seats,
      activeWorkflows,
      contacts,
      integrations,
      aiBudgetPosture,
      support,
    }));
}

function numericCell(value: string) {
  return Number(value.replace(/,/g, ''));
}

function budgetUsdCell(value: string) {
  const match = value.match(/\$(\d+)\/mo/);
  return match ? Number(match[1]) : /custom|contracted/i.test(value) ? 'custom' : undefined;
}

test('commercial plan limits match the public packaging matrix', () => {
  assert.equal(getPlanLimit('starter', 'seats'), 2);
  assert.equal(getPlanLimit('starter', 'activeWorkflows'), 3);
  assert.equal(getPlanLimit('starter', 'contacts'), 2_000);
  assert.equal(getPlanLimit('starter', 'integrations'), 1);

  assert.equal(getPlanLimit('growth', 'seats'), 5);
  assert.equal(getPlanLimit('growth', 'activeWorkflows'), 15);
  assert.equal(getPlanLimit('growth', 'contacts'), 20_000);
  assert.equal(getPlanLimit('growth', 'integrations'), 3);

  assert.equal(getPlanLimit('scale', 'seats'), 15);
  assert.equal(getPlanLimit('scale', 'activeWorkflows'), 50);
  assert.equal(getPlanLimit('scale', 'contacts'), 100_000);
  assert.equal(getPlanLimit('scale', 'integrations'), 8);
});

test('public pricing matrix stays synchronized with coded plan limits', () => {
  const rows = pricingMatrixRows();

  assert.equal(rows.length, 4);

  for (const row of rows) {
    const plan = normalizePlan(row.label);
    const coded = PLAN_LIMITS[plan];
    assert.equal(row.support, coded.supportTier);
    assert.equal(row.target.length > 0, true);
    if (plan === 'enterprise') {
      assert.equal(row.seats, 'Custom');
      assert.equal(row.activeWorkflows, 'Custom');
      assert.equal(row.contacts, 'Custom');
      assert.equal(row.integrations, 'Custom');
      assert.equal(budgetUsdCell(row.aiBudgetPosture), 'custom');
      continue;
    }
    assert.equal(numericCell(row.seats), coded.limits.seats);
    assert.equal(numericCell(row.activeWorkflows), coded.limits.activeWorkflows);
    assert.equal(numericCell(row.contacts), coded.limits.contacts);
    assert.equal(numericCell(row.integrations), coded.limits.integrations);
    assert.equal(budgetUsdCell(row.aiBudgetPosture), coded.limits.aiBudgetUsdMonthly);
  }
});

test('limit decisions allow usage within the plan cap and expose remaining capacity', () => {
  const decision = canConsumePlanResource('starter', 'activeWorkflows', { activeWorkflows: 2 }, 1);

  assert.equal(decision.allowed, true);
  assert.equal(decision.plan, 'starter');
  assert.equal(decision.limit, 3);
  assert.equal(decision.current, 2);
  assert.equal(decision.requested, 1);
  assert.equal(decision.remaining, 0);
});

test('limit decisions block overages with an upgrade hint', () => {
  const decision = canConsumePlanResource('Growth', 'contacts', { contacts: 20_000 }, 1);

  assert.equal(decision.allowed, false);
  assert.equal(decision.plan, 'growth');
  assert.equal(decision.limit, 20_000);
  assert.equal(decision.overBy, 1);
  assert.equal(decision.reason, 'PLAN_LIMIT_EXCEEDED');
  assert.equal(decision.upgradeHint, 'scale');
});

test('enterprise limits are custom but require human review', () => {
  const decision = canConsumePlanResource('enterprise', 'integrations', { integrations: 500 }, 25);

  assert.equal(decision.allowed, true);
  assert.equal(decision.limit, 'custom');
  assert.equal(decision.remaining, 'custom');
  assert.equal(PLAN_LIMITS.enterprise.requiresHumanReview, true);
});

test('commercial plan helpers reject unknown plans and invalid usage increments', () => {
  assert.equal(normalizePlan(' Starter '), 'starter');
  assert.equal(nextCommercialPlan('starter'), 'growth');
  assert.equal(nextCommercialPlan('scale'), 'enterprise');
  assert.throws(() => normalizePlan('free'), /unknown commercial plan/);
  assert.throws(() => canConsumePlanResource('starter', 'seats', {}, 0), /positive number/);
});

test('planLimitRows exports all resources for every plan', () => {
  const rows = planLimitRows();

  assert.equal(rows.length, 20);
  assert.ok(rows.some((row) => row.plan === 'scale' && row.resource === 'aiBudgetUsdMonthly' && row.limit === 750));
  assert.ok(rows.every((row) => row.supportTier.length > 0));
});
