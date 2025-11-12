import CompanyDetail from '../../pages/CompanyDetail';
import { ThemeProvider } from '../ThemeProvider';

export default function CompanyDetailExample() {
  return (
    <ThemeProvider>
      <div className="p-6 bg-background min-h-screen">
        <CompanyDetail />
      </div>
    </ThemeProvider>
  );
}
