FROM python:3.10-slim

# Install system dependencies for PostgreSQL and building packages
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install python packages
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all repository contents
COPY . .

# Expose FastAPI port
EXPOSE 8000

# Run uvicorn starting from webapp/backend/main.py
CMD ["uvicorn", "webapp.backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
