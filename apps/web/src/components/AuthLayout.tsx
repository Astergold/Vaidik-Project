import type { ReactNode } from "react";
import { BrandMark } from "@/components/BrandMark";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/** Login, forgot/reset password, accept invite: a centred branded card, no sidebar or top bar. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="flex justify-center">
          <BrandMark size="lg" />
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}
