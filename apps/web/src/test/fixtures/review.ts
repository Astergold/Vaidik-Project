import { callReview, queueItem, type CallReview, type QueueItem } from "@vernacular/contracts";

/** TEST fixtures, parsed with the proposed contracts (the app never renders made-up data). */
export const LEAD_ID = "01a14679-1d15-784c-bf57-ba49718c66bc";
export const uuidN = (n: number) => `01a14679-0000-7000-8000-${String(n).padStart(12, "0")}`;
export const TRANSCRIPT =
  "Agent: Hello, is this Aarav?\nStudent: Yes.  I am really keen on B.Tech CS\nbut the fees are too high for us.";

export const makeQueueItem = (n: number, over: Partial<QueueItem> = {}): QueueItem =>
  queueItem.parse({
    id: uuidN(100 + n),
    kind: "review_call",
    status: "open",
    reason: `AI rated warm (${n})`,
    dueAt: null,
    createdAt: "2026-10-17T05:00:00.000Z",
    lead: {
      id: uuidN(200 + n),
      name: `Lead ${n}`,
      phone: `••••••${String(1000 + n).slice(-4)}`,
      programName: "B.Tech Computer Science",
      stage: "connected",
      temperature: "warm",
    },
    callId: uuidN(300 + n),
    assigneeName: "Chitra Counsellor",
    ...over,
  });

export const makeCall = (
  callId: string,
  leadId: string,
  over: Partial<CallReview> = {},
): CallReview =>
  callReview.parse({
    callId,
    leadId,
    leadName: "Aarav Patil",
    phone: "••••••0001",
    direction: "outbound",
    status: "completed",
    durationS: 95,
    recordedAt: "2026-10-17T05:00:00.000Z",
    hasRecording: true,
    transcriptText: TRANSCRIPT,
    temperature: "warm",
    temperatureQuote: "I am really keen on B.Tech CS",
    nextStep: "book_visit",
    nextStepDueAt: null,
    summary: "Interested in B.Tech CS; worried about fees.",
    objections: [{ type: "fees", quote: "the fees are too high for us" }],
    languageDetected: "en",
    needsCounsellor: false,
    needsCounsellorReason: null,
    analysisModel: "analyst-v1",
    review: { state: "pending", temperature: null, byName: null, at: null, reason: null },
    ...over,
  });
