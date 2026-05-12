# Production Dockerfile for Quantum Portfolio Optimization System
FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1
ENV FLASK_APP=production_api.py
ENV FLASK_ENV=production

# Install system dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        gcc \
        g++ \
        libgomp1 \
        postgresql-client \
        redis-tools \
        curl \
        gnupg \
    && rm -rf /var/lib/apt/lists/*

# Create application directory and user
RUN groupadd -r quantum && useradd -r -g quantum quantum
WORKDIR /app

# Copy requirements first to leverage Docker cache
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir gunicorn psycopg2-binary redis hiredis flask-limiter flask-jwt-extended sentry-sdk[flask]

# Copy application code
COPY . .

# Change ownership to quantum user
RUN chown -R quantum:quantum /app
USER quantum

# Create necessary directories
RUN mkdir -p /app/logs /app/data

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

# Start command
CMD ["gunicorn", "--bind", "0.0.0.0:5000", \
     "--workers", "4", \
     "--worker-class", "gthread", \
     "--threads", "2", \
     "--timeout", "120", \
     "--keep-alive", "5", \
     "--max-requests", "1000", \
     "--max-requests-jitter", "100", \
     "--preload", \
     "--access-logfile", "-", \
     "--error-logfile", "-", \
     "production_api:app"]