# Hugging Face Spaces Dockerfile for Quantum Portfolio Lab
# Builds React frontend + Python API, serves both on port 7860

# ─── Stage 1: Build React frontend ───
FROM node:18-slim AS frontend-build
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci --legacy-peer-deps

COPY frontend/ ./
ENV CI=false
RUN npm run build

# ─── Stage 2: Python runtime ───
FROM python:3.11-slim

# HF Spaces: run as user 1000
RUN useradd -m -u 1000 user
ENV HOME=/home/user
ENV PATH=$HOME/.local/bin:$PATH
WORKDIR $HOME/app

# System deps
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        gcc \
        g++ \
        libgomp1 \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Python deps
COPY deps/requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Copy app code
COPY --chown=user . .

# Copy built frontend from stage 1
COPY --from=frontend-build --chown=user /app/frontend/build ./frontend/build

USER user

# HF Spaces default port
ENV PORT=7860
EXPOSE 7860

# Serve API + frontend
CMD ["python", "serve_hf.py"]
