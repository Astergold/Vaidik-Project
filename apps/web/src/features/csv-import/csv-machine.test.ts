import { describe, expect, it } from "vitest";
import {
  checkFile,
  csvWizardReducer,
  initialCsvWizard,
  isFinished,
  percent,
  type CsvWizardAction,
  type CsvWizardState,
} from "@/features/csv-import/csv-machine";

// The machine is generic over the upload response: any consumer's shape flows through untouched.
type AppUpload = { importId: string; columns: string[] };
const upload: AppUpload = { importId: "imp-1", columns: ["Application No", "Status"] };
const run = (...actions: CsvWizardAction<AppUpload>[]) =>
  actions.reduce<CsvWizardState<AppUpload>>(csvWizardReducer, initialCsvWizard);

describe("shared CSV wizard machine (D5-I4-01)", () => {
  it("carries a consumer's upload through map → preview → progress", () => {
    expect(run({ type: "uploaded", upload }, { type: "mappingSaved" })).toEqual({
      step: "preview",
      upload,
      error: null,
    });
    expect(
      run(
        { type: "uploaded", upload },
        { type: "mappingSaved" },
        { type: "committed", importId: "imp-1" },
      ),
    ).toEqual({ step: "progress", upload, importId: "imp-1" });
  });

  it("unavailable is terminal until cancel", () => {
    const s = run({ type: "serviceUnavailable" });
    expect(csvWizardReducer(s, { type: "uploaded", upload })).toEqual({ step: "unavailable" });
    expect(csvWizardReducer(s, { type: "cancel" })).toEqual(initialCsvWizard);
  });

  it("file limit is configurable per consumer", () => {
    expect(checkFile({ name: "a.csv", size: 2048, type: "text/csv" }, 1024)).toMatch(
      /limit is 1 KB/,
    );
    expect(checkFile({ name: "a.csv", size: 512, type: "text/csv" }, 1024)).toBeNull();
  });

  it("finished / percent helpers", () => {
    expect(isFinished("running")).toBe(false);
    expect(isFinished("mapped")).toBe(false);
    expect(isFinished("completed")).toBe(true);
    expect(isFinished("failed")).toBe(true);
    expect(percent(1, 3)).toBe(33);
    expect(percent(5, 0)).toBe(0);
    expect(percent(9, 4)).toBe(100);
  });
});
