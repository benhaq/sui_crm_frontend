import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { ArrowLeft, BarChart3, Download, Loader2, Users } from "lucide-react";
// TODO: Replace with Sui-specific types if necessary, these are from @shared/schema
// import type { Timesheet, WorkRecord, TimesheetEmployee } from '@shared/schema';

// Define props for the component
interface WorkLogDetailPageProps {
  timesheetId: string;
}

// Update component to accept props
export default function WorkLogDetailPage({
  timesheetId,
}: WorkLogDetailPageProps) {
  const [, setLocation] = useLocation();
  // const numericTimesheetId = parseInt(timesheetId || '0'); // No longer needed if timesheetId is always string from prop

  // TODO: Refactor API calls for Sui data
  // Fetch timesheet details (Example: this would now fetch a Sui Whitelist object)
  const { data: timesheet, isLoading: timesheetLoading } = useQuery<any>({
    queryKey: [`sui_timesheet_detail`, timesheetId],
    queryFn: async () => {
      console.log("Fetching Sui timesheet detail for ID:", timesheetId);
      return {
        id: timesheetId,
        name: "Sample Sui Timesheet",
        period: "Current",
        status: "active",
        txHash: null,
      };
    },
    enabled: !!timesheetId,
  });

  // TODO: Refactor work records for Sui (likely stored off-chain or via a different Sui mechanism)
  const { data: workRecords = [], isLoading: workRecordsLoading } = useQuery<
    any[]
  >({
    queryKey: ["sui_work_records", { timesheetId }],
    queryFn: async () => {
      console.log("Fetching work records for Sui timesheet ID:", timesheetId);
      return [];
    },
    enabled: !!timesheetId,
  });

  // TODO: Refactor employee list for Sui (this is the `list` field of the Whitelist object)
  const { data: employees = [], isLoading: employeesLoading } = useQuery<any[]>(
    {
      queryKey: [`sui_timesheet_employees`, timesheetId],
      queryFn: async () => {
        console.log(
          "Fetching employees for Sui timesheet ID (from Whitelist object's list field):",
          timesheetId
        );
        return [];
      },
      enabled: !!timesheetId,
    }
  );

  const handleGoBack = () => {
    setLocation("/admin");
  };

  const handleAggregateWorkLogs = () => {
    // Calculate total hours and prepare aggregated data
    const aggregatedData = employees.map((employee) => {
      const employeeRecords = workRecords.filter(
        (record) => record.employeeAddress === employee.employeeAddress
      );

      const totalHours = employeeRecords.reduce((sum, record) => {
        return sum + (record.totalHours ? parseFloat(record.totalHours) : 0);
      }, 0);

      const completedRecords = employeeRecords.filter(
        (r) => r.status === "completed"
      );
      const avgHoursPerDay =
        completedRecords.length > 0 ? totalHours / completedRecords.length : 0;

      const hourlyRate = employee.hourlyRate
        ? parseFloat(employee.hourlyRate)
        : 0;
      const earned = totalHours * hourlyRate;

      return {
        ...employee,
        totalHours,
        daysWorked: completedRecords.length,
        avgHoursPerDay,
        earned,
        lastActivity: employeeRecords[0]?.checkIn || null,
      };
    });

    console.log("Aggregated work logs:", aggregatedData);
    // Here you would typically save this data or trigger further processing
  };

  if (timesheetLoading || workRecordsLoading || employeesLoading) {
    return (
      <div className="container mx-auto px-6 py-8">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  if (!timesheet) {
    return (
      <div className="container mx-auto px-6 py-8">
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Timesheet (Whitelist) not found
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            The requested Sui Whitelist object could not be found with ID:{" "}
            {timesheetId}
          </p>
          <Button onClick={handleGoBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Admin
          </Button>
        </div>
      </div>
    );
  }

  const employeeWorkSummary = employees.map((employee: any) => {
    const employeeRecords = workRecords.filter(
      (record: any) => record.employeeAddress === employee.employeeAddress
    );
    const totalHours = employeeRecords.reduce((sum: number, record: any) => {
      return sum + (record.totalHours ? parseFloat(record.totalHours) : 0);
    }, 0);
    return {
      ...employee,
      totalHours,
      records: employeeRecords,
      employeeName:
        employee.employeeName ||
        `Employee ${employee.employeeAddress?.substring(0, 6)}`,
      employeeAddress: employee.employeeAddress || "N/A",
      daysWorked: employeeRecords.length,
      avgHoursPerDay: totalHours / (employeeRecords.length || 1),
      earned: 0,
      lastActivity: employeeRecords[0]?.checkIn || null,
    };
  });

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="mb-6">
        <Button variant="ghost" onClick={handleGoBack} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Timesheets
        </Button>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Work Log Details (Sui Timesheet)
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          {timesheet.name} - ID: {timesheet.id}
        </p>
        <div className="flex items-center space-x-4 mt-2">
          <Badge
            variant={timesheet.status === "active" ? "default" : "secondary"}
          >
            {timesheet.status}
          </Badge>
        </div>
      </div>

      <Card className="mb-8 bg-card">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Employee Work Logs (Sui)</CardTitle>
            <div className="flex space-x-2">
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export Data
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {employeeWorkSummary.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                No employees on this timesheet (Whitelist)
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {employeeWorkSummary.map((employee: any) => (
                <Card
                  key={employee.employeeAddress || employee.id}
                  className="border-l-4 border-l-blue-500 dark:border-l-blue-400 bg-card/50 dark:bg-gray-800/30"
                >
                  <CardContent className="pt-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-semibold text-foreground">
                          {employee.employeeName || "Employee Wallet"}
                        </h3>
                        <div className="text-sm font-mono text-muted-foreground">
                          {/* Ensure employeeAddress exists before calling substring */}
                          {employee.employeeAddress
                            ? `${employee.employeeAddress.substring(
                                0,
                                10
                              )}...${employee.employeeAddress.substring(
                                employee.employeeAddress.length - 4
                              )}`
                            : "N/A"}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-foreground">
                          {employee.totalHours
                            ? employee.totalHours.toFixed(1)
                            : "0.0"}
                          h
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Total Hours (Off-chain)
                        </div>
                      </div>
                    </div>
                    {/* TODO: Further details for each employee if available and adapted from Sui data */}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
