# Backend Dockerfile for TEK Rewards API
# Uses Node.js 20.6.0 to match package.json engines

FROM node:20.6.0-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production=false

# Copy source files
COPY . .

# Build TypeScript
RUN npm run build

# Expose port (Railway will set PORT env var)
EXPOSE 10000

# Start the application
CMD ["npm", "start"]
