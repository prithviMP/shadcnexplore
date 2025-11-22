#!/bin/bash
# Setup script for local development

echo "🚀 Setting up ShadcnExplore for local development..."

# Check if .env exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cat > .env << 'ENVEOF'
# Database Configuration
# Replace with your PostgreSQL connection string
# For Neon PostgreSQL: postgresql://user:password@host/database?sslmode=require
# For local PostgreSQL: postgresql://localhost:5432/scrapper_screener
DATABASE_URL=postgresql://localhost:5432/scrapper_screener

# Server Configuration
PORT=5000
NODE_ENV=development
ENVEOF
    echo "✅ .env file created! Please update DATABASE_URL with your database connection string."
else
    echo "✅ .env file already exists"
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
else
    echo "✅ Dependencies already installed"
fi

echo ""
echo "📋 Next steps:"
echo "1. Update the DATABASE_URL in .env with your PostgreSQL connection string"
echo "2. Run database migrations: npm run db:push"
echo "3. Start the development server: npm run dev"
echo ""
