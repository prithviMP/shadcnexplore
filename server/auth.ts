import { compare, hash } from "bcryptjs";
import { authenticator } from "otplib";
import { storage } from "./storage";
import type { User } from "@shared/schema";

export async function hashPassword(password: string): Promise<string> {
  return await hash(password, 10);
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return await compare(password, hashedPassword);
}

export function generateOTPSecret(): string {
  return authenticator.generateSecret();
}

export function generateOTP(secret: string): string {
  return authenticator.generate(secret);
}

export function verifyOTP(token: string, secret: string): boolean {
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}

export async function createUserSession(userId: string): Promise<string> {
  const session = await storage.createSession(userId);
  return session.token;
}

export async function getUserFromSession(token: string): Promise<User | null> {
  const session = await storage.getSession(token);
  if (!session) return null;

  if (new Date() > session.expiresAt) {
    await storage.deleteSession(token);
    return null;
  }

  return await storage.getUser(session.userId) || null;
}

export async function deleteUserSession(token: string): Promise<void> {
  await storage.deleteSession(token);
}
