# Backend Dockerfile for TEK Rewards API
# Uses Node.js 20.6.0 to match package.json engines
# Railway build context is repository root, so we copy from backend/

FROM node:20.6.0-alpine

# Set working directory
WORKDIR /app

# Copy backend package files (build context is repo root)
COPY backend/package*.json ./

# Install dependencies
RUN npm ci --only=production=false

# Copy all backend source files
COPY backend/ ./

# Build TypeScript
RUN npm run build

# Expose port (Railway will set PORT env var)
EXPOSE 10000

# Start the application
CMD ["npm", "start"]
