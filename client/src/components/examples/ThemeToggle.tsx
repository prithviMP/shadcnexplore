import ThemeToggle from '../ThemeToggle';
import { ThemeProvider } from '../ThemeProvider';

export default function ThemeToggleExample() {
  return (
    <ThemeProvider>
      <div className="flex items-center gap-4">
        <span className="text-sm">Toggle theme:</span>
        <ThemeToggle />
      </div>
    </ThemeProvider>
  );
}
