/** On/off control: a native checkbox exposed as role="switch" (same as the AI agents active toggle). */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  onText = "On",
  offText = "Off",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name. */
  label: string;
  disabled?: boolean;
  onText?: string;
  offText?: string;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-primary"
      />
      <span aria-hidden>{checked ? onText : offText}</span>
    </label>
  );
}
