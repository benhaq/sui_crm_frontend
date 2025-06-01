import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

// Sui imports
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { useNetworkVariable } from "@/networkConfig"; // For packageId

interface AddEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  timesheetId: string | null; // This is the Whitelist object ID
  capId: string | null; // This is the Cap object ID for the Whitelist
}

interface AddEmployeeForm {
  employeeAddress: string;
}

export function AddEmployeeModal({
  isOpen,
  onClose,
  timesheetId, // Whitelist ID
  capId, // Cap ID
}: AddEmployeeModalProps) {
  const [form, setForm] = useState<AddEmployeeForm>({
    employeeAddress: "",
  });
  // const [isSubmitting, setIsSubmitting] = useState(false); // Handled by useMutation.isPending

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const currentAccount = useCurrentAccount();
  const packageId = useNetworkVariable("packageId");
  const {
    mutateAsync: signAndExecuteTransactionMutation,
    isPending: isSubmitting,
  } = useSignAndExecuteTransaction();

  const addEmployeeMutation = useMutation({
    mutationFn: async (data: AddEmployeeForm) => {
      if (!currentAccount || !packageId) {
        throw new Error("Wallet not connected or packageId not configured.");
      }
      if (!timesheetId) {
        throw new Error("No timesheet (Whitelist ID) selected.");
      }
      if (!capId) {
        throw new Error("No Cap ID provided for the selected timesheet.");
      }
      if (!data.employeeAddress.trim()) {
        throw new Error("Employee address cannot be empty.");
      }

      const txb = new Transaction();
      txb.moveCall({
        target: `${packageId}::whitelist::add`,
        arguments: [
          txb.object(timesheetId), // The Whitelist object ID
          txb.object(capId), // The Cap object ID
          txb.pure.address(data.employeeAddress.trim()),
        ],
      });

      return signAndExecuteTransactionMutation({
        transaction: txb,
        // options: { showEffects: true }, // Default options might be sufficient
      });
    },
    onSuccess: (result: any) => {
      // Using any for result type from useSignAndExecuteTransaction
      console.log("Add employee transaction successful!", result);
      // Invalidate the query for timesheets to reflect the new employee in the list count
      queryClient.invalidateQueries({
        queryKey: [
          "sui",
          "whitelists_and_caps",
          currentAccount?.address,
          packageId,
        ],
      });
      toast({
        title: "Employee Add Transaction Submitted",
        description: `Transaction to add employee submitted. Digest: ${result.digest.substring(
          0,
          10
        )}...`,
      });
      handleClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Error Adding Employee",
        description: error.message || "Failed to submit transaction to Sui.",
        variant: "destructive",
      });
    },
    // onSettled: () => { // isPending from hook handles this
    //   setIsSubmitting(false);
    // },
  });

  const handleClose = () => {
    setForm({ employeeAddress: "" });
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.employeeAddress.trim()) {
      toast({
        title: "Validation Error",
        description: "Employee wallet address is required.",
        variant: "destructive",
      });
      return;
    }
    if (!form.employeeAddress.match(/^0x[a-fA-F0-9]{2,}$/)) {
      toast({
        title: "Validation Error",
        description: "Please enter a valid Sui wallet address (e.g., 0x...)",
        variant: "destructive",
      });
      return;
    }
    addEmployeeMutation.mutate(form);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Employee to Timesheet</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="employeeAddress">Employee Wallet Address *</Label>
            <Input
              id="employeeAddress"
              type="text"
              placeholder="0x... (Sui Wallet Address)"
              value={form.employeeAddress}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  employeeAddress: e.target.value,
                }))
              }
              className="font-mono text-sm"
              required
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-foreground">
              Enter the employee's Sui wallet address to add to this timesheet.
            </p>
          </div>

          {isSubmitting && (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-3 dark:bg-blue-900/20 dark:border-blue-700/30">
              <div className="flex items-center space-x-2 text-blue-700 dark:text-blue-300">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Submitting to Sui...</span>
              </div>
            </div>
          )}

          <div className="flex space-x-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !packageId || !timesheetId || !capId}
              className="flex-1"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Adding...
                </>
              ) : (
                "Add Employee to Timesheet"
              )}
            </Button>
          </div>
          {(!packageId || !timesheetId || !capId) && !isSubmitting && (
            <p className="text-xs text-destructive text-center pt-2">
              Error: Missing critical data (Package ID, Timesheet ID, or Cap
              ID). Cannot proceed.
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
