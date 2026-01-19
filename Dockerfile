# Backend Dockerfile for TEK Rewards API
# Uses Node.js 20.6.0 to match package.json engines
# This Dockerfile works from repository root
# Railway Settings: Dockerfile Path = "backend/Dockerfile" OR Root Directory = "backend"

FROM node:20.6.0-alpine

# Set working directory to backend
WORKDIR /app/backend

# Copy backend package files
COPY backend/package*.json ./

# Install dependencies
RUN npm ci --only=production=false

# Copy backend source files
COPY backend/ ./

# Build TypeScript
RUN npm run build

# Expose port (Railway will set PORT env var)
EXPOSE 10000

# Start the application
CMD ["npm", "start"]
