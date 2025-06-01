import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wallet, Loader2 } from "lucide-react";
import type { SalaryRecord as APISalaryRecord } from "@shared/schema"; // Alias to avoid conflict

// Assuming Timesheet type used by selectedTimesheetForCheckin is similar to TimesheetForSelector
export interface TimesheetForSalaryTab {
  id: string;
  name: string;
  // other fields if necessary
}

export interface CurrentEarningsDisplay {
  amount: string;
  usdValue: string;
  hoursWorked: number;
  hourlyRate: string;
}

// Use the aliased import for SalaryRecord from API
export type SalaryRecordToDisplay = APISalaryRecord;

interface SalaryTabProps {
  selectedTimesheetForCheckin: TimesheetForSalaryTab | null;
  currentEarnings: CurrentEarningsDisplay;
  isClaimingSalary: boolean;
  handleGeneralClaim: () => void; // Or specific claim function if preferred
  salaryRecords: SalaryRecordToDisplay[];
  salaryLoading: boolean;
}

export const SalaryTab: React.FC<SalaryTabProps> = ({
  selectedTimesheetForCheckin,
  currentEarnings,
  isClaimingSalary,
  handleGeneralClaim,
  salaryRecords,
  salaryLoading,
}) => {
  return (
    <>
      <Card className="mb-8 salary-gradient text-white">
        <CardContent className="pt-6 relative z-10">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h3 className="text-lg font-semibold neon-text">
                Earnings{" "}
                {selectedTimesheetForCheckin
                  ? `on ${selectedTimesheetForCheckin.name.substring(0, 15)}...`
                  : "(No Timesheet)"}
              </h3>
              <p className="text-white/80">Available for claim (placeholder)</p>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold neon-text">
                {currentEarnings.amount} ETH
              </div>
              <div className="text-white/80 text-lg">
                {currentEarnings.usdValue} USD
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-6 mb-6">
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
              <div className="text-sm text-white/70">Hours Worked</div>
              <div className="text-xl font-bold text-white">
                {currentEarnings.hoursWorked.toFixed(1)} hrs
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
              <div className="text-sm text-white/70">Hourly Rate</div>
              <div className="text-xl font-bold text-white">
                {currentEarnings.hourlyRate} ETH
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
              <div className="text-sm text-white/70">Status</div>
              <div className="text-xl font-bold text-green-300">
                {selectedTimesheetForCheckin
                  ? "Ready (Mock)"
                  : "Select Timesheet"}
              </div>
            </div>
          </div>

          {isClaimingSalary && (
            <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4 mb-4 border border-white/30">
              <div className="flex items-center space-x-3 text-white">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm font-medium">
                  Processing salary claim on blockchain...
                </span>
              </div>
            </div>
          )}

          <Button
            onClick={handleGeneralClaim} // Changed from inline () => handleGeneralClaim()
            disabled={
              isClaimingSalary ||
              !selectedTimesheetForCheckin ||
              salaryRecords.length === 0 // Consider if this logic should change based on claimable records
            }
            className="w-full bg-white/20 border border-white/30 text-white hover:bg-white/30 backdrop-blur-sm font-semibold py-3 glow-effect"
          >
            {isClaimingSalary ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Claiming...
              </>
            ) : (
              <>
                <Wallet className="h-5 w-5 mr-2" />
                Claim Salary (Simulated for Selected Timesheet)
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Claim History (All Timesheets - Mock)</CardTitle>
        </CardHeader>
        <CardContent>
          {salaryLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : salaryRecords.length === 0 ? (
            <div className="text-center py-8">
              <Wallet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No salary claims yet</p>
              <p className="text-sm text-muted-foreground/70">
                Your salary claim history will appear here
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {salaryRecords.map((record) => (
                <div key={record.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-foreground">
                        Amount: {record.amount} ETH
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Period: {record.period}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {record.claimedAt &&
                          new Date(record.claimedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge
                        variant={
                          record.status === "confirmed"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {record.status}
                      </Badge>
                      {record.txHash && (
                        <div className="text-xs text-muted-foreground font-mono mt-1">
                          Tx: {record.txHash.substring(0, 10)}...
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
};
