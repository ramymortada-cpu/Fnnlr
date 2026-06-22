import fs from 'node:fs';
import path from 'node:path';
import { FORBIDDEN_CLAIMS } from '../../commercial/src/consistency.js';

/**
 * Proof checker. Guards the proof/evidence docs (PRODUCT_PROOF, TECHNICAL_PROOF,
 * SECURITY_TRUST_PROOF, CUSTOMER_PROOF_PACK, INVESTOR_PARTNER_PROOF,
 * COMPETITIVE_POSITIONING, EVIDENCE_INDEX, PROOF_ASSETS_CHECKLIST). It reuses the
 * commercial FORBIDDEN_CLAIMS and adds proof-specific over-claims (proven
 * traction without real customer data, unconditional enterprise-readiness). It
 * also requires the honesty markers a credible proof pack must contain.
 */

// proof-specific forbidden claims, on top of the shared commercial set
export const PROOF_FORBIDDEN: { id: string; re: RegExp }[] = [
  ...FORBIDDEN_CLAIMS,
  { id: 'enterprise_ready_without_limits', re: /enterprise[-\s]?ready(?!.*(limit|not|yet))/i },
  { id: 'proven_traction', re: /(proven|demonstrated)\s+(market\s+)?traction/i },
  { id: 'thousands_of_customers', re: /(thousands|millions|hundreds)\s+of\s+(customers|users)/i },
  { id: 'market_leader', re: /(we\s+are|fnnlr\s+is)\s+the\s+market\s+leader/i },
];

// at least these honesty concepts must appear across the proof corpus
export const PROOF_REQUIRED: { id: string; re: RegExp }[] = [
  { id: 'evidence_based', re: /evidence[-\s]?based|observed\s+data/i },
  { id: 'no_guaranteed_revenue', re: /no\s+guaranteed\s+(revenue|results?|sales)|does\s+not\s+guarantee|no\s+fake\s+revenue/i },
  { id: 'no_auto_send', re: /no\s+auto[-\s]?send|does\s+not\s+(auto[-\s]?send|send.*automatically)/i },
  { id: 'no_payment_processing', re: /no\s+payment\s+processing|does\s+not\s+process\s+payments?|manual\s+payment/i },
  { id: 'human_approval', re: /human[-\s]?approv|manual\s+approval|requires?\s+approval/i },
  { id: 'known_limitations', re: /known\s+limit|remaining\s+risk|limitation/i },
  { id: 'live_db_tests', re: /live\s+db|live\s+postgres|test:pg|real\s+postgres/i },
  { id: 'customer_responsibilities', re: /customer\s+responsibilit|responsibilit(y|ies)\s+of\s+the\s+customer/i },
];

export function isProofDoc(filename: string): boolean {
  return /PROOF|EVIDENCE_INDEX|COMPETITIVE_POSITIONING/i.test(filename);
}

export interface ProofCheckResult { ok: boolean; violations: { file: string; claim: string; line: string }[]; missingMarkers: string[]; filesScanned: string[]; }

export function checkProofDocs(docDir: string): ProofCheckResult {
  const violations: ProofCheckResult['violations'] = [];
  const filesScanned: string[] = [];
  let corpus = '';
  if (!fs.existsSync(docDir)) return { ok: true, violations, missingMarkers: [], filesScanned };

  for (const file of fs.readdirSync(docDir).filter((f) => f.endsWith('.md') && isProofDoc(f))) {
    filesScanned.push(file);
    const text = fs.readFileSync(path.join(docDir, file), 'utf8');
    corpus += '\n' + text;

    // collapse soft-wraps into logical sentences, skip questions/headings/negations
    const blocks = text.split(/\n\s*\n/);
    const lines: string[] = [];
    for (const block of blocks) {
      const joined = block.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      for (const unit of joined.split(/(?<=[.!?؟])\s+|·|\u2022|\|/)) if (unit.trim()) lines.push(unit.trim());
    }
    for (const line of lines) {
      const isQuestion = line.endsWith('?') || /^\*?\*?(does|do|is|are|can|will|why|what|how|هل)\b/i.test(line);
      const negated = /\b(no|not|never|none|does\s+not|doesn'?t|do\s+not|don'?t|without|cannot|can'?t|isn'?t|aren'?t|won'?t|avoid|unless|only\s+when|not\s+yet)\b/i.test(line) || /(مش|مفيش|بدون|بلا|ليس|لن)/.test(line) || /\bلا\b/.test(line);
      if (isQuestion || negated) continue;
      for (const claim of PROOF_FORBIDDEN) if (claim.re.test(line)) violations.push({ file, claim: claim.id, line: line.slice(0, 160) });
    }
  }
  const missingMarkers = PROOF_REQUIRED.filter((m) => !m.re.test(corpus)).map((m) => m.id);
  return { ok: violations.length === 0, violations, missingMarkers, filesScanned };
}
