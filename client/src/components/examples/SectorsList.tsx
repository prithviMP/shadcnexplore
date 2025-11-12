import SectorsList from '../../pages/SectorsList';
import { ThemeProvider } from '../ThemeProvider';

export default function SectorsListExample() {
  return (
    <ThemeProvider>
      <div className="p-6 bg-background min-h-screen">
        <SectorsList />
      </div>
    </ThemeProvider>
  );
}
