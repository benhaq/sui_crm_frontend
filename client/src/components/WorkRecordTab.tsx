import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LogIn, LogOut, Clock, Loader2 } from "lucide-react";

// Copied from employee.tsx - consider moving to a shared types file
export interface DisplayableWorkRecord {
  id: string;
  employee: string;
  date: string;
  checkInDisplay: string;
  checkOutDisplay: string | null;
  durationDisplay: string | null;
  status:
    | "Completed (on-chain)"
    | "In Progress (on-chain)"
    | "Orphaned Check-out";
  checkInTimestampMs: number;
  checkOutTimestampMs?: number;
}

// Assuming Timesheet type used by selectedTimesheetForCheckin is similar to TimesheetForSelector
// If it's different, adjust accordingly.
export interface TimesheetForWorkRecordTab {
  id: string;
  name: string;
  // other fields if necessary for display within this tab
}

interface WorkRecordTabProps {
  selectedTimesheetForCheckin: TimesheetForWorkRecordTab | null;
  isActuallyCheckedInOnChain: boolean;
  currentOnChainCheckInRecord: DisplayableWorkRecord | null;
  todaysHoursOnChain: number;
  handleCheckIn: () => Promise<void>;
  handleCheckOut: () => Promise<void>;
  isLoadingHistory: boolean;
  onChainWorkRecords: DisplayableWorkRecord[];
}

export const WorkRecordTab: React.FC<WorkRecordTabProps> = ({
  selectedTimesheetForCheckin,
  isActuallyCheckedInOnChain,
  currentOnChainCheckInRecord,
  todaysHoursOnChain,
  handleCheckIn,
  handleCheckOut,
  isLoadingHistory,
  onChainWorkRecords,
}) => {
  return (
    <>
      <Card className="mb-8 timesheet-gradient text-white">
        <CardContent className="pt-6 relative z-10">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold neon-text">
                Current Status{" "}
                {selectedTimesheetForCheckin
                  ? `(${selectedTimesheetForCheckin.name.substring(0, 15)}...)`
                  : ""}
              </h3>
              <p className="text-white/80">
                {isActuallyCheckedInOnChain && currentOnChainCheckInRecord ? (
                  <>
                    Checked in (on-chain) • Started at{" "}
                    {currentOnChainCheckInRecord.checkInDisplay}
                  </>
                ) : (
                  <>Checked out (on-chain) • Ready for next session</>
                )}
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold neon-text">
                {todaysHoursOnChain.toFixed(1)} hrs
              </div>
              <div className="text-sm text-white/80">
                Today's work (on-chain)
                {selectedTimesheetForCheckin ? " on this timesheet" : ""}
              </div>
            </div>
          </div>

          <div className="flex space-x-4">
            <Button
              onClick={handleCheckIn}
              disabled={
                isActuallyCheckedInOnChain || !selectedTimesheetForCheckin
              }
              className="bg-green-500/20 border border-green-400/50 text-green-100 hover:bg-green-500/30 hover:border-green-400 backdrop-blur-sm transition-all duration-200"
            >
              <LogIn className="h-4 w-4 mr-2" />
              Check In
            </Button>
            <Button
              onClick={handleCheckOut}
              disabled={
                !isActuallyCheckedInOnChain || !selectedTimesheetForCheckin
              }
              className="bg-red-500/20 border border-red-400/50 text-red-100 hover:bg-red-500/30 hover:border-red-400 backdrop-blur-sm transition-all duration-200"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Check Out
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Recent Work Sessions{" "}
            {selectedTimesheetForCheckin
              ? `for ${selectedTimesheetForCheckin.name}`
              : "(No Timesheet Selected)"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingHistory ? (
            <div className="text-center py-8">
              <Loader2 className="h-12 w-12 text-muted-foreground mx-auto mb-4 animate-spin" />
              <p className="text-muted-foreground">
                Loading on-chain history...
              </p>
            </div>
          ) : onChainWorkRecords.length === 0 ? (
            <div className="text-center py-8">
              <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                No on-chain work records found for this package.
              </p>
              <p className="text-sm text-muted-foreground/70">
                Check in to start tracking your work time on the blockchain.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {onChainWorkRecords.map((record) => (
                <div key={record.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-foreground">
                        {record.date}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Check In: {record.checkInDisplay}
                        {record.checkOutDisplay &&
                          ` • Check Out: ${record.checkOutDisplay}`}
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge
                        variant={
                          record.status === "Completed (on-chain)"
                            ? "default"
                            : record.status === "In Progress (on-chain)"
                            ? "secondary"
                            : "outline" // For Orphaned Check-out
                        }
                      >
                        {record.status}
                      </Badge>
                      {record.durationDisplay && (
                        <div className="text-sm text-muted-foreground mt-1">
                          Duration: {record.durationDisplay}
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
