import { describe, expect, it } from "vitest";
import {
  checkDraft,
  emptyDraft,
  slugify,
  timezoneOptions,
  withName,
} from "@/features/platform/tenant-form";

const PLAN = "01a14679-0000-7000-8000-0000000007b1";

describe("create-tenant draft (D6-I4-01)", () => {
  it("slug follows the name until edited by hand", () => {
    expect(slugify("MIT-ADT University, Pune")).toBe("mit-adt-university-pune");
    expect(slugify("  Sāvitrībāi College  ")).toBe("savitribai-college");
    expect(slugify("A".repeat(50))).toHaveLength(40);
    const d = withName(emptyDraft(), "Demo College");
    expect(d.slug).toBe("demo-college");
    expect(withName({ ...d, slug: "demo", slugTouched: true }, "Demo College Pune").slug).toBe(
      "demo",
    );
  });

  it("validates with the contract; Voice Engine fields only when using an existing org", () => {
    const base = {
      ...withName(emptyDraft(), "Demo College"),
      planId: PLAN,
      ownerEmail: " Owner@Demo.Local ",
    };
    const ok = checkDraft(base);
    expect(ok).toEqual({
      ok: true,
      body: {
        name: "Demo College",
        slug: "demo-college",
        timezone: "Asia/Kolkata",
        planId: PLAN,
        billingMode: "prepaid",
        voiceEngine: { mode: "create" },
        ownerEmail: "Owner@Demo.Local",
        ownerName: undefined,
      },
    });

    const bad = checkDraft({
      ...base,
      voiceMode: "existing",
      slug: "-x",
      planId: "",
      ownerEmail: "nope",
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(Object.keys(bad.errors).sort()).toEqual(
        ["ownerEmail", "planId", "slug", "voice.apiKey", "voice.orgId"].sort(),
      );
      expect(bad.errors["voice.orgId"]).toBe("Enter the Voice Engine Org ID");
    }
  });

  it("timezones: Asia/Kolkata first, no duplicates", () => {
    const tz = timezoneOptions();
    expect(tz[0]).toBe("Asia/Kolkata");
    expect(new Set(tz).size).toBe(tz.length);
  });
});
