import { compare, hash } from "bcryptjs";
import { authenticator } from "otplib";
import { storage } from "./storage";
import { sendOtpSms } from "./sms";
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

export function generateOTPAuthURL(email: string, secret: string): string {
  return authenticator.keyuri(email, "myBiniyog Valora", secret);
}

export async function createUserSession(userId: string): Promise<string> {
  await storage.deleteSessionsByUserId(userId);
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

/**
 * Generate a 6-digit OTP code
 */
export function generateOtpCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Create and send OTP code via Email
 */
export async function createAndSendOtp(email: string): Promise<string> {
  // Generate 6-digit code
  const code = generateOtpCode();
  
  // Set expiration to 10 minutes from now
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 10);

  // Store OTP code
  await storage.createOtpCode({
    email,
    code,
    expiresAt,
    used: false,
  });

  // Send Email
  const { sendOtpEmail } = await import("./email");
  await sendOtpEmail(email, code);

  return code;
}

/**
 * Verify OTP code
 */
export async function verifyOtpCode(email: string, code: string): Promise<boolean> {
  const otpRecord = await storage.getOtpCode(email, code);
  
  if (!otpRecord) {
    return false;
  }

  // Check if expired
  if (new Date() > otpRecord.expiresAt) {
    return false;
  }

  // Mark as used
  await storage.markOtpCodeAsUsed(otpRecord.id);

  return true;
}
