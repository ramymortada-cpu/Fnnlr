import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  findUnsafeTemplateClaims,
  reviewIndustryTemplateDoc,
  type IndustryTemplateSlug,
} from '../modules/activation/src/industry-template-readiness.js';

const slugs: IndustryTemplateSlug[] = ['real-estate', 'clinics', 'education', 'agencies', 'ecommerce'];

function templateDoc(slug: IndustryTemplateSlug) {
  return fs.readFileSync(path.join(process.cwd(), 'docs', 'industry-templates', `${slug}.md`), 'utf8');
}

test('all wedge industry templates have complete workflow structure and no unsafe claims', () => {
  for (const slug of slugs) {
    const review = reviewIndustryTemplateDoc(slug, templateDoc(slug));

    assert.equal(review.decision, 'TEMPLATE_DOC_READY', `${slug}: ${JSON.stringify(review)}`);
    assert.ok(review.passed.includes('goal'), `${slug} has a goal`);
    assert.ok(review.passed.includes('funnel'), `${slug} has a funnel`);
    assert.ok(review.passed.includes('whatsapp_sequence'), `${slug} has a WhatsApp sequence`);
    assert.ok(review.passed.includes('qualification_rules'), `${slug} has qualification rules`);
    assert.ok(review.passed.includes('handoff'), `${slug} has a handoff`);
    assert.ok(review.passed.includes('readiness_gate'), `${slug} has a readiness gate`);
    assert.ok(review.passed.includes('hosted_template_usage_evidence'), `${slug} has hosted evidence boundary`);
    assert.equal(review.metrics.funnelSteps >= 4, true, `${slug} has enough funnel steps`);
    assert.equal(review.metrics.whatsappSteps >= 3, true, `${slug} has enough WhatsApp steps`);
    assert.equal(review.metrics.qualificationRules >= 3, true, `${slug} has enough qualification rules`);
    assert.deepEqual(review.unsafeClaims, [], `${slug} has no unsafe claims`);
  }
});

test('clinics template must carry a regulated safety boundary', () => {
  const review = reviewIndustryTemplateDoc('clinics', templateDoc('clinics'));

  assert.ok(review.requiredSections.includes('safety_boundary'));
  assert.ok(review.passed.includes('safety_boundary'));
});

test('industry template readiness blocks missing qualification rules', () => {
  const review = reviewIndustryTemplateDoc('agencies', [
    '# Industry Template: Agencies',
    '## Goal',
    'Qualify leads.',
    '## Funnel',
    '1. Page',
    '2. WhatsApp',
    '3. Discovery',
    '4. Handoff',
    '## WhatsApp Sequence',
    '- First reply.',
    '- Follow-up.',
    '- Reminder.',
    '## Readiness Gate',
    'Hosted usage evidence exists.',
  ].join('\n'));

  assert.equal(review.decision, 'DO_NOT_USE_TEMPLATE');
  assert.ok(review.blocked.includes('qualification_rules'));
});

test('industry template readiness flags unsafe claims unless explicitly negated', () => {
  const unsafe = findUnsafeTemplateClaims('## Goal\nGuarantees revenue and auto-send for every lead.', 'ecommerce');
  const safe = findUnsafeTemplateClaims('## Goal\nNo guaranteed revenue and no auto-send.', 'ecommerce');

  assert.deepEqual(unsafe.map((claim) => claim.claim).sort(), ['auto_send', 'guaranteed_revenue']);
  assert.deepEqual(safe, []);
});

test('regulated template claims are blocked when not negated', () => {
  const review = reviewIndustryTemplateDoc('clinics', [
    '# Industry Template: Clinics',
    '## Goal',
    'Convert inquiries.',
    '## Funnel',
    '1. Service page',
    '2. WhatsApp',
    '3. Appointment',
    '4. Admin handoff',
    '## WhatsApp Sequence',
    '- First reply',
    '- Follow-up',
    '- Reminder',
    '## Qualification Rules',
    '- Service',
    '- Time',
    '- Branch',
    '## Safety Boundary',
    'Treatment promise for every patient.',
    '## Readiness Gate',
    'Hosted cohort usage evidence exists.',
  ].join('\n'));

  assert.equal(review.decision, 'DO_NOT_USE_TEMPLATE');
  assert.ok(review.unsafeClaims.some((claim) => claim.claim === 'medical_claim'));
});
