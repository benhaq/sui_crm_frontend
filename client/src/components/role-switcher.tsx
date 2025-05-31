import { Button } from '@/components/ui/button';
import { useAppStore } from '@/lib/store';
import { useLocation } from 'wouter';

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
      className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"
    >
      Switch to {currentRole === 'admin' ? 'Employee' : 'Admin'}
    </Button>
  );
}
