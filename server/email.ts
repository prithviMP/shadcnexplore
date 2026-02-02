/**
 * Email Service for sending notifications
 * Supports SMTP (Gmail, custom SMTP) and mock for development
 */

import nodemailer, { type Transporter } from "nodemailer";

interface EmailProvider {
  sendEmail(to: string, subject: string, html: string, text?: string): Promise<void>;
}

class SmtpProvider implements EmailProvider {
  private transporter: Transporter;

  constructor() {
    const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
    const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
    const smtpUser = process.env.SMTP_USER || "";
    const smtpPassword = process.env.SMTP_PASSWORD || "";
    const smtpSecure = process.env.SMTP_SECURE === "true";

    if (!smtpUser || !smtpPassword) {
      throw new Error("SMTP credentials not configured");
    }

    this.transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure, // true for 465, false for other ports
      auth: {
        user: smtpUser,
        pass: smtpPassword,
      },
    });
  }

  async sendEmail(to: string, subject: string, html: string, text?: string): Promise<void> {
    const from = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@finanalytics.com";

    await this.transporter.sendMail({
      from,
      to,
      subject,
      text: text || html.replace(/<[^>]*>/g, ""), // Strip HTML for text version
      html,
    });
  }
}

class MockEmailProvider implements EmailProvider {
  async sendEmail(to: string, subject: string, html: string, text?: string): Promise<void> {
    // Mock provider for development/testing
    console.log(`[MOCK EMAIL] To: ${to}`);
    console.log(`[MOCK EMAIL] Subject: ${subject}`);
    console.log(`[MOCK EMAIL] Body: ${text || html.replace(/<[^>]*>/g, "")}`);
    // In development, you might want to store this in a file or database for testing
  }
}

let emailProvider: EmailProvider;

export function getEmailProvider(): EmailProvider {
  if (emailProvider) {
    return emailProvider;
  }

  const provider = process.env.EMAIL_PROVIDER || "mock";

  switch (provider.toLowerCase()) {
    case "smtp":
      try {
        emailProvider = new SmtpProvider();
        console.log("[EMAIL] ✓ SMTP provider initialized successfully");
      } catch (error: any) {
        console.error("[EMAIL] ✗ SMTP provider failed to initialize:", error.message);
        console.error("[EMAIL] Falling back to mock provider. Emails will NOT be sent!");
        console.error("[EMAIL] Please check your SMTP configuration:");
        console.error("[EMAIL]   - EMAIL_PROVIDER=smtp");
        console.error("[EMAIL]   - SMTP_HOST");
        console.error("[EMAIL]   - SMTP_PORT");
        console.error("[EMAIL]   - SMTP_USER");
        console.error("[EMAIL]   - SMTP_PASSWORD");
        emailProvider = new MockEmailProvider();
      }
      break;
    case "mock":
    default:
      console.warn("[EMAIL] ⚠️  Using MOCK email provider. Emails will NOT be sent!");
      console.warn("[EMAIL] To enable real emails, set EMAIL_PROVIDER=smtp and configure SMTP credentials");
      emailProvider = new MockEmailProvider();
      break;
  }

  return emailProvider;
}

export async function sendEmail(to: string, subject: string, html: string, text?: string): Promise<void> {
  const provider = getEmailProvider();
  try {
    await provider.sendEmail(to, subject, html, text);
    console.log(`[EMAIL] ✓ Email sent successfully to: ${to}`);
  } catch (error: any) {
    console.error(`[EMAIL] ✗ Failed to send email to ${to}:`, error.message);
    console.error(`[EMAIL] Error details:`, error);
    throw error; // Re-throw so caller can handle it
  }
}

/**
 * Send welcome email to new user with login credentials
 */
export async function sendWelcomeEmail(
  userEmail: string,
  userName: string,
  userPassword: string,
  userRole: string
): Promise<void> {
  const loginUrl = process.env.APP_URL || "http://localhost:5000";
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 5px 5px; }
        .credentials { background-color: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #2563eb; }
        .credential-item { margin: 10px 0; }
        .label { font-weight: bold; color: #666; }
        .value { color: #333; font-family: monospace; }
        .button { display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
        .warning { background-color: #fef3c7; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #f59e0b; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Welcome to myBiniyog Valora</h1>
        </div>
        <div class="content">
          <p>Hello ${userName},</p>
          <p>Your account has been successfully created. Below are your login credentials:</p>
          
          <div class="credentials">
            <div class="credential-item">
              <span class="label">Email:</span>
              <div class="value">${userEmail}</div>
            </div>
            <div class="credential-item">
              <span class="label">Password:</span>
              <div class="value">${userPassword}</div>
            </div>
            <div class="credential-item">
              <span class="label">Role:</span>
              <div class="value">${userRole}</div>
            </div>
          </div>

          <div class="warning">
            <strong>⚠️ Important:</strong> Please change your password after your first login for security purposes.
          </div>

          <a href="${loginUrl}" class="button">Login to Your Account</a>

          <div class="footer">
            <p>If you have any questions, please contact your administrator.</p>
            <p>This is an automated message. Please do not reply to this email.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
Welcome to myBiniyog Valora

Hello ${userName},

Your account has been successfully created. Below are your login credentials:

Email: ${userEmail}
Password: ${userPassword}
Role: ${userRole}

⚠️ Important: Please change your password after your first login for security purposes.

Login URL: ${loginUrl}

If you have any questions, please contact your administrator.

This is an automated message. Please do not reply to this email.
  `;

  await sendEmail(userEmail, "Welcome to myBiniyog Valora - Your Account Credentials", html, text);
}

/**
 * Send notification email to admin when a new user is added
 */
export async function sendAdminNotificationEmail(
  adminEmail: string,
  newUserName: string,
  newUserEmail: string,
  newUserRole: string,
  createdBy: string
): Promise<void> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #059669; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 5px 5px; }
        .user-info { background-color: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #059669; }
        .info-item { margin: 10px 0; }
        .label { font-weight: bold; color: #666; }
        .value { color: #333; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>New User Added</h1>
        </div>
        <div class="content">
          <p>Hello Admin,</p>
          <p>A new user has been added to the myBiniyog Valora platform:</p>
          
          <div class="user-info">
            <div class="info-item">
              <span class="label">Name:</span>
              <span class="value">${newUserName}</span>
            </div>
            <div class="info-item">
              <span class="label">Email:</span>
              <span class="value">${newUserEmail}</span>
            </div>
            <div class="info-item">
              <span class="label">Role:</span>
              <span class="value">${newUserRole}</span>
            </div>
            <div class="info-item">
              <span class="label">Created By:</span>
              <span class="value">${createdBy}</span>
            </div>
          </div>

          <p>The new user has been sent their login credentials via email.</p>

          <div class="footer">
            <p>This is an automated notification from myBiniyog Valora.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
New User Added

Hello Admin,

A new user has been added to the myBiniyog Valora platform:

Name: ${newUserName}
Email: ${newUserEmail}
Role: ${newUserRole}
Created By: ${createdBy}

The new user has been sent their login credentials via email.

This is an automated notification from myBiniyog Valora.
  `;

  await sendEmail(adminEmail, "New User Added to myBiniyog Valora", html, text);
}

/**
 * Send OTP code via email for login
 */
export async function sendOtpEmail(userEmail: string, code: string): Promise<void> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #059669; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 5px 5px; }
        .otp-code { background-color: white; padding: 30px; text-align: center; border-radius: 5px; margin: 20px 0; border: 2px dashed #059669; }
        .code { font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #059669; font-family: 'Courier New', monospace; }
        .warning { background-color: #fef3c7; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #f59e0b; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Your Login Verification Code</h1>
        </div>
        <div class="content">
          <p>Hello,</p>
          <p>You requested a login verification code for your myBiniyog Valora account. Please use the code below to complete your login:</p>
          
          <div class="otp-code">
            <div class="code">${code}</div>
          </div>

          <div class="warning">
            <strong>⚠️ Security Notice:</strong>
            <ul style="margin: 10px 0; padding-left: 20px;">
              <li>This code will expire in 10 minutes</li>
              <li>Never share this code with anyone</li>
              <li>If you didn't request this code, please ignore this email</li>
            </ul>
          </div>

          <p>If you didn't request this code, you can safely ignore this email.</p>

          <div class="footer">
            <p>This is an automated email from myBiniyog Valora. Please do not reply to this email.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
Your Login Verification Code

Hello,

You requested a login verification code for your myBiniyog Valora account. Please use the code below to complete your login:

${code}

⚠️ Security Notice:
- This code will expire in 10 minutes
- Never share this code with anyone
- If you didn't request this code, please ignore this email

If you didn't request this code, you can safely ignore this email.

This is an automated email from myBiniyog Valora. Please do not reply to this email.
  `;

  await sendEmail(userEmail, "Your myBiniyog Valora Login Verification Code", html, text);
}

/**
 * Send notification email to admin when all sectors update is completed
 */
export async function sendSectorUpdateCompleteEmail(
  adminEmail: string,
  totalSectors: number,
  successfulSectors: number,
  failedSectors: number,
  duration?: string,
  failedSectorDetails?: Array<{ sectorName: string; error: string }>
): Promise<void> {
  const successRate = totalSectors > 0 ? ((successfulSectors / totalSectors) * 100).toFixed(1) : '0';
  const hasErrors = failedSectors > 0;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: ${hasErrors ? '#dc2626' : '#059669'}; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 5px 5px; }
        .stats { background-color: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
        .stat-row { display: flex; justify-content: space-between; margin: 10px 0; padding: 10px; border-bottom: 1px solid #e5e7eb; }
        .stat-label { font-weight: bold; color: #666; }
        .stat-value { color: #333; font-size: 18px; font-weight: bold; }
        .success { color: #059669; }
        .error { color: #dc2626; }
        .failed-sectors { background-color: #fef2f2; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #dc2626; }
        .failed-item { margin: 10px 0; padding: 10px; background-color: white; border-radius: 3px; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${hasErrors ? '⚠️ Sector Update Completed with Errors' : '✅ All Sectors Update Completed'}</h1>
        </div>
        <div class="content">
          <p>Hello Admin,</p>
          <p>The scheduled update for all sectors has been completed.</p>
          
          <div class="stats">
            <div class="stat-row">
              <span class="stat-label">Total Sectors:</span>
              <span class="stat-value">${totalSectors}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Successful:</span>
              <span class="stat-value success">${successfulSectors}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Failed:</span>
              <span class="stat-value error">${failedSectors}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Success Rate:</span>
              <span class="stat-value">${successRate}%</span>
            </div>
            ${duration ? `
            <div class="stat-row">
              <span class="stat-label">Duration:</span>
              <span class="stat-value">${duration}</span>
            </div>
            ` : ''}
          </div>

          ${hasErrors && failedSectorDetails && failedSectorDetails.length > 0 ? `
          <div class="failed-sectors">
            <h3>Failed Sectors (${failedSectors}):</h3>
            ${failedSectorDetails.slice(0, 10).map(item => `
              <div class="failed-item">
                <strong>${item.sectorName}</strong><br>
                <span style="color: #dc2626; font-size: 12px;">${item.error}</span>
              </div>
            `).join('')}
            ${failedSectorDetails.length > 10 ? `<p style="margin-top: 10px; font-size: 12px; color: #666;">... and ${failedSectorDetails.length - 10} more failed sectors</p>` : ''}
          </div>
          ` : ''}

          <div class="footer">
            <p>This is an automated notification from myBiniyog Valora.</p>
            <p>You can view detailed results in the Scheduler page.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
${hasErrors ? '⚠️ Sector Update Completed with Errors' : '✅ All Sectors Update Completed'}

Hello Admin,

The scheduled update for all sectors has been completed.

Total Sectors: ${totalSectors}
Successful: ${successfulSectors}
Failed: ${failedSectors}
Success Rate: ${successRate}%
${duration ? `Duration: ${duration}` : ''}

${hasErrors && failedSectorDetails && failedSectorDetails.length > 0 ? `
Failed Sectors (${failedSectors}):
${failedSectorDetails.slice(0, 10).map(item => `- ${item.sectorName}: ${item.error}`).join('\n')}
${failedSectorDetails.length > 10 ? `... and ${failedSectorDetails.length - 10} more failed sectors` : ''}
` : ''}

This is an automated notification from myBiniyog Valora.
You can view detailed results in the Scheduler page.
  `;

  await sendEmail(adminEmail, `${hasErrors ? '⚠️ ' : '✅ '}All Sectors Update Completed - ${successfulSectors}/${totalSectors} Successful`, html, text);
}

/**
 * Send password reset email with reset link
 */
export async function sendPasswordResetEmail(
  userEmail: string,
  userName: string,
  resetLink: string
): Promise<void> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 5px 5px; }
        .button { display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .warning { background-color: #fef3c7; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #f59e0b; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
        .link { word-break: break-all; color: #2563eb; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Password Reset Request</h1>
        </div>
        <div class="content">
          <p>Hello ${userName},</p>
          <p>You requested to reset your password for your myBiniyog Valora account. Click the button below to reset your password:</p>
          
          <div style="text-align: center;">
            <a href="${resetLink}" class="button">Reset Password</a>
          </div>

          <p>Or copy and paste this link into your browser:</p>
          <p class="link">${resetLink}</p>

          <div class="warning">
            <strong>⚠️ Security Notice:</strong>
            <ul style="margin: 10px 0; padding-left: 20px;">
              <li>This link will expire in 1 hour</li>
              <li>If you didn't request this password reset, please ignore this email</li>
              <li>Never share this link with anyone</li>
              <li>Your password will remain unchanged if you don't click the link</li>
            </ul>
          </div>

          <p>If you didn't request a password reset, you can safely ignore this email.</p>

          <div class="footer">
            <p>This is an automated email from myBiniyog Valora. Please do not reply to this email.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  const text = `
Password Reset Request

Hello ${userName},

You requested to reset your password for your myBiniyog Valora account. Click the link below to reset your password:

${resetLink}

⚠️ Security Notice:
- This link will expire in 1 hour
- If you didn't request this password reset, please ignore this email
- Never share this link with anyone
- Your password will remain unchanged if you don't click the link

If you didn't request a password reset, you can safely ignore this email.

This is an automated email from myBiniyog Valora. Please do not reply to this email.
  `;

  await sendEmail(userEmail, "Reset Your myBiniyog Valora Password", html, text);
}

