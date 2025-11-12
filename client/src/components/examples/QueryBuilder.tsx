import QueryBuilder from '../../pages/QueryBuilder';
import { ThemeProvider } from '../ThemeProvider';

export default function QueryBuilderExample() {
  return (
    <ThemeProvider>
      <div className="p-6 bg-background min-h-screen">
        <QueryBuilder />
      </div>
    </ThemeProvider>
  );
}
