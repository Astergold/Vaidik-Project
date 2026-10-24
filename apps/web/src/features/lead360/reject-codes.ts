import { POLICY_REJECT_CODES, type PolicyRejectCode } from "@vernacular/contracts";
import { formatDateTime } from "@/lib/labels";

/**
 * Plain-language text for the policy engine's reject codes (packages/policy evaluate.ts, rules 1–10).
 * A blocked call is not an error: the page shows this as a warning with the time it can happen.
 */
export const REJECT_COPY: Record<PolicyRejectCode, { title: string; detail: string }> = {
  TENANT_SUSPENDED: {
    title: "Calling is paused for this institution",
    detail: "The account is suspended. Contact your administrator.",
  },
  WALLET_EMPTY: {
    title: "Calling credit has run out",
    detail: "Ask an admin to top up the wallet, then try again.",
  },
  SUPPRESSED: {
    title: "This person asked not to be contacted",
    detail: "They are on the do-not-contact list, so no calls are placed.",
  },
  NDNC_LISTED: {
    title: "Number is on the Do-Not-Call registry",
    detail: "The national DND registry lists this number, so it can't be called.",
  },
  NDNC_UNKNOWN: {
    title: "Do-Not-Call status not checked yet",
    detail: "The number hasn't been checked against the DND registry. Try again once it has.",
  },
  NO_CONSENT: {
    title: "No consent to call",
    detail: "This person hasn't agreed to be called.",
  },
  OUTSIDE_WINDOW: {
    title: "Outside calling hours",
    detail: "Calls are only placed during the institution's calling hours.",
  },
  CAP_REACHED: {
    title: "Call limit reached",
    detail: "This lead has had the maximum number of call attempts allowed.",
  },
  TOO_SOON: {
    title: "Too soon after the last call",
    detail: "There's a minimum gap between calls to the same person.",
  },
  PROMO_NUMBER_REQUIRED: {
    title: "Needs a registered promotional number",
    detail: "Promotional calls must come from a registered 140-series number, and none is set up.",
  },
  CALL_IN_PROGRESS: {
    title: "A call is already in progress",
    detail: "Wait for the current call to finish.",
  },
};

export interface RejectionView {
  code: string;
  title: string;
  detail: string;
  /** "Can try again 18 Oct, 9:00 am" in the tenant's timezone, when the engine knows. */
  retry: string | null;
}

const isKnown = (code: string): code is PolicyRejectCode =>
  (POLICY_REJECT_CODES as readonly string[]).includes(code);

/** `code` is a free string on `lead.lastRejectCode`, so unknown codes get a generic line (code still shown). */
export function describeRejection(
  code: string,
  retryAt: string | null | undefined,
  timeZone: string,
): RejectionView {
  const copy = isKnown(code)
    ? REJECT_COPY[code]
    : { title: "The call wasn't placed", detail: "The calling rules blocked this call." };
  return {
    code,
    ...copy,
    retry: retryAt ? `Can try again ${formatDateTime(retryAt, timeZone)}` : null,
  };
}
