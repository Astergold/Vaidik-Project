import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { AuthHeader, FormAlert } from "@/components/auth/AuthParts";
import { Button } from "@/components/ui/button";
import { acceptInvitation, invitationProblem, type InvitationProblem } from "@/lib/auth";
import { useBranding } from "@/lib/branding";

const PROBLEM_TEXT: Record<Exclude<InvitationProblem, "sign-in">, string> = {
  "wrong-account":
    "This invitation was sent to a different email address than the one you're signed in with.",
  invalid: "This invitation is no longer valid. Ask your admin to send a new one.",
  other: "Couldn't accept the invitation. Please try again.",
};

/**
 * Lands from the invite email (`/accept-invitation/<id>`). Accepting needs a signed-in user with the
 * invited email; first-time sign-up for invitees arrives with the team work on Day 6.
 */
export function AcceptInvitation({ invitationId }: { invitationId: string }) {
  const { productName } = useBranding();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const accept = useMutation({
    mutationFn: () => acceptInvitation(invitationId),
    meta: { silent: true },
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ["me"] });
      await navigate({ to: "/", replace: true });
    },
  });
  const problem = accept.isError ? invitationProblem(accept.error) : null;
  const here = `/accept-invitation/${invitationId}`;

  return (
    <div className="space-y-4">
      <AuthHeader title="You're invited">Join your team on {productName}.</AuthHeader>
      {problem === "sign-in" && (
        <FormAlert>
          Sign in with the email address the invitation was sent to, then accept.{" "}
          <Link to="/login" search={{ redirect: here }} className="font-medium underline">
            Sign in
          </Link>
        </FormAlert>
      )}
      {problem && problem !== "sign-in" && <FormAlert>{PROBLEM_TEXT[problem]}</FormAlert>}
      <Button className="w-full" disabled={accept.isPending} onClick={() => accept.mutate()}>
        Accept invitation
      </Button>
      <p className="text-center text-sm">
        <Link
          to="/login"
          search={{ redirect: here }}
          className="font-medium text-primary hover:underline"
        >
          Sign in with a different account
        </Link>
      </p>
    </div>
  );
}
