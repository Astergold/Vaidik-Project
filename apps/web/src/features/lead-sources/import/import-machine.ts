import type { CreateImportResponse, LeadImport } from "@vernacular/contracts";
import {
  csvWizardReducer,
  initialCsvWizard,
  isFinished,
  percent,
  type CsvWizardAction,
  type CsvWizardState,
} from "@/features/csv-import/csv-machine";

/**
 * Lead CSV import (D3-I4-03b): the shared wizard machine (features/csv-import) typed for lead uploads, plus the
 * lead-specific progress summary. Kept as its own module so lead-sources imports stay stable.
 */
export type WizardState = CsvWizardState<CreateImportResponse>;
export type WizardAction = CsvWizardAction<CreateImportResponse>;
export const initialWizard: WizardState = initialCsvWizard;
export const wizardReducer: (s: WizardState, a: WizardAction) => WizardState = csvWizardReducer;

export {
  checkFile,
  formatBytes,
  isActive,
  STEP_LABEL,
  STEP_ORDER,
} from "@/features/csv-import/csv-machine";

export function progressSummary(imp: LeadImport) {
  const { imported, duplicates, failed, pending } = imp.counts;
  const done = imported + duplicates + failed;
  return {
    done,
    pct: percent(done, imp.totalRows),
    imported,
    duplicates,
    failed,
    pending,
    finished: isFinished(imp.status),
  };
}
