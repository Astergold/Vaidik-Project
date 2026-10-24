import { CopyField, SecretReveal } from "@/components/SecretReveal";

export { CopyField };

/** The lead source's bearer token, shown exactly once (after create or rotate), via the shared SecretReveal. */
export function TokenReveal({
  endpointUrl,
  token,
  onDone,
}: {
  endpointUrl: string;
  token: string;
  onDone: () => void;
}) {
  return (
    <SecretReveal
      noun="token"
      lostHint="If it's lost, rotate it to get a new one (the old one stops working)."
      fields={[
        { id: "endpoint-url", label: "Endpoint URL", value: endpointUrl },
        { id: "source-token", label: "Token (send as Authorization: Bearer …)", value: token },
      ]}
      example={{
        label: "Example request",
        code: `curl -X POST "${endpointUrl}" \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Asha Rao","mobile":"98765 43210"}'`,
      }}
      onDone={onDone}
    />
  );
}
