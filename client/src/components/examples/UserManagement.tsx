import UserManagement from '../../pages/UserManagement';
import { ThemeProvider } from '../ThemeProvider';

export default function UserManagementExample() {
  return (
    <ThemeProvider>
      <div className="p-6 bg-background min-h-screen">
        <UserManagement />
      </div>
    </ThemeProvider>
  );
}
