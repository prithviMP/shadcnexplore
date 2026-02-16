import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useLocation, useRoute } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import type { User } from "@shared/schema";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  /** Returns { requiresEmailOTP: true } when OTP was sent to email; otherwise completes login and redirects. */
  login: (email: string, password: string) => Promise<{ requiresEmailOTP?: boolean }>;
  /** Complete login after entering the OTP sent to email (two-step verification). */
  verifyEmailOTP: (email: string, password: string, otp: string) => Promise<void>;
  loginWithOTP: (email: string, otp: string) => Promise<void>;
  requestOTP: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_TOKEN_KEY = "auth_token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setLocation] = useLocation();

  // Check for existing session on mount
  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      if (!token) {
        setLoading(false);
        return;
      }

      const response = await apiRequest("GET", "/api/auth/me");
      if (!response.ok) {
        throw new Error("Authentication failed");
      }
      const data = await response.json();
      setUser(data.user || data);
    } catch (error) {
      // Not authenticated - clear token and user
      console.log("Auth check failed, clearing session:", error);
      localStorage.removeItem(AUTH_TOKEN_KEY);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  async function login(email: string, password: string): Promise<{ requiresEmailOTP?: boolean }> {
    try {
      const response = await apiRequest("POST", "/api/auth/login", {
        email,
        password,
      });

      const data = await response.json();

      if (data.requiresEmailOTP) {
        return { requiresEmailOTP: true };
      }

      if (data.token) {
        localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      }
      setUser(data.user);
      setLocation("/");
      return {};
    } catch (error: any) {
      throw new Error(error.message || "Login failed");
    }
  }

  async function verifyEmailOTP(email: string, password: string, otp: string) {
    try {
      const response = await apiRequest("POST", "/api/auth/login/verify-email-otp", {
        email,
        password,
        otp,
      });

      const data = await response.json();

      if (data.token) {
        localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      }
      setUser(data.user);
      setLocation("/");
    } catch (error: any) {
      throw new Error(error.message || "OTP verification failed");
    }
  }

  async function register(email: string, password: string, name: string, role: string = "viewer") {
    try {
      const response = await apiRequest("POST", "/api/auth/register", {
        email,
        password,
        name,
        role,
      });

      const data = await response.json();
      
      // Store token if provided
      if (data.token) {
        localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      }

      setUser(data.user);
      setLocation("/");
    } catch (error: any) {
      throw new Error(error.message || "Registration failed");
    }
  }

  async function requestOTP(email: string) {
    try {
      await apiRequest("POST", "/api/auth/login/otp/request", { email });
    } catch (error: any) {
      throw new Error(error.message || "Failed to send OTP");
    }
  }

  async function loginWithOTP(email: string, otp: string) {
    try {
      const response = await apiRequest("POST", "/api/auth/login/otp/verify", {
        email,
        otp,
      });

      const data = await response.json();
      
      // Store token if provided
      if (data.token) {
        localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      }

      setUser(data.user);
      setLocation("/");
    } catch (error: any) {
      throw new Error(error.message || "OTP verification failed");
    }
  }

  async function logout() {
    try {
      await apiRequest("POST", "/api/auth/logout");
    } catch (error) {
      // Continue with logout even if API call fails
    } finally {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      setUser(null);
      setLocation("/login");
    }
  }

  async function refreshUser() {
    try {
      const response = await apiRequest("GET", "/api/auth/me");
      const data = await response.json();
      setUser(data.user || data);
    } catch (error) {
      // User session expired
      localStorage.removeItem(AUTH_TOKEN_KEY);
      setUser(null);
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        verifyEmailOTP,
        register,
        loginWithOTP,
        requestOTP,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

