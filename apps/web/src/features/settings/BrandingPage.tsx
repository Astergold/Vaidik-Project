import { useEffect, useState, type FormEvent } from "react";
import {
  BRANDING_ASSET_TYPES,
  MAX_BRANDING_ASSET_BYTES,
  putBrandingBody,
  type BrandingSettings,
} from "@vernacular/contracts";
import { CheckCircle2, ImageUp, Loader2, Undo2, X } from "lucide-react";
import { FormAlert } from "@/components/auth/AuthParts";
import { BrandMark } from "@/components/BrandMark";
import { PageHeader } from "@/components/PageHeader";
import { QueryGate } from "@/components/QueryGate";
import { RoleGate } from "@/components/RoleGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBytes } from "@/features/csv-import/csv-machine";
import {
  useBrandingSettings,
  useSaveBranding,
  useUploadBrandingAsset,
} from "@/features/settings/branding-api";
import { useBrandingPreview } from "@/lib/branding";
import { errText } from "@/lib/seam";

/**
 * /settings/branding (D6-I4-02). Every keystroke previews app-wide through BrandingProvider (no request); Save sends
 * one PUT; Cancel or leaving the page restores the saved branding.
 */
export function BrandingPage() {
  return (
    <RoleGate page="settings.branding">
      <div className="mx-auto w-full max-w-4xl min-w-0 space-y-4">
        <PageHeader
          area="Settings"
          title="Branding"
          description="Your name, colour and logo across the app, the sign-in page and emails. Changes preview instantly."
        />
        <Loaded />
      </div>
    </RoleGate>
  );
}

function Loaded() {
  const q = useBrandingSettings();
  const save = useSaveBranding();
  return (
    <QueryGate q={q} what="branding" service="Branding">
      {q.data && <BrandingForm key={q.dataUpdatedAt} saved={q.data} save={save} />}
    </QueryGate>
  );
}

const DEFAULT_SWATCH = "#4f46e5";
const HEX = /^#[0-9a-f]{6}$/i;

/** Client checks before upload; the server re-checks type and size. */
export function checkAsset(file: { type: string; size: number }): string | null {
  if (!(BRANDING_ASSET_TYPES as readonly string[]).includes(file.type))
    return "Use a PNG, SVG, JPEG, WebP or ICO image.";
  if (file.size > MAX_BRANDING_ASSET_BYTES)
    return `That image is ${formatBytes(file.size)}; the limit is ${formatBytes(MAX_BRANDING_ASSET_BYTES)}.`;
  return null;
}

function BrandingForm({
  saved,
  save,
}: {
  saved: BrandingSettings;
  save: ReturnType<typeof useSaveBranding>;
}) {
  const { setPreview } = useBrandingPreview();
  const upload = useUploadBrandingAsset();
  const [productName, setProductName] = useState(saved.productName);
  const [brandColor, setBrandColor] = useState<string | null>(saved.brandColor);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [assetProblem, setAssetProblem] = useState<string | null>(null);
  const logoUrl = removeLogo ? null : saved.logoUrl;

  // Live preview: instant, app-wide, no request. Dropped when the form unmounts (leave page, or remount after save).
  useEffect(() => {
    // A half-typed hex never reaches --brand: invalid values preview the saved colour.
    const colour = brandColor === null || HEX.test(brandColor) ? brandColor : saved.brandColor;
    setPreview({
      productName: productName.trim() || saved.productName,
      brandColor: colour,
      logoUrl,
    });
  }, [productName, brandColor, logoUrl, saved.productName, saved.brandColor, setPreview]);
  useEffect(() => () => setPreview(null), [setPreview]);

  const dirty = productName !== saved.productName || brandColor !== saved.brandColor || removeLogo;
  const reset = () => {
    setProductName(saved.productName);
    setBrandColor(saved.brandColor);
    setRemoveLogo(false);
    setErrors({});
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = putBrandingBody.safeParse({
      productName,
      brandColor,
      ...(removeLogo ? { logoUrl: null } : {}),
    });
    if (!r.success)
      return setErrors(
        Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])),
      );
    setErrors({});
    save.mutate(r.data);
  };
  const pick = (kind: "logo" | "favicon", file: File | undefined) => {
    if (!file) return;
    const problem = checkAsset(file);
    setAssetProblem(problem);
    if (!problem) upload.mutate({ kind, file });
  };

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[1fr_20rem]">
      <form noValidate onSubmit={submit} className="min-w-0 space-y-4">
        <section
          className="min-w-0 space-y-4 rounded-lg border bg-card p-4"
          aria-label="Name and colour"
        >
          <div className="space-y-1.5">
            <Label htmlFor="b-name">Product name</Label>
            <Input
              id="b-name"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              maxLength={60}
            />
            {errors.productName && <p className="text-sm text-destructive">{errors.productName}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-colour">Brand colour</Label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="b-colour"
                type="color"
                value={brandColor ?? DEFAULT_SWATCH}
                onChange={(e) => setBrandColor(e.target.value)}
                className="h-9 w-14 cursor-pointer rounded-md border bg-card p-1"
              />
              <Input
                aria-label="Brand colour hex"
                value={brandColor ?? ""}
                placeholder="Default"
                onChange={(e) => setBrandColor(e.target.value.trim() || null)}
                className="w-32 font-mono"
                maxLength={7}
              />
              {brandColor && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setBrandColor(null)}>
                  Use default
                </Button>
              )}
            </div>
            {errors.brandColor && <p className="text-sm text-destructive">{errors.brandColor}</p>}
          </div>
        </section>

        <section
          className="min-w-0 space-y-4 rounded-lg border bg-card p-4"
          aria-label="Logo and favicon"
        >
          {(["logo", "favicon"] as const).map((kind) => {
            const url = kind === "logo" ? logoUrl : saved.faviconUrl;
            return (
              <div key={kind} className="flex flex-wrap items-center gap-3">
                <div className="grid size-12 shrink-0 place-items-center rounded-md border bg-muted">
                  {url ? (
                    <img src={url} alt="" className="size-10 object-contain" />
                  ) : (
                    <ImageUp className="size-5 text-muted-foreground" aria-hidden />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium capitalize">{kind}</p>
                  <p className="text-xs text-muted-foreground">
                    {kind === "logo"
                      ? "Square works best, at least 128 px."
                      : "Browser tab icon, 32 or 64 px."}{" "}
                    PNG, SVG, JPEG, WebP or ICO up to {formatBytes(MAX_BRANDING_ASSET_BYTES)}.
                  </p>
                </div>
                <label className="cursor-pointer">
                  <span className="sr-only">Upload {kind}</span>
                  <input
                    type="file"
                    accept={BRANDING_ASSET_TYPES.join(",")}
                    className="block max-w-56 text-sm file:mr-2 file:rounded-md file:border file:bg-card file:px-2 file:py-1 file:text-sm"
                    onChange={(e) => pick(kind, e.target.files?.[0])}
                    aria-label={`Upload ${kind}`}
                  />
                </label>
                {kind === "logo" && url && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setRemoveLogo(true)}
                  >
                    <X /> Remove
                  </Button>
                )}
              </div>
            );
          })}
          {upload.isPending && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin" /> Uploading…
            </p>
          )}
          {assetProblem && <FormAlert>{assetProblem}</FormAlert>}
          {upload.isError && (
            <FormAlert>{errText(upload.error, "Couldn't upload the image.")}</FormAlert>
          )}
        </section>

        {save.isError && (
          <FormAlert>{errText(save.error, "Couldn't save the branding.")}</FormAlert>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={save.isPending || !dirty}>
            {save.isPending && <Loader2 className="animate-spin" />}
            Save branding
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={reset}
            disabled={!dirty || save.isPending}
          >
            <Undo2 /> Cancel changes
          </Button>
          {save.isSuccess && !dirty && (
            <span role="status" className="flex items-center gap-1 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4" /> Saved
            </span>
          )}
        </div>
      </form>

      <aside className="min-w-0 space-y-2" aria-label="Preview">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Preview</p>
        <div className="space-y-3 rounded-lg border bg-sidebar p-4">
          <BrandMark />
          <div className="space-y-2 rounded-md border bg-card p-3">
            <p className="text-sm font-medium">
              Sign in to {productName.trim() || saved.productName}
            </p>
            <div className="h-8 rounded-md border bg-background" />
            <Button size="sm" className="w-full" type="button" tabIndex={-1}>
              Sign in
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            The whole app is previewing these changes until you save or cancel.
          </p>
        </div>
      </aside>
    </div>
  );
}
