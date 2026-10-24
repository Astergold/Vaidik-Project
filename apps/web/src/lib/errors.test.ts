import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiCallError, apiGet, toApiError, toQueryString } from "@/lib/api";
import { decideErrorAction, handledLocally, safeRedirect, shouldRetry } from "@/lib/errors";
import { dismissToast, getToasts, resetToasts, toast } from "@/lib/toast";
import { z } from "zod";

const prod = { devSession: false, onAuthPage: false };

describe("decideErrorAction (D2-I4-01)", () => {
  it("401 outside auth pages redirects to /login", () => {
    expect(decideErrorAction(new ApiCallError(401, "UNAUTHENTICATED", "x"), prod)).toEqual({
      kind: "redirect-login",
    });
  });

  it("401 on an auth page is left to the form", () => {
    const action = decideErrorAction(new ApiCallError(401, "INVALID_EMAIL_OR_PASSWORD", "x"), {
      ...prod,
      onAuthPage: true,
    });
    expect(action.kind).toBe("ignore");
  });

  it("401 with the dev session toasts instead of bouncing to /login", () => {
    const action = decideErrorAction(new ApiCallError(401, "UNAUTHENTICATED", "x"), {
      ...prod,
      devSession: true,
    });
    expect(action).toMatchObject({ kind: "toast", title: "Not signed in" });
  });

  it("4xx shows the API's own message; 5xx and unknown errors stay generic", () => {
    expect(decideErrorAction(new ApiCallError(422, "VALIDATION_ERROR", "Bad stage"), prod)).toEqual(
      {
        kind: "toast",
        title: "That didn't work",
        description: "Bad stage",
      },
    );
    const five = decideErrorAction(
      new ApiCallError(500, "INTERNAL", "relation crm.secret_table does not exist"),
      prod,
    );
    expect(five).toMatchObject({ kind: "toast", title: "Something went wrong" });
    expect(JSON.stringify(five)).not.toContain("relation");
    expect(decideErrorAction(new TypeError("boom"), prod)).toMatchObject({ kind: "toast" });
  });

  it("403 and offline get their own titles", () => {
    expect(decideErrorAction(new ApiCallError(403, "FORBIDDEN", "No"), prod)).toMatchObject({
      title: "You don't have access to this",
    });
    expect(decideErrorAction(new ApiCallError(0, "NETWORK_ERROR", "down"), prod)).toMatchObject({
      title: "You're offline",
    });
  });
});

describe("shouldRetry", () => {
  it("never retries 4xx, retries 5xx/network once", () => {
    expect(shouldRetry(0, new ApiCallError(404, "NOT_FOUND", "x"))).toBe(false);
    expect(shouldRetry(0, new ApiCallError(503, "X", "x"))).toBe(true);
    expect(shouldRetry(1, new ApiCallError(503, "X", "x"))).toBe(false);
    expect(shouldRetry(0, new ApiCallError(0, "NETWORK_ERROR", "x"))).toBe(true);
  });
});

describe("safeRedirect", () => {
  it.each([
    ["/leads?stage=new", "/leads?stage=new"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    ["https://evil.example", "/"],
    [undefined, "/"],
    [42, "/"],
  ])("%s → %s", (input, expected) => expect(safeRedirect(input)).toBe(expected));
});

describe("toApiError", () => {
  it("reads the API envelope incl. 422 details", () => {
    const e = toApiError(422, {
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid",
        details: [{ path: "q", message: "x" }],
      },
    });
    expect(e).toMatchObject({ status: 422, code: "VALIDATION_ERROR", message: "Invalid" });
    expect(e.details).toEqual([{ path: "q", message: "x" }]);
  });

  it("reads Better Auth's flat { code, message }", () => {
    expect(
      toApiError(401, { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid" }),
    ).toMatchObject({
      code: "INVALID_EMAIL_OR_PASSWORD",
    });
  });

  it("falls back to a generic message for unknown bodies", () => {
    expect(toApiError(502, "<html>Bad gateway</html>")).toMatchObject({
      code: "HTTP_502",
      message: "Something went wrong on our side.",
    });
  });
});

describe("toQueryString", () => {
  it("repeats array keys and drops empty values", () => {
    expect(toQueryString({ page: 2, stage: ["new", "attempting"], q: "", sort: undefined })).toBe(
      "?page=2&stage=new&stage=attempting",
    );
    expect(toQueryString({})).toBe("");
  });
});

describe("apiGet", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("calls the same-origin path and parses with the contract", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(apiGet("/api/x", z.object({ ok: z.boolean() }), { a: 1 })).resolves.toEqual({
      ok: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/x?a=1",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("turns a network failure into status 0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))),
    );
    await expect(apiGet("/api/x", z.unknown())).rejects.toMatchObject({
      status: 0,
      code: "NETWORK_ERROR",
    });
  });
});

describe("toast store", () => {
  afterEach(() => resetToasts());

  it("dedupes identical toasts and keeps at most 3", () => {
    toast({ title: "A" });
    toast({ title: "A" });
    toast({ title: "B" });
    toast({ title: "C" });
    toast({ title: "D" });
    const snapshot = getToasts();
    expect(snapshot.map((t) => t.title)).toEqual(["B", "C", "D"]);
    dismissToast(snapshot[0]!.id);
    expect(getToasts().map((t) => t.title)).toEqual(["C", "D"]);
  });
});

describe("handledLocally", () => {
  it("silent swallows everything; handles only the listed statuses", () => {
    const e403 = new ApiCallError(403, "INSUFFICIENT_ROLE", "x");
    const e401 = new ApiCallError(401, "UNAUTHENTICATED", "x");
    expect(handledLocally(e401, { silent: true })).toBe(true);
    expect(handledLocally(e403, { handles: [403, 422] })).toBe(true);
    expect(handledLocally(e401, { handles: [403, 422] })).toBe(false);
    expect(handledLocally(e403, undefined)).toBe(false);
  });
});
