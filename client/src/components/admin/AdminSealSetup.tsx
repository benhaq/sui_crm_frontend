import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KeyRound, Loader2 } from "lucide-react";
import type { SessionKey } from "@mysten/seal";

interface AdminSealSetupProps {
  initializeAdminSealSession: () => Promise<void>;
  isInitializingSealAdmin: boolean;
  sessionKeyForAdmin: SessionKey | null;
  adminSealError: string | null;
}

export function AdminSealSetup({
  initializeAdminSealSession,
  isInitializingSealAdmin,
  sessionKeyForAdmin,
  adminSealError,
}: AdminSealSetupProps) {
  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>Admin Seal Setup</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Initialize your Seal client and session key to enable decryption of
          work logs. The session key will be stored locally and reused.
        </p>
        <Button
          onClick={initializeAdminSealSession}
          disabled={
            isInitializingSealAdmin ||
            (!!sessionKeyForAdmin && !sessionKeyForAdmin.isExpired())
          }
        >
          <KeyRound className="h-4 w-4 mr-2" />
          {isInitializingSealAdmin ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Initializing...
            </>
          ) : sessionKeyForAdmin && !sessionKeyForAdmin.isExpired() ? (
            "Seal Session Active"
          ) : (
            "Initialize/Refresh Seal Session"
          )}
        </Button>
        {sessionKeyForAdmin && !sessionKeyForAdmin.isExpired() && (
          <p className="text-xs text-green-600">
            Admin Seal session key is active.
          </p>
        )}
        {adminSealError && (
          <p className="text-sm text-destructive">Error: {adminSealError}</p>
        )}
      </CardContent>
    </Card>
  );
}
