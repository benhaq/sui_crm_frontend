import { Button } from '@/components/ui/button';
import { useAppStore } from '@/lib/store';
import { useLocation } from 'wouter';
import { Shield, User } from 'lucide-react';

export function RoleSwitcher() {
  const { currentRole, setCurrentRole } = useAppStore();
  const [, setLocation] = useLocation();

  const handleRoleSwitch = () => {
    const newRole = currentRole === 'admin' ? 'employee' : 'admin';
    setCurrentRole(newRole);
    setLocation(newRole === 'admin' ? '/admin' : '/employee');
  };

  return (
    <Button
      variant="outline"
      onClick={handleRoleSwitch}
      className="bg-card/50 border-border/50 text-foreground hover:bg-card/80 backdrop-blur-sm transition-all duration-200"
    >
      {currentRole === 'admin' ? (
        <User className="h-4 w-4 mr-2" />
      ) : (
        <Shield className="h-4 w-4 mr-2" />
      )}
      Switch to {currentRole === 'admin' ? 'Employee' : 'Admin'}
    </Button>
  );
}
