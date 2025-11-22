/**
 * SMS Service for sending OTP codes
 * Supports Twilio and AWS SNS
 */

interface SmsProvider {
  sendSms(phone: string, message: string): Promise<void>;
}

class TwilioProvider implements SmsProvider {
  private accountSid: string;
  private authToken: string;
  private fromNumber: string;

  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID || "";
    this.authToken = process.env.TWILIO_AUTH_TOKEN || "";
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER || "";
  }

  async sendSms(phone: string, message: string): Promise<void> {
    if (!this.accountSid || !this.authToken || !this.fromNumber) {
      throw new Error("Twilio credentials not configured");
    }

    // In a real implementation, you would use the Twilio SDK:
    // const client = require('twilio')(this.accountSid, this.authToken);
    // await client.messages.create({
    //   body: message,
    //   from: this.fromNumber,
    //   to: phone
    // });

    // For now, we'll log it (in development) or throw an error if credentials are missing
    console.log(`[SMS] Would send to ${phone}: ${message}`);
    
    // In production, uncomment the Twilio SDK code above
    // For development/testing, you can use a mock service
  }
}

class AwsSnsProvider implements SmsProvider {
  private region: string;
  private accessKeyId: string;
  private secretAccessKey: string;

  constructor() {
    this.region = process.env.AWS_REGION || "us-east-1";
    this.accessKeyId = process.env.AWS_ACCESS_KEY_ID || "";
    this.secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || "";
  }

  async sendSms(phone: string, message: string): Promise<void> {
    if (!this.accessKeyId || !this.secretAccessKey) {
      throw new Error("AWS SNS credentials not configured");
    }

    // In a real implementation, you would use the AWS SDK:
    // const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");
    // const client = new SNSClient({ region: this.region });
    // await client.send(new PublishCommand({
    //   PhoneNumber: phone,
    //   Message: message
    // }));

    // For now, we'll log it (in development)
    console.log(`[SMS] Would send to ${phone}: ${message}`);
    
    // In production, uncomment the AWS SDK code above
  }
}

class MockSmsProvider implements SmsProvider {
  async sendSms(phone: string, message: string): Promise<void> {
    // Mock provider for development/testing
    console.log(`[MOCK SMS] To: ${phone}, Message: ${message}`);
    // In development, you might want to store this in a file or database for testing
  }
}

let smsProvider: SmsProvider;

export function getSmsProvider(): SmsProvider {
  if (smsProvider) {
    return smsProvider;
  }

  const provider = process.env.SMS_PROVIDER || "mock";

  switch (provider.toLowerCase()) {
    case "twilio":
      smsProvider = new TwilioProvider();
      break;
    case "aws":
    case "sns":
      smsProvider = new AwsSnsProvider();
      break;
    case "mock":
    default:
      smsProvider = new MockSmsProvider();
      break;
  }

  return smsProvider;
}

export async function sendOtpSms(phone: string, code: string): Promise<void> {
  const provider = getSmsProvider();
  const message = `Your FinAnalytics verification code is: ${code}. Valid for 10 minutes.`;
  await provider.sendSms(phone, message);
}

