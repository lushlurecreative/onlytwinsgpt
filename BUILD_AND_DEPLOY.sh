#!/bin/bash

# Build and push OnlyTwins worker image to Docker Hub
# Usage: ./BUILD_AND_DEPLOY.sh

set -e

DOCKER_USERNAME="${DOCKER_USERNAME:-lushlurecreative}"
DOCKER_IMAGE="$DOCKER_USERNAME/onlytwinsgpt-worker:latest"

echo "🔨 Building Docker image: $DOCKER_IMAGE"
cd "$(dirname "$0")/worker"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first:"
    echo "   https://docs.docker.com/get-docker/"
    exit 1
fi

# Build the image
docker build -f Dockerfile.production -t "$DOCKER_IMAGE" .

if [ $? -eq 0 ]; then
    echo "✅ Docker image built successfully"
else
    echo "❌ Docker build failed"
    exit 1
fi

# Check if user is logged in to Docker Hub
if ! docker info | grep -q "Username"; then
    echo ""
    echo "⚠️  Not logged in to Docker Hub. Logging in..."
    docker login -u "$DOCKER_USERNAME"
fi

# Push the image
echo ""
echo "📤 Pushing image to Docker Hub..."
docker push "$DOCKER_IMAGE"

if [ $? -eq 0 ]; then
    echo "✅ Image pushed successfully!"
    echo ""
    echo "📋 Next steps:"
    echo "1. Go to RunPod dashboard"
    echo "2. Click on your 'onlytwinsgpt-worker' endpoint"
    echo "3. Click 'Manage' → 'Docker Image'"
    echo "4. Change the image to: $DOCKER_IMAGE"
    echo "5. Click 'Save' and wait for workers to redeploy (2-5 minutes)"
    echo ""
    echo "✨ Once workers finish deploying, the health check will pass!"
else
    echo "❌ Docker push failed"
    exit 1
fi
