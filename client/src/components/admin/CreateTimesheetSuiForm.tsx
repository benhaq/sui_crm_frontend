import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Plus } from "lucide-react";
import React from "react";

interface CreateTimesheetFormValues {
  name: string;
}

interface CreateTimesheetFormProps {
  createForm: CreateTimesheetFormValues;
  setCreateForm: React.Dispatch<
    React.SetStateAction<CreateTimesheetFormValues>
  >;
  handleCreateTimesheet: (e: React.FormEvent) => void;
  isCreatingTimesheet: boolean;
  isMutationPending: boolean; // To handle general pending state of the mutation
  canSubmit: boolean; // To control button disable based on wallet/packageId
  packageId?: string | null;
}

export function CreateTimesheetSuiForm({
  // Renamed to avoid conflict if a general form exists
  createForm,
  setCreateForm,
  handleCreateTimesheet,
  isCreatingTimesheet, // Specific to this form's internal state if needed, or could be merged with isMutationPending
  isMutationPending,
  canSubmit,
  packageId,
}: CreateTimesheetFormProps) {
  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>Create New Timesheet (Sui)</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleCreateTimesheet} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2 md:col-span-4">
              <Label htmlFor="name">Project Name *</Label>
              <Input
                id="name"
                type="text"
                placeholder="Enter project name (e.g., WorklogMay2025)"
                value={createForm.name}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    name: e.target.value,
                  }))
                }
                required
              />
            </div>
          </div>

          {isCreatingTimesheet && ( // Or use isMutationPending if isCreatingTimesheet state is removed from parent
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-md p-3 text-blue-300">
              <div className="flex items-center space-x-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">
                  Creating timesheet on Sui blockchain...
                </span>
              </div>
            </div>
          )}

          <Button
            type="submit"
            disabled={isMutationPending || !canSubmit}
            className="w-full md:w-auto"
          >
            {isMutationPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Create Timesheet
              </>
            )}
          </Button>
          {!packageId && (
            <p className="text-xs text-destructive">
              Package ID not loaded. Check network configuration.
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
