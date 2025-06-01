import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Clock, Plus, Eye, ListChecks } from "lucide-react";

interface SuiTimesheetItem {
  // Renamed to avoid conflict
  id: string;
  capId: string;
  name: string;
  list: string[];
}

interface ActiveTimesheetsListProps {
  timesheets: SuiTimesheetItem[];
  isLoading: boolean;
  onAddEmployee: (timesheetId: string, capId: string) => void;
  onViewWorkLog: (timesheetId: string) => void;
}

export function ActiveTimesheetsList({
  timesheets,
  isLoading,
  onAddEmployee,
  onViewWorkLog,
}: ActiveTimesheetsListProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Active Timesheets (from Sui)</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (timesheets.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Active Timesheets (from Sui)</CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">
            No timesheets (Whitelists) found on Sui for your account.
          </p>
          <p className="text-sm text-muted-foreground/70">
            Create your first timesheet to get started.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Active Timesheets (from Sui)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {timesheets.map((timesheet) => (
          <div
            key={timesheet.id}
            className="border rounded-lg p-4 hover:shadow-lg transition-shadow cursor-pointer bg-card/80 dark:bg-gray-800/50"
            onClick={() => onViewWorkLog(timesheet.id)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddEmployee(timesheet.id, timesheet.capId);
                  }}
                  className="h-8 w-8 p-0 flex-shrink-0"
                  title="Add Employee to Timesheet"
                >
                  <Plus className="h-4 w-4" />
                </Button>
                <div className="flex-grow">
                  <h4 className="font-semibold text-lg text-gray-800 dark:text-gray-100">
                    {timesheet.name}
                  </h4>
                  <p
                    className="text-xs text-blue-600 dark:text-blue-400 font-mono truncate"
                    title={timesheet.id}
                  >
                    ID: {timesheet.id.substring(0, 10)}...
                    {timesheet.id.substring(timesheet.id.length - 4)}
                  </p>
                  <p
                    className="text-xs text-purple-600 dark:text-purple-400 font-mono truncate"
                    title={timesheet.capId}
                  >
                    CapID: {timesheet.capId.substring(0, 10)}...
                    {timesheet.capId.substring(timesheet.capId.length - 4)}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <div className="flex items-center text-sm text-muted-foreground">
                  <ListChecks className="h-4 w-4 mr-1.5 text-green-500" />
                  <span>{timesheet.list.length} Employee(s)</span>
                </div>
                <Badge variant="secondary">On-Chain</Badge>
                <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
