import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useWorkRecords } from '@/hooks/use-work-records';
import { useWeb3 } from '@/hooks/use-web3';
import { useAppStore } from '@/lib/store';
import { apiRequest } from '@/lib/queryClient';
import { Clock, Wallet, LogIn, LogOut, DollarSign, Loader2 } from 'lucide-react';
import type { SalaryRecord } from '@shared/schema';

export default function EmployeePage() {
  const { currentEmployeeTab, setCurrentEmployeeTab, currentWalletAddress } = useAppStore();
  const { workRecords, checkIn, checkOut, getTodaysHours, isCheckedIn } = useWorkRecords();
  const { claimSalary } = useWeb3();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isClaimingSalary, setIsClaimingSalary] = useState(false);

  // Fetch salary records
  const { data: salaryRecords = [], isLoading: salaryLoading } = useQuery<SalaryRecord[]>({
    queryKey: ['/api/salary-records', { employeeAddress: currentWalletAddress }],
    enabled: !!currentWalletAddress,
  });

  // Create salary claim mutation
  const claimSalaryMutation = useMutation({
    mutationFn: async (data: { amount: string; period: string }) => {
      if (!currentWalletAddress) throw new Error('Wallet not connected');
      
      // Execute Web3 transaction first
      setIsClaimingSalary(true);
      const transaction = await claimSalary(data.amount, data.period);
      
      // Then create salary record in backend
      const response = await apiRequest('POST', '/api/salary-records', {
        employeeAddress: currentWalletAddress,
        amount: data.amount,
        period: data.period,
        txHash: transaction.hash,
        status: 'confirmed'
      });
      
      return { salaryRecord: await response.json(), transaction };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/salary-records'] });
      toast({
        title: "Salary Claimed",
        description: "Your salary has been successfully claimed on blockchain.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to claim salary",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsClaimingSalary(false);
    }
  });

  const handleCheckIn = () => {
    try {
      const record = checkIn();
      toast({
        title: "Checked In",
        description: `Successfully checked in at ${record.checkIn}`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to check in",
        variant: "destructive",
      });
    }
  };

  const handleCheckOut = () => {
    try {
      const record = checkOut();
      toast({
        title: "Checked Out",
        description: `Successfully checked out at ${record.checkOut}. Total time: ${record.duration}`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to check out",
        variant: "destructive",
      });
    }
  };

  const handleClaimSalary = () => {
    const currentAmount = "0.125"; // This would come from calculated earnings
    const currentPeriod = "Current Period";
    
    claimSalaryMutation.mutate({
      amount: currentAmount,
      period: currentPeriod
    });
  };

  const todaysHours = getTodaysHours();
  const isCurrentlyCheckedIn = isCheckedIn();

  // Calculate current period earnings (mock calculation)
  const currentEarnings = {
    amount: "0.125",
    usdValue: "$312.50",
    hoursWorked: workRecords.filter(r => r.status === 'completed').length * 8.5,
    hourlyRate: "0.003"
  };

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Employee Dashboard</h1>
        <p className="text-gray-600">Track your work hours and manage salary</p>
        {currentWalletAddress && (
          <p className="text-sm text-gray-500 font-mono mt-1">
            Connected: {currentWalletAddress.substring(0, 10)}...{currentWalletAddress.substring(-4)}
          </p>
        )}
      </div>

      <Card className="mb-8">
        <CardContent className="pt-6">
          <Tabs value={currentEmployeeTab} onValueChange={(value) => setCurrentEmployeeTab(value as any)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="workrecord" className="flex items-center space-x-2">
                <Clock className="h-4 w-4" />
                <span>Work Record</span>
              </TabsTrigger>
              <TabsTrigger value="salary" className="flex items-center space-x-2">
                <DollarSign className="h-4 w-4" />
                <span>Salary Check</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="workrecord" className="mt-6">
              {/* Current Status Display */}
              <Card className="mb-8 bg-gradient-to-r from-blue-50 to-indigo-50">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Current Status</h3>
                      <p className="text-gray-600">
                        {isCurrentlyCheckedIn ? (
                          <>Checked in • Started at {workRecords.find(r => r.status === 'in-progress')?.checkIn}</>
                        ) : (
                          <>Checked out • Ready for next session</>
                        )}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-gray-900">{todaysHours.toFixed(1)} hrs</div>
                      <div className="text-sm text-gray-600">Today's work</div>
                    </div>
                  </div>
                  
                  <div className="flex space-x-4">
                    <Button
                      onClick={handleCheckIn}
                      disabled={isCurrentlyCheckedIn}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <LogIn className="h-4 w-4 mr-2" />
                      Check In
                    </Button>
                    <Button
                      onClick={handleCheckOut}
                      disabled={!isCurrentlyCheckedIn}
                      variant="destructive"
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      Check Out
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Work Records Table */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Work Sessions</CardTitle>
                </CardHeader>
                <CardContent>
                  {workRecords.length === 0 ? (
                    <div className="text-center py-8">
                      <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-500">No work records yet</p>
                      <p className="text-sm text-gray-400">Check in to start tracking your work time</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {workRecords.map((record) => (
                        <div key={record.id} className="border rounded-lg p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium text-gray-900">
                                {record.date}
                              </div>
                              <div className="text-sm text-gray-600">
                                Check In: {record.checkIn}
                                {record.checkOut && ` • Check Out: ${record.checkOut}`}
                              </div>
                            </div>
                            <div className="text-right">
                              <Badge variant={record.status === 'completed' ? 'default' : 'secondary'}>
                                {record.status === 'completed' ? 'Complete' : 'In Progress'}
                              </Badge>
                              {record.duration && (
                                <div className="text-sm text-gray-600 mt-1">
                                  Duration: {record.duration}
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
            </TabsContent>

            <TabsContent value="salary" className="mt-6">
              {/* Salary Card */}
              <Card className="mb-8 bg-gradient-to-r from-purple-600 to-blue-600 text-white">
                <CardContent className="pt-6">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="text-lg font-semibold opacity-90">Current Period Earnings</h3>
                      <p className="opacity-75">Available for claim</p>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-bold">{currentEarnings.amount} ETH</div>
                      <div className="opacity-75">{currentEarnings.usdValue} USD</div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-6 mb-6">
                    <div>
                      <div className="text-sm opacity-75">Hours Worked</div>
                      <div className="text-lg font-semibold">{currentEarnings.hoursWorked.toFixed(1)} hrs</div>
                    </div>
                    <div>
                      <div className="text-sm opacity-75">Hourly Rate</div>
                      <div className="text-lg font-semibold">{currentEarnings.hourlyRate} ETH</div>
                    </div>
                    <div>
                      <div className="text-sm opacity-75">Status</div>
                      <div className="text-lg font-semibold">Ready to Claim</div>
                    </div>
                  </div>
                  
                  {isClaimingSalary && (
                    <div className="bg-white/20 rounded-lg p-3 mb-4">
                      <div className="flex items-center space-x-2 text-white">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Processing salary claim on blockchain...</span>
                      </div>
                    </div>
                  )}
                  
                  <Button
                    onClick={handleClaimSalary}
                    disabled={claimSalaryMutation.isPending || !currentWalletAddress}
                    className="w-full bg-white text-purple-700 hover:bg-gray-100"
                  >
                    {claimSalaryMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Claiming...
                      </>
                    ) : (
                      <>
                        <Wallet className="h-4 w-4 mr-2" />
                        Claim Salary
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* Salary History */}
              <Card>
                <CardHeader>
                  <CardTitle>Claim History</CardTitle>
                </CardHeader>
                <CardContent>
                  {salaryLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : salaryRecords.length === 0 ? (
                    <div className="text-center py-8">
                      <Wallet className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-500">No salary claims yet</p>
                      <p className="text-sm text-gray-400">Your salary claim history will appear here</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {salaryRecords.map((record) => (
                        <div key={record.id} className="border rounded-lg p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium text-gray-900">
                                Amount: {record.amount} ETH
                              </div>
                              <div className="text-sm text-gray-600">
                                Period: {record.period}
                              </div>
                              <div className="text-xs text-gray-500 font-mono">
                                {record.claimedAt && new Date(record.claimedAt).toLocaleDateString()}
                              </div>
                            </div>
                            <div className="text-right">
                              <Badge variant={record.status === 'confirmed' ? 'default' : 'secondary'}>
                                {record.status}
                              </Badge>
                              {record.txHash && (
                                <div className="text-xs text-gray-500 font-mono mt-1">
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
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
