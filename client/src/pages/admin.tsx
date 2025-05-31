import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AddEmployeeModal } from '@/components/add-employee-modal';
import { useToast } from '@/hooks/use-toast';
import { useWeb3 } from '@/hooks/use-web3';
import { useAppStore } from '@/lib/store';
import { apiRequest } from '@/lib/queryClient';
import { useLocation } from 'wouter';
import { Loader2, Plus, Clock, Users, Eye, BarChart3 } from 'lucide-react';
import type { Timesheet, WorkRecord } from '@shared/schema';

interface CreateTimesheetForm {
  name: string;
  period: string;
  startDate: string;
  endDate: string;
}

export default function AdminPage() {
  const [createForm, setCreateForm] = useState<CreateTimesheetForm>({
    name: '',
    period: '',
    startDate: '',
    endDate: ''
  });
  const [selectedTimesheetId, setSelectedTimesheetId] = useState<number | null>(null);
  const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
  const [isCreatingTimesheet, setIsCreatingTimesheet] = useState(false);
  
  const { currentAdminTab, setCurrentAdminTab } = useAppStore();
  const { toast } = useToast();
  const { createTimesheet } = useWeb3();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  // Fetch timesheets
  const { data: timesheets = [], isLoading: timesheetsLoading } = useQuery<Timesheet[]>({
    queryKey: ['/api/timesheets'],
  });

  // Fetch all work records for admin view
  const { data: allWorkRecords = [], isLoading: workRecordsLoading } = useQuery<WorkRecord[]>({
    queryKey: ['/api/work-records'],
  });

  // Create timesheet mutation
  const createTimesheetMutation = useMutation({
    mutationFn: async (data: CreateTimesheetForm) => {
      // Execute Web3 transaction first
      setIsCreatingTimesheet(true);
      const transaction = await createTimesheet(data.name, data.period, data.startDate, data.endDate);
      
      // Then create in backend
      const response = await apiRequest('POST', '/api/timesheets', {
        name: data.name,
        period: data.period,
        startDate: data.startDate,
        endDate: data.endDate,
        status: 'confirmed',
        txHash: transaction.hash,
        createdBy: null
      });
      
      return { timesheet: await response.json(), transaction };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/timesheets'] });
      toast({
        title: "Timesheet Created",
        description: "Timesheet has been successfully created on blockchain.",
      });
      setCreateForm({ name: '', period: '', startDate: '', endDate: '' });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create timesheet",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsCreatingTimesheet(false);
    }
  });

  const handleCreateTimesheet = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!createForm.name || !createForm.period || !createForm.startDate || !createForm.endDate) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    createTimesheetMutation.mutate(createForm);
  };

  const handleAddEmployee = (timesheetId: number) => {
    setSelectedTimesheetId(timesheetId);
    setShowAddEmployeeModal(true);
  };

  const handleViewWorkLog = (timesheetId: number) => {
    setLocation(`/admin/timesheet/${timesheetId}`);
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'default';
      case 'pending':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  // Group work records by employee
  const employeeWorkSummary = allWorkRecords.reduce((acc, record) => {
    if (!acc[record.employeeAddress]) {
      acc[record.employeeAddress] = {
        address: record.employeeAddress,
        totalHours: 0,
        checkinsToday: 0,
        lastActivity: record.checkIn,
        records: []
      };
    }
    
    acc[record.employeeAddress].records.push(record);
    if (record.totalHours) {
      acc[record.employeeAddress].totalHours += parseFloat(record.totalHours);
    }
    
    // Check if today's activity
    const today = new Date().toISOString().split('T')[0];
    const recordDate = new Date(record.checkIn).toISOString().split('T')[0];
    if (recordDate === today) {
      acc[record.employeeAddress].checkinsToday++;
    }
    
    return acc;
  }, {} as Record<string, any>);

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
        <p className="text-gray-600">Manage timesheets and employee work records</p>
      </div>

      <Card className="mb-8">
        <CardContent className="pt-6">
          <Tabs value={currentAdminTab} onValueChange={(value) => setCurrentAdminTab(value as any)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="timesheet" className="flex items-center space-x-2">
                <Clock className="h-4 w-4" />
                <span>Manage Timesheet</span>
              </TabsTrigger>
              <TabsTrigger value="worklog" className="flex items-center space-x-2">
                <Users className="h-4 w-4" />
                <span>Manage Employee Work Log</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="timesheet" className="mt-6">
              {/* Create Timesheet Section */}
              <Card className="mb-8">
                <CardHeader>
                  <CardTitle>Create New Timesheet</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreateTimesheet} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Project Name *</Label>
                        <Input
                          id="name"
                          type="text"
                          placeholder="Enter project name"
                          value={createForm.name}
                          onChange={(e) => setCreateForm(prev => ({ ...prev, name: e.target.value }))}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="period">Period *</Label>
                        <Input
                          id="period"
                          type="text"
                          placeholder="e.g., Week 1 - January 2024"
                          value={createForm.period}
                          onChange={(e) => setCreateForm(prev => ({ ...prev, period: e.target.value }))}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="startDate">Start Date *</Label>
                        <Input
                          id="startDate"
                          type="date"
                          value={createForm.startDate}
                          onChange={(e) => setCreateForm(prev => ({ ...prev, startDate: e.target.value }))}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="endDate">End Date *</Label>
                        <Input
                          id="endDate"
                          type="date"
                          value={createForm.endDate}
                          onChange={(e) => setCreateForm(prev => ({ ...prev, endDate: e.target.value }))}
                          required
                        />
                      </div>
                    </div>
                    
                    {isCreatingTimesheet && (
                      <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                        <div className="flex items-center space-x-2 text-blue-700">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-sm">Creating timesheet on blockchain...</span>
                        </div>
                      </div>
                    )}
                    
                    <Button 
                      type="submit" 
                      disabled={createTimesheetMutation.isPending}
                      className="w-full md:w-auto"
                    >
                      {createTimesheetMutation.isPending ? (
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
                  </form>
                </CardContent>
              </Card>

              {/* Timesheets List */}
              <Card>
                <CardHeader>
                  <CardTitle>Active Timesheets</CardTitle>
                </CardHeader>
                <CardContent>
                  {timesheetsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : timesheets.length === 0 ? (
                    <div className="text-center py-8">
                      <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-500">No timesheets created yet</p>
                      <p className="text-sm text-gray-400">Create your first timesheet to get started</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {timesheets.map((timesheet) => (
                        <div
                          key={timesheet.id}
                          className="border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                          onClick={() => handleViewWorkLog(timesheet.id)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-4">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAddEmployee(timesheet.id);
                                }}
                                className="h-8 w-8 p-0"
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                              <div>
                                <h4 className="font-semibold text-gray-900">{timesheet.name}</h4>
                                <p className="text-sm text-gray-600">{timesheet.period}</p>
                                <p className="text-xs text-gray-500">
                                  {timesheet.startDate} to {timesheet.endDate}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center space-x-4">
                              <Badge variant={getStatusBadgeVariant(timesheet.status)}>
                                {timesheet.status}
                              </Badge>
                              <div className="text-right text-sm text-gray-500">
                                <div>Created: {new Date(timesheet.createdAt || '').toLocaleDateString()}</div>
                                {timesheet.txHash && (
                                  <div className="font-mono text-xs">
                                    {timesheet.txHash.substring(0, 10)}...
                                  </div>
                                )}
                              </div>
                              <Eye className="h-4 w-4 text-gray-400" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="worklog" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    Employee Work Log Records
                    <Button variant="outline" size="sm">
                      <BarChart3 className="h-4 w-4 mr-2" />
                      Aggregate Data
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {workRecordsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : Object.keys(employeeWorkSummary).length === 0 ? (
                    <div className="text-center py-8">
                      <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-500">No work records found</p>
                      <p className="text-sm text-gray-400">Employee work records will appear here</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {Object.values(employeeWorkSummary).map((employee: any) => (
                        <div key={employee.address} className="border rounded-lg p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-4">
                              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                                <span className="text-sm font-medium text-blue-600">
                                  {employee.address.substring(2, 4).toUpperCase()}
                                </span>
                              </div>
                              <div>
                                <div className="font-medium text-gray-900">Employee</div>
                                <div className="text-sm font-mono text-gray-600">
                                  {employee.address.substring(0, 10)}...{employee.address.substring(-4)}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center space-x-6">
                              <div className="text-center">
                                <div className="text-lg font-semibold text-gray-900">
                                  {employee.totalHours.toFixed(1)}h
                                </div>
                                <div className="text-xs text-gray-500">Total Hours</div>
                              </div>
                              <div className="text-center">
                                <div className="text-lg font-semibold text-gray-900">
                                  {employee.checkinsToday}
                                </div>
                                <div className="text-xs text-gray-500">Check-ins Today</div>
                              </div>
                              <div className="text-center">
                                <div className="text-sm text-gray-900">
                                  {new Date(employee.lastActivity).toLocaleTimeString()}
                                </div>
                                <div className="text-xs text-gray-500">Last Activity</div>
                              </div>
                              <Button variant="outline" size="sm">
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <AddEmployeeModal
        isOpen={showAddEmployeeModal}
        onClose={() => setShowAddEmployeeModal(false)}
        timesheetId={selectedTimesheetId}
      />
    </div>
  );
}
