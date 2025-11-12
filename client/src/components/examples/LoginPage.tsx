import LoginPage from '../../pages/LoginPage';
import { ThemeProvider } from '../ThemeProvider';

export default function LoginPageExample() {
  return (
    <ThemeProvider>
      <LoginPage />
    </ThemeProvider>
  );
}
