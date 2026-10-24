import { useEffect, useReducer, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import type {
  ApplicationColumnMapping,
  CreateApplicationImportResponse,
} from "@vernacular/contracts";
import { PageHeader } from "@/components/PageHeader";
import { RoleGate } from "@/components/RoleGate";
import { Button } from "@/components/ui/button";
import {
  ChooseStep,
  MapStep,
  PreviewStep,
  ProgressStep,
} from "@/features/applications/import/ApplicationImportSteps";
import {
  downloadApplicationErrors,
  useApplicationImportStatus,
  useApplicationPreview,
  useCommitApplications,
  useSaveApplicationMapping,
  useUploadApplications,
} from "@/features/applications/import/applications-import-api";
import { checkMapping, suggestMapping } from "@/features/applications/import/column-mapping";
import { errorText, uploadUnavailable } from "@/features/csv-import/csv-import-api";
import {
  checkFile,
  csvWizardReducer,
  initialCsvWizard,
  type CsvWizardAction,
  type CsvWizardState,
} from "@/features/csv-import/csv-machine";
import { ServiceUnavailable, StepIndicator } from "@/features/csv-import/CsvSteps";
import { isMissingRoute } from "@/lib/api";
import type { Remote } from "@/lib/remote";
import { useTenantTimeZone } from "@/lib/session";

type Upload = CreateApplicationImportResponse;
type State = CsvWizardState<Upload>;
type Dispatch = React.Dispatch<CsvWizardAction<Upload>>;
const reducer: (s: State, a: CsvWizardAction<Upload>) => State = csvWizardReducer;

/**
 * /applications/import (D5-I4-01): the shared CSV wizard for the portal export. Built against the proposed contract;
 * until D5-I1-01 lands the upload answers 404 and the wizard says so. No rows are ever made up client-side.
 */
export function ApplicationsImport() {
  return (
    <RoleGate page="applications.import">
      <Wizard />
    </RoleGate>
  );
}

function Wizard() {
  const [state, dispatch] = useReducer(reducer, initialCsvWizard);
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const upload = useUploadApplications();
  const cancel = () => {
    dispatch({ type: "cancel" });
    setFile(null);
    upload.reset();
  };
  const exit = () => {
    cancel();
    void navigate({ to: "/applications" });
  };
  const onUpload = () => {
    if (!file) return;
    const problem = checkFile(file);
    if (problem) return dispatch({ type: "fileRejected", reason: problem });
    upload.mutate(file, {
      onSuccess: (u) => dispatch({ type: "uploaded", upload: u }),
      onError: (err) =>
        uploadUnavailable(err)
          ? dispatch({ type: "serviceUnavailable" })
          : dispatch({
              type: "failed",
              message: errorText(err, "The upload didn't work. Try again."),
            }),
    });
  };

  return (
    <div className="mx-auto w-full max-w-5xl min-w-0 space-y-5">
      <PageHeader
        area="Applications"
        title="Import applications"
        back={{ to: "/applications", label: "Applications" }}
        actions={
          state.step !== "unavailable" &&
          state.step !== "progress" && (
            <Button variant="ghost" onClick={exit}>
              Cancel
            </Button>
          )
        }
      />
      {state.step !== "unavailable" && <StepIndicator current={state.step} />}
      {state.step === "choose" && (
        <ChooseStep
          file={file}
          onFile={(f) => {
            setFile(f);
            const problem = f ? checkFile(f) : null;
            dispatch(
              problem ? { type: "fileRejected", reason: problem } : { type: "fileAccepted" },
            );
          }}
          error={state.error}
          uploading={upload.isPending}
          onUpload={onUpload}
        />
      )}
      {state.step === "map" && (
        <MapContainer upload={state.upload} error={state.error} dispatch={dispatch} />
      )}
      {state.step === "preview" && (
        <PreviewContainer upload={state.upload} error={state.error} dispatch={dispatch} />
      )}
      {state.step === "progress" && (
        <ProgressContainer
          upload={state.upload}
          importId={state.importId}
          onDone={exit}
          dispatch={dispatch}
        />
      )}
      {state.step === "unavailable" && (
        <ServiceUnavailable
          action={
            <Button variant="outline" size="sm" onClick={exit}>
              Back to applications
            </Button>
          }
        >
          Importing applications needs a server feature that hasn&apos;t been switched on yet.
          Nothing was uploaded or imported.
        </ServiceUnavailable>
      )}
    </div>
  );
}

function MapContainer({
  upload,
  error,
  dispatch,
}: {
  upload: Upload;
  error: string | null;
  dispatch: Dispatch;
}) {
  const [mapping, setMapping] = useState<ApplicationColumnMapping>(() =>
    suggestMapping(upload.columns, upload.mapping),
  );
  const [problem, setProblem] = useState<string | null>(null);
  const save = useSaveApplicationMapping(upload.importId);
  return (
    <MapStep
      upload={upload}
      mapping={mapping}
      onMapping={(m) => {
        setMapping(m);
        setProblem(null);
      }}
      problem={problem}
      error={error}
      saving={save.isPending}
      onBack={() => dispatch({ type: "back" })}
      onSave={() => {
        const r = checkMapping(mapping);
        if (!r.ok) return setProblem(r.message);
        save.mutate(r.mapping, {
          onSuccess: () => dispatch({ type: "mappingSaved" }),
          onError: (err) =>
            isMissingRoute(err)
              ? dispatch({ type: "serviceUnavailable" })
              : dispatch({ type: "failed", message: errorText(err, "Couldn't save the mapping.") }),
        });
      }}
    />
  );
}

function PreviewContainer({
  upload,
  error,
  dispatch,
}: {
  upload: Upload;
  error: string | null;
  dispatch: Dispatch;
}) {
  const tz = useTenantTimeZone();
  const preview = useApplicationPreview(upload.importId, true);
  const commit = useCommitApplications(upload.importId);
  useEffect(() => {
    if (isMissingRoute(preview.error)) dispatch({ type: "serviceUnavailable" });
  }, [preview.error, dispatch]);
  const remote: Remote<NonNullable<typeof preview.data>> = preview.data
    ? { kind: "ready", data: preview.data }
    : preview.isError
      ? {
          kind: "error",
          message: errorText(preview.error, "Please try again."),
          retry: () => void preview.refetch(),
        }
      : { kind: "loading" };
  return (
    <PreviewStep
      preview={remote}
      tz={tz}
      error={error}
      committing={commit.isPending}
      onBack={() => dispatch({ type: "back" })}
      onCommit={() =>
        commit.mutate(undefined, {
          onSuccess: (job) => dispatch({ type: "committed", importId: job.id }),
          onError: (err) =>
            isMissingRoute(err)
              ? dispatch({ type: "serviceUnavailable" })
              : dispatch({
                  type: "failed",
                  message: errorText(err, "The import didn't start. Try again."),
                }),
        })
      }
    />
  );
}

function ProgressContainer({
  upload,
  importId,
  onDone,
  dispatch,
}: {
  upload: Upload;
  importId: string;
  onDone: () => void;
  dispatch: Dispatch;
}) {
  const status = useApplicationImportStatus(importId, true);
  const retry = useCommitApplications(importId);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  useEffect(() => {
    if (isMissingRoute(status.error)) dispatch({ type: "serviceUnavailable" });
  }, [status.error, dispatch]);
  const remote: Remote<NonNullable<typeof status.data>> = status.data
    ? { kind: "ready", data: status.data }
    : status.isError
      ? { kind: "error", message: errorText(status.error, ""), retry: () => void status.refetch() }
      : { kind: "loading" };
  return (
    <div className="space-y-4">
      <ProgressStep
        status={remote}
        downloading={downloading}
        downloadError={downloadError}
        retrying={retry.isPending}
        onRetryCommit={() => retry.mutate(undefined, { onSuccess: () => void status.refetch() })}
        onDone={onDone}
        onDownload={() => {
          setDownloading(true);
          setDownloadError(null);
          downloadApplicationErrors(importId, upload.fileName)
            .catch((err: unknown) =>
              setDownloadError(errorText(err, "Couldn't download the report.")),
            )
            .finally(() => setDownloading(false));
        }}
      />
      {status.data && status.data.counts.unmatched > 0 && (
        <p className="text-sm">
          <Link to="/applications/unmatched" className="font-medium text-primary hover:underline">
            Review {status.data.counts.unmatched} unmatched rows
          </Link>
        </p>
      )}
    </div>
  );
}
