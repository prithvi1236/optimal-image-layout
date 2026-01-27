FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create directories for uploads and output
RUN mkdir -p uploads output

# Expose port
EXPOSE 5002

# Run with gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:5002", "app:app"]