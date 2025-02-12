# Use Node 16 (slim variant) as a base
FROM node:16-slim


# Install Docker CLI and jq, then clean up to reduce image size
RUN apt-get update && \
    apt-get install -y --no-install-recommends docker.io jq && \
    rm -rf /var/lib/apt/lists/*

# Create /app directory
WORKDIR /app

# Install Express (no package.json used in this example, so install directly)
RUN npm install express

# Copy script + Node app into container
COPY docker_stats.sh /app/docker_stats.sh
COPY app.js /app/app.js
COPY public /app/public

# Ensure the script is executable
RUN chmod +x /app/docker_stats.sh

# Expose port 8076 by default
EXPOSE 8076

# Start the Node.js application
CMD [ "node", "app.js" ]
