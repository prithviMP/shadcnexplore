# Setup Instructions

## Prerequisites

1. Node.js 20+ installed
2. PostgreSQL database (or Neon PostgreSQL connection string)

## Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
   - Create a `.env` file in the root directory
   - Add your `DATABASE_URL`:
   ```
   DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require
   PORT=5000
   NODE_ENV=development
   ```

3. Run database migrations:
```bash
npm run db:push
```

## Running the Application

### Development Mode
```bash
npm run dev
```

The server will start on port 5000 (or the port specified in PORT environment variable).

### Production Mode
```bash
npm run build
npm start
```

## Database Setup

You need a PostgreSQL database. Options:

1. **Neon PostgreSQL** (Recommended for cloud):
   - Sign up at https://neon.tech
   - Get your connection string
   - Set it as `DATABASE_URL`

2. **Local PostgreSQL**:
   - Install PostgreSQL locally
   - Create a database: `createdb scrapper_screener`
   - Set `DATABASE_URL=postgresql://localhost:5432/scrapper_screener`

## Environment Variables

- `DATABASE_URL` (required): PostgreSQL connection string
- `PORT` (optional): Server port (default: 5000)
- `NODE_ENV` (optional): Environment mode (development/production)
- `SMS_PROVIDER` (optional): SMS provider for OTP (mock/twilio/aws)
- `TWILIO_*` (optional): Twilio credentials if using Twilio
- `AWS_*` (optional): AWS credentials if using AWS SNS

### Email Configuration (for user creation notifications)

- `EMAIL_PROVIDER` (optional): Email provider (smtp/mock, default: mock)
- `SMTP_HOST` (optional): SMTP server hostname (default: smtp.gmail.com)
- `SMTP_PORT` (optional): SMTP server port (default: 587)
- `SMTP_USER` (optional): SMTP username/email
- `SMTP_PASSWORD` (optional): SMTP password or app password
- `SMTP_FROM` (optional): From email address (defaults to SMTP_USER)
- `SMTP_SECURE` (optional): Use secure connection (true/false, default: false)
- `APP_URL` (optional): Application URL for email links (default: http://localhost:5000)

**Example Gmail Configuration:**
```
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=noreply@finanalytics.com
SMTP_SECURE=false
APP_URL=https://your-domain.com
```

**Note:** For Gmail, you'll need to use an [App Password](https://support.google.com/accounts/answer/185833) instead of your regular password.

## Troubleshooting

- If you see "DATABASE_URL environment variable is not set", create a `.env` file with your database URL
- If migrations fail, ensure your database is accessible and the connection string is correct
- For local development without a database, you may need to set up a local PostgreSQL instance or use a cloud database

