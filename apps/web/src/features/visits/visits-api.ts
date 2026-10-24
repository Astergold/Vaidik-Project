import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createMeetingBody,
  createVisitBody,
  meeting,
  meetingsListResponse,
  patchMeetingBody,
  patchVisitBody,
  tasksListResponse,
  visit,
  visitSlotsResponse,
  visitsListResponse,
  type MeetingStatus,
  type VisitStatus,
} from "@vernacular/contracts";
import type { z } from "zod";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import type { ErrorMeta } from "@/lib/errors";

/**
 * Visits / meetings / tasks (D4-I4-02) against the PROPOSED contract (packages/contracts/src/visits.ts).
 * Not built yet: a "Route not found" 404 is shown as "not available yet". Slots only ever come from the API.
 */
export const VISITS_META: ErrorMeta = { handles: [0, 400, 403, 404, 409, 422, 500, 502, 503, 504] };

// type aliases (not interfaces) so they are assignable to the query-string record
export type VisitsFilter = {
  from?: string;
  to?: string;
  status?: VisitStatus[];
  campus?: string;
  bookedBy?: "ai" | "user";
  leadId?: string;
};
export type MeetingsFilter = {
  from?: string;
  to?: string;
  status?: MeetingStatus[];
  leadId?: string;
};

export const useVisits = (f: VisitsFilter, enabled = true) =>
  useQuery({
    queryKey: ["visits", f],
    queryFn: () => apiGet("/api/visits", visitsListResponse, f),
    enabled,
    retry: false,
    meta: VISITS_META,
  });

export const useMeetings = (f: MeetingsFilter, enabled = true) =>
  useQuery({
    queryKey: ["meetings", f],
    queryFn: () => apiGet("/api/meetings", meetingsListResponse, f),
    enabled,
    retry: false,
    meta: VISITS_META,
  });

export const useMyTasks = (dueBefore: string) =>
  useQuery({
    queryKey: ["tasks", { mine: true, status: "open", dueBefore }],
    queryFn: () =>
      apiGet("/api/tasks", tasksListResponse, { mine: true, status: "open", dueBefore }),
    retry: false,
    meta: VISITS_META,
  });

export const useVisitSlots = (campus: string, day: string, enabled: boolean) =>
  useQuery({
    queryKey: ["visits", "slots", campus, day],
    queryFn: () =>
      apiGet("/api/visits/slots", visitSlotsResponse, {
        campus: campus || undefined,
        from: day,
        to: day,
      }),
    enabled,
    retry: false,
    meta: VISITS_META,
  });

/** After any change: visits/meetings lists, the lead (stage auto-move happens server-side) and the leads list. */
function useAfterChange() {
  const qc = useQueryClient();
  return (leadId: string) => {
    void qc.invalidateQueries({ queryKey: ["visits"] });
    void qc.invalidateQueries({ queryKey: ["meetings"] });
    void qc.invalidateQueries({ queryKey: ["lead", leadId] });
    void qc.invalidateQueries({ queryKey: ["leads"] });
  };
}

export function useCreateVisit() {
  const after = useAfterChange();
  return useMutation({
    mutationFn: (b: z.input<typeof createVisitBody>) =>
      apiPost("/api/visits", createVisitBody.parse(b), visit),
    meta: VISITS_META,
    onSuccess: (v) => after(v.lead.id),
  });
}

export function usePatchVisit(id: string, leadId: string) {
  const after = useAfterChange();
  return useMutation({
    mutationFn: (b: z.input<typeof patchVisitBody>) =>
      apiPatch(`/api/visits/${id}`, patchVisitBody.parse(b), visit),
    meta: VISITS_META,
    onSuccess: () => after(leadId),
  });
}

export function useCreateMeeting() {
  const after = useAfterChange();
  return useMutation({
    mutationFn: (b: z.input<typeof createMeetingBody>) =>
      apiPost("/api/meetings", createMeetingBody.parse(b), meeting),
    meta: VISITS_META,
    onSuccess: (m) => after(m.lead.id),
  });
}

export function usePatchMeeting(id: string, leadId: string) {
  const after = useAfterChange();
  return useMutation({
    mutationFn: (b: z.input<typeof patchMeetingBody>) =>
      apiPatch(`/api/meetings/${id}`, patchMeetingBody.parse(b), meeting),
    meta: VISITS_META,
    onSuccess: () => after(leadId),
  });
}
