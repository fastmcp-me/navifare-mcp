# Use Node.js 18 LTS as base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including dev dependencies needed for building)
RUN npm ci

# Copy source code
COPY . .

# Build the application (requires TypeScript from devDependencies)
RUN npm run build

# Build the React widget
RUN cd web && npm ci && npm run build

# Copy the built widget to the correct location
RUN cp web/dist/component.js src/components/

# Remove dev dependencies to reduce image size (optional but recommended)
RUN npm prune --production

# Expose port
EXPOSE 10000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=10000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:10000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the server
CMD ["npm", "run", "serve"]
