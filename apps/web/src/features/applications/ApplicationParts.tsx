import type { ApplicationStatus } from "@vernacular/contracts";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Labels and the status chip shared by the list, the Lead 360 panel and the unmatched review. */
export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  not_started: "Not started",
  form_started: "Form started",
  form_submitted: "Form submitted",
  fee_paid: "Fee paid",
  admitted: "Admitted",
  enrolled: "Enrolled",
  withdrawn: "Withdrawn",
};

const PAID_OR_LATER: readonly ApplicationStatus[] = ["fee_paid", "admitted", "enrolled"];

export function ApplicationStatusChip({ status }: { status: ApplicationStatus }) {
  return (
    <Badge
      variant={
        PAID_OR_LATER.includes(status)
          ? "default"
          : status === "withdrawn"
            ? "outline"
            : "secondary"
      }
      className={cn(status === "withdrawn" && "text-muted-foreground line-through")}
    >
      {APPLICATION_STATUS_LABEL[status]}
    </Badge>
  );
}

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
/** Whole rupees → "₹1,25,000"; null → "—". */
export const formatInr = (n: number | null) => (n === null ? "—" : INR.format(n));

const SOURCE_LABEL: Record<string, string> = { csv: "CSV import", api: "API", portal: "Portal" };
export const sourceLabel = (s: string) => SOURCE_LABEL[s] ?? s;
