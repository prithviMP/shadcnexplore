import type { User } from "@shared/schema";

export interface SafeUser {
  id: string;
  email: string;
  name: string;
  role: string;
  otpEnabled: boolean;
  createdAt: Date;
}

export function sanitizeUser(user: User): SafeUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    otpEnabled: user.otpEnabled,
    createdAt: user.createdAt
  };
}
