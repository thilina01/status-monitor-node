# Status Monitor Node

Status Monitor Node is a lightweight Docker service monitoring application built using Node.js and Express. It aggregates real-time metrics from your Docker containers—such as CPU usage, memory consumption, and network I/O—and presents a centralized status overview through a responsive web dashboard and a REST API.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation and Setup](#installation-and-setup)
- [Configuration](#configuration)
- [Usage](#usage)
- [CI/CD and Release Management](#cicd-and-release-management)
- [Value Proposition](#value-proposition)
- [Contributing](#contributing)
- [License](#license)
- [Acknowledgements](#acknowledgements)

## Overview

Status Monitor Node is designed to give you a real-time snapshot of your Docker services' health and performance. By reading expected services from a JSON file and dynamically collecting metrics from Docker, the application highlights which services are up, down, or facing issues. A modern web interface built with Bootstrap further simplifies monitoring and troubleshooting.

## Features

- **Real-Time Monitoring**: Retrieves live metrics from Docker using \`docker stats\` and \`docker ps\`.
- **Service Health Assessment**: Compares expected services (from \`services.json\`) with live data to mark each service as "up", "down", "healthy", or "unhealthy".
- **Metrics Aggregation**: Consolidates CPU, memory, and network I/O metrics across all monitored services.
- **Caching Mechanism**: Implements a configurable cache (default 60 seconds) to optimize performance.
- **REST API**: Exposes \`/api/status\` for programmatic access to aggregated metrics.
- **Responsive Dashboard**: Features a clean, Bootstrap-powered UI with dark/light mode support, auto-refresh countdown, and detailed service cards.
- **Containerized Deployment**: Dockerfile and Docker Compose support for easy deployment in any environment.
- **Automated Release Pipeline**: Includes a GitHub Actions workflow for semantic versioning, Docker image builds, image pushes to Docker Hub and GitHub Container Registry, and GitHub release creation with changelog generation.

## Architecture

The project comprises several components:

**Backend (app.js)**:
- Reads the expected services from \`services.json\`.
- Executes a shell script to collect Docker container statistics.
- Processes and aggregates the metrics.
- Provides a REST API endpoint (\`/api/status\`) to deliver the consolidated data.

**Shell Script (docker_stats.sh)**:
- Runs Docker commands (\`docker stats\` and \`docker ps\`) to gather container data.
- Uses \`jq\` and \`awk\` to parse and format the output as JSON.

**Frontend (public/ Directory)**:
- Contains HTML, CSS, and JavaScript files for a responsive dashboard.
- Displays service statuses, CPU/memory usage, network I/O, and auto-refresh functionality.
- Supports dark/light mode toggling.

**Containerization (Dockerfile & Docker Compose)**:
- Uses the Node 16 slim image, installs required packages (Docker CLI, jq), and sets up the application.
- The Docker Compose file mounts \`services.json\` (read-only) and the Docker socket to enable metrics collection.

**CI/CD Pipeline (GitHub Actions)**:
- Automates version bumping, Docker image building, and pushing images to Docker Hub and GitHub Container Registry.
- Generates changelogs from commit history and creates GitHub releases.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/)
- [Node.js (v16 or later)](https://nodejs.org/) – for local development (if not using Docker)

## Installation and Setup

### 1. Clone the Repository

```bash
git clone https://github.com/<your-username>/status-monitor-node.git
cd status-monitor-node
```

### 2. Prepare the \`services.json\` File

Ensure a \`services.json\` file exists in the repository root. This file should list the expected service names, for example:

```json
[
    "status-monitor",
    "web",
    "nginx-proxy"
]
```

### 3. Run with Docker Compose

Build and run the containerized application using Docker Compose:

```bash
docker-compose up --build
```

This will:
- Build the Docker image as per the Dockerfile.
- Mount \`services.json\` and the Docker socket into the container.
- Expose the application on port \`8076\`.

### 4. Access the Application

- **Web Dashboard**: Navigate to \`http://localhost:8076\` in your browser.
- **API Endpoint**: Access real-time status data at \`http://localhost:8076/api/status\`.

## Configuration

### Environment Variables

The application supports several environment variables:

- **SERVICES_FILE**:  
  Path to the JSON file with expected services. (Default: \`/app/services.json\`)

- **CACHE_TTL**:  
  Cache time-to-live in milliseconds. (Default: \`60000\` for 1 minute)

- **PORT**:  
  Port for the Node.js server. (Default: \`8076\`)

These can be set in your Docker Compose file or passed directly when starting the container.

## CI/CD and Release Management

The repository includes a GitHub Actions workflow (\`.github/workflows/release.yml\`) that automates the release process. Key features include:

- **Manual Trigger with \`workflow_dispatch\`**:  
  Release managers can trigger the workflow manually and specify the release type—major, minor, or patch.

- **Semantic Versioning**:  
  The workflow reads the latest Git tag, increments it based on the selected release type, and creates a new tag.

- **Docker Image Build and Push**:  
  Uses the repository name as the image name, tagging and pushing images to both Docker Hub and GitHub Container Registry.

- **Changelog Generation**:  
  Automatically generates a changelog from commit messages between releases.

- **GitHub Release Creation**:  
  Creates a new GitHub release with the updated version and changelog.

### Required Secrets

Make sure to configure the following secrets in your GitHub repository settings (Settings → Secrets and Variables → Actions):

- **DOCKERHUB_USERNAME**: Your Docker Hub username.
- **DOCKERHUB_TOKEN**: A Docker Hub access token.
- **GITHUB_TOKEN**: Provided automatically by GitHub Actions (ensure permissions for contents and packages).

## Value Proposition

**Status Monitor Node** is ideal for teams operating in containerized environments. It provides:

- **Centralized Monitoring**: Consolidates critical service metrics, enabling rapid identification and resolution of issues.
- **Operational Efficiency**: The caching mechanism, automated CI/CD pipeline, and easy-to-use dashboard reduce manual oversight and streamline operations.
- **Scalability and Flexibility**: Containerized deployment means the solution can easily scale with your environment while offering customizable settings to match your specific monitoring needs.
- **Proactive Alerting**: By highlighting service health (up, down, healthy, or unhealthy), the application helps prevent downtime and improve service reliability.

## Contributing

Contributions are welcome! Follow these steps to contribute:

1. Fork the repository.
2. Create a new branch for your feature or fix.
3. Commit your changes with clear, descriptive messages.
4. Open a pull request and explain the benefits of your changes.

## License

This project is licensed under the [MIT License](LICENSE).

## Acknowledgements

- **Docker** for the robust containerization platform.
- **Node.js & Express** for providing a powerful runtime and web framework.
- **Bootstrap** for the responsive and modern UI.
- **GitHub Actions** for streamlining CI/CD processes.