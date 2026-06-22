import fs from 'node:fs';
import path from 'node:path';

/**
 * Commercial consistency checker. Scans the commercial/marketing docs and fails
 * on any forbidden over-claim, and warns if the honesty markers are absent. This
 * keeps the sales materials matched to the actual product state proven in
 * Sprints 31–42 — no auto-send, no payment processing, no guaranteed revenue.
 */

// Forbidden claims (case-insensitive). Each is a regex of an over-promise the
// product does NOT deliver. A match in any commercial doc is a hard failure.
export const FORBIDDEN_CLAIMS: { id: string; re: RegExp }[] = [
  { id: 'guaranteed_revenue', re: /guarantee(d|s)?\s+(revenue|sales|income|results?|roi)/i },
  { id: 'guaranteed_roi', re: /guaranteed\s+roi/i },
  { id: 'auto_send_whatsapp', re: /auto[-\s]?send(s|ing)?\s+(whatsapp|messages?|واتساب)/i },
  { id: 'sends_whatsapp_automatically', re: /(sends?|يرسل)\s+(whatsapp|واتساب|messages?)\s+(automatically|تلقائ)/i },
  { id: 'automatic_payment_processing', re: /automatic(ally)?\s+(payment\s+process|process(es|ing)?\s+payments?)/i },
  { id: 'processes_payments', re: /\b(we|fnnlr|it)\s+process(es)?\s+payments?\b/i },
  { id: 'fully_autonomous_sales', re: /fully\s+autonomous\s+(sales|revenue)/i },
  { id: 'hands_free_revenue', re: /hands[-\s]?free\s+(revenue|sales)/i },
  { id: 'replaces_all_crm', re: /replaces?\s+(all|every|your)\s+crm/i },
  { id: 'no_human_needed', re: /no\s+human\s+(needed|required|involvement)/i },
  { id: 'ai_fixes_everything', re: /ai\s+(will\s+)?fix(es)?\s+everything/i },
];

// Required honesty markers — at least these CONCEPTS must appear somewhere across
// the commercial doc set (not necessarily every file).
export const REQUIRED_MARKERS: { id: string; re: RegExp }[] = [
  { id: 'no_auto_send', re: /no\s+auto[-\s]?send|does\s+not\s+(auto[-\s]?send|send.*automatically)|مش.*يرسل.*تلقائ|لا.*يرسل.*تلقائ/i },
  { id: 'no_payment_processing', re: /no\s+payment\s+processing|does\s+not\s+process\s+payments?|manual\s+payment|مش.*يعالج.*الدفع|لا.*يعالج.*الدفع/i },
  { id: 'manual_approval', re: /manual\s+approval|human[-\s]?approved|requires?\s+approval|موافقة|بموافقة/i },
  { id: 'evidence_based', re: /evidence[-\s]?based|observed\s+data|مبني.*على.*evidence|على.*بيانات.*مرصودة/i },
  { id: 'no_guaranteed_revenue', re: /no\s+guaranteed\s+(revenue|results?|sales)|does\s+not\s+guarantee|مفيش.*ضمان|لا.*نضمن/i },
  { id: 'customer_responsibilities', re: /customer\s+responsibilit|responsibilit(y|ies)\s+of\s+the\s+customer|مسؤولي(ة|ات).*العميل/i },
];

export interface CheckResult { ok: boolean; violations: { file: string; claim: string; line: string }[]; missingMarkers: string[]; filesScanned: string[]; }

/** Files that are commercial/sales-facing and must obey the rules. */
export function isCommercialDoc(filename: string): boolean {
  return /COMMERCIAL|SALES|AGREEMENT|ONBOARDING_PROMISE|SUCCESS_CRITERIA|QUALIFICATION|FAQ/i.test(filename);
}

export function checkCommercialDocs(docDir: string): CheckResult {
  const violations: CheckResult['violations'] = [];
  const filesScanned: string[] = [];
  let corpus = '';

  if (!fs.existsSync(docDir)) return { ok: true, violations, missingMarkers: [], filesScanned };

  for (const file of fs.readdirSync(docDir).filter((f) => f.endsWith('.md') && isCommercialDoc(f))) {
    filesScanned.push(file);
    const text = fs.readFileSync(path.join(docDir, file), 'utf8');
    corpus += '\n' + text;
    // Markdown soft-wraps sentences across physical lines, which can separate a
    // negator ("no") from the claim ("guaranteed revenue"). Collapse soft wraps
    // within each block (blank-line-separated) into single logical lines, then
    // split on sentence punctuation, so negation is evaluated on whole sentences.
    const blocks = text.split(/\n\s*\n/);
    const logicalLines: string[] = [];
    for (const block of blocks) {
      const joined = block.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      // split into sentence-ish units while keeping list/bullet bursts together
      for (const unit of joined.split(/(?<=[.!?؟])\s+|·|\u2022/)) {
        if (unit.trim()) logicalLines.push(unit.trim());
      }
    }
    for (const line of logicalLines) {
      const trimmed = line.trim();
      // A forbidden claim only counts as a violation when the line AFFIRMATIVELY
      // asserts it. The following are NOT assertions and are skipped:
      //  - questions ("Does it process payments?")
      //  - headings/labels that pose the topic ("**What it does not do**")
      //  - negated statements (English or Arabic) — "no", "not", "does not",
      //    "without", "never", "مش", "لا", "مفيش", "بدون", "بلا"
      const isQuestion = trimmed.endsWith('?') || /^\*?\*?(does|do|is|are|can|will|هل)\b/i.test(trimmed);
      // Arabic script has no \b word boundary, so test the negators directly.
      const negatedEn = /\b(no|not|never|none|does\s+not|doesn'?t|do\s+not|don'?t|without|cannot|can'?t|isn'?t|aren'?t|won'?t)\b/i.test(line);
      const negatedAr = /(مش|مفيش|بدون|بلا|لا\s|ليس|لن)/.test(line) || /\bلا\b/.test(line);
      const negated = negatedEn || negatedAr;
      if (isQuestion || negated) continue;
      for (const claim of FORBIDDEN_CLAIMS) {
        if (claim.re.test(line)) {
          violations.push({ file, claim: claim.id, line: trimmed.slice(0, 160) });
        }
      }
    }
  }

  const missingMarkers = REQUIRED_MARKERS.filter((m) => !m.re.test(corpus)).map((m) => m.id);
  return { ok: violations.length === 0, violations, missingMarkers, filesScanned };
}
