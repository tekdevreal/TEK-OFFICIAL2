# Telegram Bot Dockerfile for TEK Rewards
# Uses Node.js 20.6.0 to match package.json engines
# Railway build context is repository root, so we copy from telegram-bot/

FROM node:20.6.0-alpine

# Set working directory
WORKDIR /app

# Copy telegram-bot package files (build context is repo root)
COPY telegram-bot/package*.json ./

# Install dependencies
RUN npm ci --only=production=false

# Copy all telegram-bot source files
COPY telegram-bot/ ./

# Build TypeScript
RUN npm run build

# Expose port (Railway will set PORT env var)
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
