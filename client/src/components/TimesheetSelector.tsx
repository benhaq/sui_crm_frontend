import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ListFilter } from "lucide-react";

// Define a more specific Timesheet type based on usage in employee.tsx
export interface TimesheetForSelector {
  id: string; // Object ID of the timesheet/whitelist
  name: string;
  capId: string; // Object ID of the admin capability
  list: string[]; // List of employee addresses
}

interface TimesheetSelectorProps {
  availableTimesheets: TimesheetForSelector[];
  employeeSpecificTimesheets: TimesheetForSelector[];
  currentWalletAddress: string | null;
  selectedTimesheetForCheckin: TimesheetForSelector | null;
  onTimesheetSelection: (timesheetId: string) => void;
}

export const TimesheetSelector: React.FC<TimesheetSelectorProps> = ({
  availableTimesheets,
  employeeSpecificTimesheets,
  currentWalletAddress,
  selectedTimesheetForCheckin,
  onTimesheetSelection,
}) => {
  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle className="flex items-center">
          <ListFilter className="h-5 w-5 mr-2 text-primary" />
          Select Timesheet for Work
        </CardTitle>
      </CardHeader>
      <CardContent>
        {availableTimesheets.length === 0 ? (
          <p className="text-muted-foreground">
            No timesheets currently assigned to you or available. Please contact
            your administrator.
          </p>
        ) : employeeSpecificTimesheets.length === 0 &&
          availableTimesheets.length > 0 ? (
          <p className="text-orange-600 dark:text-orange-400">
            You are not currently on the list for any of the available
            timesheets. Please contact your admin if this is an error.
          </p>
        ) : (
          <Select
            onValueChange={onTimesheetSelection}
            value={selectedTimesheetForCheckin?.id || ""}
            disabled={employeeSpecificTimesheets.length === 0}
          >
            <SelectTrigger className="w-full md:w-[300px]">
              <SelectValue placeholder="Choose a timesheet..." />
            </SelectTrigger>
            <SelectContent>
              {employeeSpecificTimesheets.map((ts) => (
                <SelectItem
                  key={ts.id}
                  value={ts.id}
                  disabled={!ts.list.includes(currentWalletAddress || "")}
                >
                  {ts.name} (ID: ...{ts.id.slice(-6)}) - {ts.list.length}{" "}
                  member(s)
                </SelectItem>
              ))}
              {availableTimesheets
                .filter(
                  (ts) =>
                    !employeeSpecificTimesheets.find((ets) => ets.id === ts.id)
                )
                .map((ts) => (
                  <SelectItem
                    key={ts.id}
                    value={ts.id}
                    disabled={true}
                    className="text-muted-foreground/70"
                  >
                    {ts.name} (Not on your list)
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}
        {selectedTimesheetForCheckin && (
          <p className="text-sm text-green-600 dark:text-green-400 mt-3">
            Currently active:{" "}
            <span className="font-semibold">
              {selectedTimesheetForCheckin.name}
            </span>
          </p>
        )}
        {!selectedTimesheetForCheckin &&
          employeeSpecificTimesheets.length > 0 && (
            <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-3">
              Please select a timesheet to proceed with check-in/out.
            </p>
          )}
      </CardContent>
    </Card>
  );
};
