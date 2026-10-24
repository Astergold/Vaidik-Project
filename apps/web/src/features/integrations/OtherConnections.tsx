import { Link } from "@tanstack/react-router";
import { BookOpen, ExternalLink, Plug } from "lucide-react";

/**
 * Links next to the API keys and webhooks (D5-I4-03): the live Day-3 Lead sources page, and the public API docs
 * (served by the API at /v1/docs, D5-I2-02). The web app only calls /api/*, so it doesn't probe /v1 — the card says
 * the docs ship with the public API instead of pretending they exist.
 */
export function OtherConnections() {
  return (
    <section className="min-w-0 space-y-3" aria-labelledby="other-heading">
      <h2 id="other-heading" className="text-lg font-semibold">
        Other connections
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        <li className="rounded-lg border bg-card p-4">
          <Link to="/settings/lead-sources" className="group block space-y-1">
            <span className="flex items-center gap-2 font-medium group-hover:underline">
              <Plug className="size-4 text-muted-foreground" aria-hidden /> Lead sources
            </span>
            <span className="block text-sm text-muted-foreground">
              Web forms, lead providers and CSV imports that send you leads, each with its own URL
              and token.
            </span>
          </Link>
        </li>
        <li className="rounded-lg border bg-card p-4">
          <a href="/v1/docs" target="_blank" rel="noreferrer" className="group block space-y-1">
            <span className="flex items-center gap-2 font-medium group-hover:underline">
              <BookOpen className="size-4 text-muted-foreground" aria-hidden /> API documentation
              <ExternalLink className="size-3.5 text-muted-foreground" aria-hidden />
            </span>
            <span className="block text-sm text-muted-foreground">
              Endpoints, examples and the webhook signature recipe. Opens once the public API is
              switched on for your account.
            </span>
          </a>
        </li>
      </ul>
    </section>
  );
}
