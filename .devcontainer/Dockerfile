FROM node:22-bookworm-slim

RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends \
        ca-certificates \
        curl \
        git \
        python3 \
        unzip \
        zip \
    && apt-get clean -y && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
