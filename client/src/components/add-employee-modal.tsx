import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useWeb3 } from '@/hooks/use-web3';
import { apiRequest } from '@/lib/queryClient';
import { Loader2 } from 'lucide-react';

interface AddEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  timesheetId: number | null;
}

interface AddEmployeeForm {
  employeeAddress: string;
  employeeName: string;
  hourlyRate: string;
}

export function AddEmployeeModal({ isOpen, onClose, timesheetId }: AddEmployeeModalProps) {
  const [form, setForm] = useState<AddEmployeeForm>({
    employeeAddress: '',
    employeeName: '',
    hourlyRate: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { toast } = useToast();
  const { addEmployeeToTimesheet } = useWeb3();
  const queryClient = useQueryClient();

  const addEmployeeMutation = useMutation({
    mutationFn: async (data: AddEmployeeForm) => {
      if (!timesheetId) throw new Error('No timesheet selected');
      
      // Execute Web3 transaction first
      setIsSubmitting(true);
      const transaction = await addEmployeeToTimesheet(data.employeeAddress, timesheetId);
      
      // Then add to backend
      const response = await apiRequest('POST', `/api/timesheets/${timesheetId}/employees`, {
        employeeAddress: data.employeeAddress,
        employeeName: data.employeeName || null,
        hourlyRate: data.hourlyRate || null
      });
      
      return { employee: await response.json(), transaction };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/timesheets'] });
      queryClient.invalidateQueries({ queryKey: [`/api/timesheets/${timesheetId}/employees`] });
      toast({
        title: "Employee Added",
        description: "Employee has been successfully added to the timesheet.",
      });
      handleClose();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add employee to timesheet",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsSubmitting(false);
    }
  });

  const handleClose = () => {
    setForm({
      employeeAddress: '',
      employeeName: '',
      hourlyRate: ''
    });
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!form.employeeAddress) {
      toast({
        title: "Validation Error",
        description: "Employee wallet address is required",
        variant: "destructive",
      });
      return;
    }

    // Basic Ethereum address validation
    if (!form.employeeAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      toast({
        title: "Validation Error",
        description: "Please enter a valid Ethereum wallet address",
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
              placeholder="0x..."
              value={form.employeeAddress}
              onChange={(e) => setForm(prev => ({ ...prev, employeeAddress: e.target.value }))}
              className="font-mono text-sm"
              required
            />
            <p className="text-xs text-muted-foreground">
              Enter the employee's Ethereum wallet address
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="employeeName">Employee Name (Optional)</Label>
            <Input
              id="employeeName"
              type="text"
              placeholder="John Doe"
              value={form.employeeName}
              onChange={(e) => setForm(prev => ({ ...prev, employeeName: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hourlyRate">Hourly Rate (ETH)</Label>
            <Input
              id="hourlyRate"
              type="number"
              step="0.001"
              placeholder="0.035"
              value={form.hourlyRate}
              onChange={(e) => setForm(prev => ({ ...prev, hourlyRate: e.target.value }))}
            />
          </div>

          {isSubmitting && (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
              <div className="flex items-center space-x-2 text-blue-700">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Executing Web3 transaction...</span>
              </div>
            </div>
          )}

          <div className="flex space-x-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={addEmployeeMutation.isPending}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={addEmployeeMutation.isPending}
              className="flex-1"
            >
              {addEmployeeMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Adding...
                </>
              ) : (
                'Add Employee'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
