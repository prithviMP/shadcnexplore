import FormulaManager from '../../pages/FormulaManager';
import { ThemeProvider } from '../ThemeProvider';

export default function FormulaManagerExample() {
  return (
    <ThemeProvider>
      <div className="p-6 bg-background min-h-screen">
        <FormulaManager />
      </div>
    </ThemeProvider>
  );
}
