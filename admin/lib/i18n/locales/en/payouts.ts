import type { Shape } from '../../types';
import type { payouts as fr } from '../fr/payouts';

export const payouts: Shape<typeof fr> = {
  // ── lib/api/payouts.ts ────────────────────────────────────────────────────
  failureReason: {
    no_account: 'No Stripe account',
    stripe_error: 'Declined by Stripe',
    record_error: 'Sent, not recorded',
  },
  merchantAccount: {
    not_started: 'Bank account not linked — the merchant does this from their portal',
    onboarding: 'Stripe form started, not finished',
    review: 'Information being verified by Stripe',
    active: 'Stripe account active — paid every Friday',
    unavailable: 'Stripe status unavailable right now',
  },

  // ── /payouts: the couriers ────────────────────────────────────────────────
  title: 'Payouts',
  description: 'What the platform owes couriers, and the payout history.',
  merchantsLink: 'Shop payouts',
  runButton: 'Run payouts',
  searchPlaceholder: 'Search for a courier…',
  attemptStatus: {
    paid: 'Paid',
    skipped: 'Skipped',
    failed: 'Failed',
  },
  runStatus: {
    done: 'Completed',
    running: 'In progress',
    failed: 'Interrupted',
  },
  trigger: {
    admin: 'Administrator',
    schedule: 'Schedule',
    automatic: 'Automatic',
    automaticFriday: 'Automatic (Friday)',
  },
  tabs: {
    owed: 'To pay',
    failures: 'Failures',
    paid: 'Payouts',
    history: 'Runs',
  },
  filters: {
    all: 'All couriers',
    noAccount: 'No Stripe account',
    failed: 'Last payout failed',
  },
  kpi: {
    owed: 'To pay',
    owedHint: '{couriers} couriers · {runs} deliveries',
    noAccount: 'No Stripe account',
    noAccountHint: {
      one: '{count} courier cannot be paid',
      other: '{count} couriers cannot be paid',
    },
    paid30: 'Paid out over 30 days',
    paid30Hint: { one: '{count} courier paid', other: '{count} couriers paid' },
    failed30: 'Failures over 30 days',
    failed30Hint: 'Payouts declined or not recorded',
  },
  schedule: {
    title: 'Schedule',
    subtitle: 'Payouts go out automatically every Friday at 3 a.m. (Montreal time)',
    lastRun: {
      one: 'Last run: {date} · {amount} paid to {count} courier',
      other: 'Last run: {date} · {amount} paid to {count} couriers',
    },
    noRun: 'No payout run has been started yet.',
    oldestUnpaid: 'Oldest unpaid delivery: {date}',
  },
  columns: {
    courier: 'Courier',
    amountOwed: 'Amount owed',
    runs: 'Deliveries',
    oldest: 'Oldest',
    stripeAccount: 'Stripe account',
    lastAttempt: 'Last attempt',
    date: 'Date',
    amount: 'Amount',
    status: 'Status',
    detail: 'Details',
    stripeTransfer: 'Stripe transfer',
    startedBy: 'Started by',
    paidOut: 'Paid out',
    couriers: 'Couriers',
  },
  account: {
    active: 'Active',
    configured: 'Set up',
    toSetUp: 'Needs setup',
  },
  noAccountDetail: 'The courier has not finished signing up with Stripe.',
  runCounts: '{paid} paid · {skipped} without an account · {failed} failed',
  empty: {
    owedTitle: 'Nothing to pay',
    owedBody: 'No courier has a completed delivery awaiting payout.',
    failuresTitle: 'No failures',
    failuresBody: 'No payout has been declined so far.',
    paidTitle: 'No payouts',
    paidBody: 'No courier has been paid yet.',
    historyTitle: 'No runs',
    historyBody: 'Payouts have never been run.',
  },
  // The toast after a run: one whole sentence per outcome. `count` is the number paid.
  run: {
    done: {
      one: 'Payouts complete: {count} paid ({amount}).',
      other: 'Payouts complete: {count} paid ({amount}).',
    },
    doneSkipped: {
      one: 'Payouts complete: {count} paid ({amount}), {skipped} without a Stripe account.',
      other: 'Payouts complete: {count} paid ({amount}), {skipped} without a Stripe account.',
    },
    doneFailed: {
      one: 'Payouts complete: {count} paid ({amount}), {failed} failed.',
      other: 'Payouts complete: {count} paid ({amount}), {failed} failed.',
    },
    doneSkippedFailed: {
      one: 'Payouts complete: {count} paid ({amount}), {skipped} without a Stripe account, {failed} failed.',
      other: 'Payouts complete: {count} paid ({amount}), {skipped} without a Stripe account, {failed} failed.',
    },
    failed: 'The payouts could not be started.',
  },
  // The confirmation's description: these sentences one after the other, the second only when someone is skipped.
  confirm: {
    title: 'Run payouts?',
    amount: {
      one: '{amount} will be sent now to {count} courier through Stripe.',
      other: '{amount} will be sent now to {count} couriers through Stripe.',
    },
    skipped: {
      one: '{count} courier without a Stripe account ({amount}) will be skipped and paid at the next run after signing up.',
      other: '{count} couriers without a Stripe account ({amount}) will be skipped and paid at the next run after signing up.',
    },
    irreversible: 'A payout that has been sent cannot be cancelled here.',
  },
  // Column headers and cell values of the three CSV exports.
  csv: {
    courier: 'Courier',
    courierId: 'Courier ID',
    amountOwed: 'Amount owed ($)',
    runs: 'Deliveries',
    oldestRun: 'Oldest delivery',
    stripeAccount: 'Stripe account',
    lastAttempt: 'Last attempt',
    reason: 'Reason',
    attemptDate: 'Attempt date',
    date: 'Date',
    amount: 'Amount ($)',
    result: 'Result',
    error: 'Error',
    stripeTransfer: 'Stripe transfer',
    startedBy: 'Started by',
    batch: 'Batch',
    start: 'Start',
    end: 'End',
    state: 'Status',
    paid: 'Paid',
    skipped: 'Skipped',
    failed: 'Failed',
    amountPaid: 'Amount paid ($)',
    runDone: 'Completed',
    runFailed: 'Failed',
    runRunning: 'In progress',
  },

  // ── /payouts/merchants: the shops ─────────────────────────────────────────
  merchants: {
    title: 'Shop payouts',
    description: 'What the platform owes shops for delivered orders, and the payouts made.',
    couriersLink: 'Courier payouts',
    runButton: 'Pay shops',
    loadFailed: 'Could not load the shops’ balances. Reload the page.',
    status: {
      paid: 'Paid',
      pending: 'In progress',
      failed: 'Failed',
    },
    trigger: {
      admin: 'Administrator',
      schedule: 'Schedule',
    },
    notOpen: {
      title: 'Shop payouts are not open',
      body: 'No shop is paid until the start date is set on the server (the MERCHANT_PAYOUTS_FROM variable). Orders delivered before that date will never be paid by the platform: set it to the day real payments begin.',
    },
    kpi: {
      toPay: 'To pay out',
      toPayHint: { one: '{count} shop with a Stripe account', other: '{count} shops with a Stripe account' },
      noAccount: 'No Stripe account',
      noAccountHint: {
        one: '{count} shop waiting for its bank account',
        other: '{count} shops waiting for their bank account',
      },
      inDebt: 'Owed by shops',
      inDebtHint: 'Refunds to withhold from upcoming payouts',
    },
    owed: {
      title: 'To pay out',
      subtitleSince: 'Orders delivered since {date}, not yet paid out. Automatic payout every Friday.',
      subtitle: 'Orders delivered and not yet paid out.',
      emptyTitle: 'Nothing to pay out',
      emptyNotOpen: 'Balances will appear here once payouts are open.',
      emptyBody: 'No shop has a delivered order awaiting payout.',
    },
    history: {
      title: 'History',
      emptyTitle: 'No payouts',
      emptyBody: 'No shop has been paid yet.',
    },
    columns: {
      shop: 'Shop',
      nextPayout: 'Next payout',
      orders: 'Orders',
      refundsWithheld: 'Refunds withheld',
      oldest: 'Oldest',
      stripeAccount: 'Stripe account',
      date: 'Date',
      amount: 'Amount',
      status: 'Status',
      startedBy: 'Started by',
    },
    account: {
      linked: 'Linked',
      toSetUp: 'Needs setup',
    },
    // The toast after a run: one whole sentence per outcome. `count` is the number paid.
    run: {
      notOpen: 'Shop payouts are not open on this server: nothing was sent.',
      done: {
        one: 'Payouts complete: {count} paid ({amount}).',
        other: 'Payouts complete: {count} paid ({amount}).',
      },
      doneSkipped: {
        one: 'Payouts complete: {count} paid ({amount}), {skipped} without a Stripe account ready.',
        other: 'Payouts complete: {count} paid ({amount}), {skipped} without a Stripe account ready.',
      },
      doneFailed: {
        one: 'Payouts complete: {count} paid ({amount}), {failed} failed.',
        other: 'Payouts complete: {count} paid ({amount}), {failed} failed.',
      },
      doneSkippedFailed: {
        one: 'Payouts complete: {count} paid ({amount}), {skipped} without a Stripe account ready, {failed} failed.',
        other: 'Payouts complete: {count} paid ({amount}), {skipped} without a Stripe account ready, {failed} failed.',
      },
      failed: 'The payouts could not be started.',
    },
    // The confirmation's description: these sentences one after the other, the second only when a shop is skipped.
    confirm: {
      title: 'Pay shops?',
      amount: {
        one: '{amount} will be sent now to {count} shop through Stripe.',
        other: '{amount} will be sent now to {count} shops through Stripe.',
      },
      skipped: '{count} without a Stripe account ({amount}) will be skipped and paid at the first run after signing up.',
      notes:
        'A shop whose account Stripe has not finished verifying is skipped as well. A payout that has been sent cannot be cancelled here.',
    },
  },
};
