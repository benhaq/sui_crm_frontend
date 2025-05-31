import { useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useLocation } from 'wouter';
import { ArrowLeft, BarChart3, Download, Loader2, Users } from 'lucide-react';
import type { Timesheet, WorkRecord, TimesheetEmployee } from '@shared/schema';

export default function WorkLogDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const timesheetId = parseInt(id || '0');

  // Fetch timesheet details
  const { data: timesheet, isLoading: timesheetLoading } = useQuery<Timesheet>({
    queryKey: [`/api/timesheets/${timesheetId}`],
    enabled: !!timesheetId,
  });

  // Fetch work records for this timesheet
  const { data: workRecords = [], isLoading: workRecordsLoading } = useQuery<WorkRecord[]>({
    queryKey: ['/api/work-records', { timesheetId }],
    enabled: !!timesheetId,
  });

  // Fetch employees for this timesheet
  const { data: employees = [], isLoading: employeesLoading } = useQuery<TimesheetEmployee[]>({
    queryKey: [`/api/timesheets/${timesheetId}/employees`],
    enabled: !!timesheetId,
  });

  const handleGoBack = () => {
    setLocation('/admin');
  };

  const handleAggregateWorkLogs = () => {
    // Calculate total hours and prepare aggregated data
    const aggregatedData = employees.map(employee => {
      const employeeRecords = workRecords.filter(
        record => record.employeeAddress === employee.employeeAddress
      );
      
      const totalHours = employeeRecords.reduce((sum, record) => {
        return sum + (record.totalHours ? parseFloat(record.totalHours) : 0);
      }, 0);

      const completedRecords = employeeRecords.filter(r => r.status === 'completed');
      const avgHoursPerDay = completedRecords.length > 0 ? totalHours / completedRecords.length : 0;
      
      const hourlyRate = employee.hourlyRate ? parseFloat(employee.hourlyRate) : 0;
      const earned = totalHours * hourlyRate;

      return {
        ...employee,
        totalHours,
        daysWorked: completedRecords.length,
        avgHoursPerDay,
        earned,
        lastActivity: employeeRecords[0]?.checkIn || null
      };
    });

    console.log('Aggregated work logs:', aggregatedData);
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
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Timesheet not found</h2>
          <p className="text-gray-600 mb-4">The requested timesheet could not be found.</p>
          <Button onClick={handleGoBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Admin
          </Button>
        </div>
      </div>
    );
  }

  // Group work records by employee
  const employeeWorkSummary = employees.map(employee => {
    const employeeRecords = workRecords.filter(
      record => record.employeeAddress === employee.employeeAddress
    );
    
    const totalHours = employeeRecords.reduce((sum, record) => {
      return sum + (record.totalHours ? parseFloat(record.totalHours) : 0);
    }, 0);

    const completedRecords = employeeRecords.filter(r => r.status === 'completed');
    const avgHoursPerDay = completedRecords.length > 0 ? totalHours / completedRecords.length : 0;
    
    const hourlyRate = employee.hourlyRate ? parseFloat(employee.hourlyRate) : 0;
    const earned = totalHours * hourlyRate;

    return {
      ...employee,
      totalHours,
      daysWorked: completedRecords.length,
      avgHoursPerDay,
      earned,
      lastActivity: employeeRecords[0]?.checkIn || null,
      records: employeeRecords
    };
  });

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="mb-6">
        <Button variant="ghost" onClick={handleGoBack} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Timesheets
        </Button>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Work Log Details</h1>
        <p className="text-gray-600">{timesheet.name} - {timesheet.period}</p>
        <div className="flex items-center space-x-4 mt-2">
          <Badge variant={timesheet.status === 'confirmed' ? 'default' : 'secondary'}>
            {timesheet.status}
          </Badge>
          {timesheet.txHash && (
            <span className="text-sm text-gray-500 font-mono">
              Tx: {timesheet.txHash.substring(0, 10)}...
            </span>
          )}
        </div>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Employee Work Logs</CardTitle>
            <div className="flex space-x-2">
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export Data
              </Button>
              <Button onClick={handleAggregateWorkLogs} size="sm">
                <BarChart3 className="h-4 w-4 mr-2" />
                Aggregate Logs
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {employeeWorkSummary.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No employees assigned to this timesheet</p>
              <p className="text-sm text-gray-400">Add employees to start tracking work logs</p>
            </div>
          ) : (
            <div className="space-y-6">
              {employeeWorkSummary.map((employee) => (
                <Card key={employee.id} className="border-l-4 border-l-blue-500">
                  <CardContent className="pt-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          {employee.employeeName || 'Employee'}
                        </h3>
                        <div className="text-sm font-mono text-gray-600">
                          {employee.employeeAddress.substring(0, 10)}...{employee.employeeAddress.substring(-4)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-gray-900">
                          {employee.totalHours.toFixed(1)}h
                        </div>
                        <div className="text-sm text-gray-600">Total Hours</div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div>
                        <div className="text-sm text-gray-500">Days Worked</div>
                        <div className="font-semibold">{employee.daysWorked} days</div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-500">Avg Hours/Day</div>
                        <div className="font-semibold">{employee.avgHoursPerDay.toFixed(1)}h</div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-500">Last Check-in</div>
                        <div className="font-semibold">
                          {employee.lastActivity 
                            ? new Date(employee.lastActivity).toLocaleDateString()
                            : 'No activity'
                          }
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-500">Earned</div>
                        <div className="font-semibold text-green-600">
                          {employee.earned.toFixed(4)} ETH
                        </div>
                      </div>
                    </div>

                    {employee.records.length > 0 && (
                      <div className="mt-4">
                        <h4 className="font-medium text-gray-900 mb-2">Recent Sessions</h4>
                        <div className="space-y-2">
                          {employee.records.slice(0, 3).map((record) => (
                            <div key={record.id} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                              <div className="text-sm">
                                <span className="font-medium">{record.date}</span>
                                <span className="ml-2 text-gray-600">
                                  {new Date(record.checkIn).toLocaleTimeString()} - 
                                  {record.checkOut ? new Date(record.checkOut).toLocaleTimeString() : 'In Progress'}
                                </span>
                              </div>
                              <div className="text-sm font-medium">
                                {record.totalHours ? `${record.totalHours}h` : '-'}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
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
