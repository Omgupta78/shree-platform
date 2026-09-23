/**
 * The policy pages' facts, and the decisions still owed.
 *
 * Everything on `/privacy`, `/terms` and `/disclaimer` is drawn either from
 * what the application demonstrably does — read out of the schema, the server
 * actions and the provider configuration — or from a value already settled in
 * `app_settings`. Nothing is invented.
 *
 * Where a policy needs a commercial or legal decision that the codebase cannot
 * supply, it is listed in `PENDING_DECISIONS` and rendered on the page as a
 * visible, unmissable box rather than quietly filled in with something
 * plausible. A refund window nobody agreed to is worse than an obvious gap: the
 * gap gets fixed, the invention gets relied on.
 *
 * Removing an entry from `PENDING_DECISIONS` is what publishes the answer.
 */

/**
 * The date the office adopted these policies.
 *
 * Deliberately null. There is no adoption date anywhere in this project, and a
 * policy page carrying a date it was never approved on is a false statement
 * about when the business agreed to something. The pages say so plainly until
 * this is set.
 */
export const POLICY_EFFECTIVE_DATE: string | null = null;

export interface PendingDecision {
  /** Short label, used as the heading of the callout. */
  id: string;
  /** Which page it appears on. */
  page: 'privacy' | 'terms' | 'disclaimer';
  /** The question, put to the office in plain words. */
  question: string;
  /** What the codebase already does, so the answer is informed rather than guessed. */
  whatTheCodeDoes: string;
}

/**
 * The decisions the office still has to make.
 *
 * Each one is rendered in place on the relevant page, so nobody can publish
 * these documents without seeing exactly what is unanswered.
 */
export const PENDING_DECISIONS: readonly PendingDecision[] = [
  {
    id: 'effective-date',
    page: 'terms',
    question:
      'On what date do these policies take effect? This is the date the office adopts them, not the date the page was written.',
    whatTheCodeDoes:
      'No date exists anywhere in the project. Set POLICY_EFFECTIVE_DATE in src/config/legal.ts.',
  },
  {
    id: 'refunds',
    page: 'terms',
    question:
      'What is the refund and cancellation policy? Specifically: is a payment refundable if an advertisement is rejected by moderation, if the advertiser withdraws before publication, or after publication? Over what period, and by what method?',
    whatTheCodeDoes:
      'The application never issues a refund automatically. A payment can be marked refunded only by an authorised backend process, and that state change is recorded in the audit trail. There is no refund window, condition or process anywhere in the code, because none has been decided.',
  },
  {
    id: 'jurisdiction',
    page: 'terms',
    question:
      'Which law governs these terms, and which courts have jurisdiction over a dispute?',
    whatTheCodeDoes:
      'Nothing in the project establishes this. The office address is in Roorkee, Uttarakhand, but where a business is located does not by itself decide the governing clause — that is a decision to take, ideally with a solicitor.',
  },
  {
    id: 'grievance-officer',
    page: 'privacy',
    question:
      'Who is the Grievance Officer, and at what address and email may they be reached?',
    whatTheCodeDoes:
      'Indian intermediary rules require a site hosting third-party content to publish a named grievance officer with contact details and a response timeframe. The project holds the office address, telephone numbers and email, but names no individual for this role.',
  },
  {
    id: 'retention',
    page: 'privacy',
    question:
      'How long are accounts, advertisements and payment records kept after an account is closed or an advertisement expires?',
    whatTheCodeDoes:
      'Two retention periods are settled and enforced in the database: search terms are deleted after 90 days (app_settings key analytics.search_retention_days), and rate-limit counters after one hour. Nothing else is deleted on a schedule. Expired advertisements and settled payments are kept indefinitely, and payment records are the sort of thing tax rules normally require keeping for a set number of years — which is a decision for the office and its accountant.',
  },
  {
    id: 'account-deletion',
    page: 'privacy',
    question:
      'How should somebody ask for their account and data to be deleted, and what happens to their published advertisements and payment records when they do?',
    whatTheCodeDoes:
      'There is no self-service deletion in the interface. The database is set up so that removing an account removes its advertisements, images, payments, notifications and saved items with it — the audit trail deliberately survives, because a record of who approved what must not be erasable. Deletion today means writing to the office, and the page says that; what it cannot say is how quickly the office will act, or what it will keep for accounting.',
  },
  {
    id: 'eligibility-age',
    page: 'terms',
    question:
      'Is there a minimum age for holding an account or placing an advertisement?',
    whatTheCodeDoes:
      'The application asks for a name, an email address and optionally a telephone number. It does not ask for or verify age.',
  },
  {
    id: 'legal-entity',
    page: 'terms',
    question:
      'What is the legal form of the business, and are there registration details — GSTIN, for instance — that should appear on these pages?',
    whatTheCodeDoes:
      'The project holds the trading name "Shree Advertising & Marketing" and a postal address. It holds no registration number of any kind, and none has been invented.',
  },
];

export function decisionsFor(page: PendingDecision['page']): PendingDecision[] {
  return PENDING_DECISIONS.filter((decision) => decision.page === page);
}

/** The three policy pages, for the cross-links at the foot of each. */
export const POLICY_PAGES = [
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms & Conditions' },
  { href: '/disclaimer', label: 'Disclaimer' },
] as const;
