import { useEffect, useReducer, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import type { CreateImportResponse } from "@vernacular/contracts";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  downloadErrorReport,
  errorText,
  isMissingRoute,
  uploadUnavailable,
  useCommit,
  useImportStatus,
  usePreview,
  useSaveMapping,
  useUpload,
} from "@/features/lead-sources/import/import-api";
import {
  checkFile,
  initialWizard,
  wizardReducer,
} from "@/features/lead-sources/import/import-machine";
import {
  ChooseStep,
  MapStep,
  PreviewStep,
  ProgressStep,
  StepIndicator,
  Unavailable,
  type Remote,
} from "@/features/lead-sources/import/ImportSteps";
import { fromDraft, toDraft, type MappingDraft } from "@/features/lead-sources/mapping";
import { useSources } from "@/features/lead-sources/sources-api";
import type { FieldErrors } from "@/lib/forms";

/**
 * Settings → Lead sources → Import CSV (D3-I4-03b). Built against the proposed contract in
 * packages/contracts/src/leads-import.ts; until D3-I3-03 lands the upload answers 404 and the wizard
 * says so ("not available yet"). No rows are ever made up client-side.
 */
export function ImportWizard() {
  const [state, dispatch] = useReducer(wizardReducer, initialWizard);
  const navigate = useNavigate();
  const sources = useSources();
  const [sourceId, setSourceId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const upload = useUpload();

  const active = sources.data?.items.filter((s) => s.isActive) ?? [];
  // Pre-select a CSV-type source when there is exactly an obvious one.
  useEffect(() => {
    if (sourceId || !sources.data) return;
    const csv = sources.data.items.filter((s) => s.isActive && s.kind === "csv");
    if (csv.length === 1) setSourceId(csv[0]!.id);
  }, [sources.data, sourceId]);

  const cancel = () => {
    dispatch({ type: "cancel" });
    setFile(null);
    upload.reset();
  };
  const exit = () => {
    cancel();
    void navigate({ to: "/settings/lead-sources" });
  };

  const onUpload = () => {
    if (!file) return;
    const problem = checkFile(file);
    if (problem) return dispatch({ type: "fileRejected", reason: problem });
    upload.mutate(
      { sourceId, file },
      {
        onSuccess: (u) => dispatch({ type: "uploaded", upload: u }),
        onError: (err) =>
          uploadUnavailable(err)
            ? dispatch({ type: "serviceUnavailable" })
            : dispatch({
                type: "failed",
                message: errorText(err, "The upload didn't work. Try again."),
              }),
      },
    );
  };

  const sourcesRemote: Remote<typeof active> = sources.data
    ? { kind: "ready", data: active }
    : sources.isError
      ? { kind: "error", message: "", retry: () => void sources.refetch() }
      : { kind: "loading" };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <Link
        to="/settings/lead-sources"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Lead sources
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Settings
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Import leads from CSV</h1>
        </div>
        {state.step !== "unavailable" && state.step !== "progress" && (
          <Button variant="ghost" onClick={exit}>
            Cancel
          </Button>
        )}
      </div>
      {state.step !== "unavailable" && <StepIndicator current={state.step} />}

      {state.step === "choose" && (
        <ChooseStep
          sources={sourcesRemote}
          sourceId={sourceId}
          onSource={setSourceId}
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
        <MapStepContainer upload={state.upload} error={state.error} dispatch={dispatch} />
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
        <Unavailable
          action={
            <Button variant="outline" size="sm" onClick={exit}>
              Back to lead sources
            </Button>
          }
        />
      )}
    </div>
  );
}

type Dispatch = React.Dispatch<Parameters<typeof wizardReducer>[1]>;

function MapStepContainer({
  upload,
  error,
  dispatch,
}: {
  upload: CreateImportResponse;
  error: string | null;
  dispatch: Dispatch;
}) {
  const [draft, setDraft] = useState<MappingDraft>(() => toDraft(upload.mapping));
  const [errors, setErrors] = useState<FieldErrors>({});
  const save = useSaveMapping(upload.importId);
  return (
    <MapStep
      upload={upload}
      draft={draft}
      onDraft={setDraft}
      errors={errors}
      error={error}
      saving={save.isPending}
      onBack={() => dispatch({ type: "back" })}
      onSave={() => {
        const r = fromDraft(draft, { columns: upload.columns });
        if (!r.ok) return setErrors(r.errors);
        setErrors({});
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
  upload: CreateImportResponse;
  error: string | null;
  dispatch: Dispatch;
}) {
  const preview = usePreview(upload.importId, true);
  const commit = useCommit(upload.importId);
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
      error={error}
      committing={commit.isPending}
      onBack={() => dispatch({ type: "back" })}
      onCommit={() =>
        commit.mutate(undefined, {
          onSuccess: (imp) => dispatch({ type: "committed", importId: imp.id }),
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
  upload: CreateImportResponse;
  importId: string;
  onDone: () => void;
  dispatch: Dispatch;
}) {
  const status = useImportStatus(importId, true);
  const retry = useCommit(importId);
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
        downloadErrorReport(importId, upload.fileName)
          .catch((err: unknown) =>
            setDownloadError(errorText(err, "Couldn't download the report.")),
          )
          .finally(() => setDownloading(false));
      }}
    />
  );
}
