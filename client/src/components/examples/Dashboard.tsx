import Dashboard from '../../pages/Dashboard';
import { ThemeProvider } from '../ThemeProvider';

export default function DashboardExample() {
  return (
    <ThemeProvider>
      <div className="p-6 bg-background min-h-screen">
        <Dashboard />
      </div>
    </ThemeProvider>
  );
}
