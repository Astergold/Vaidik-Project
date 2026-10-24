import { QueueBoard } from "@/features/review/QueueBoard";

/** /calls/review (D4-I4-01): the review queue with the same side panel as the workspace. All tenant roles. */
export function CallsReviewPage() {
  return (
    <div className="mx-auto w-full max-w-5xl min-w-0 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Review queue</h1>
        <p className="text-sm text-muted-foreground">
          Listen, check the AI&apos;s labels against the transcript, verify or correct them.
        </p>
      </div>
      <QueueBoard kind="review_call" title="Review calls" />
    </div>
  );
}
