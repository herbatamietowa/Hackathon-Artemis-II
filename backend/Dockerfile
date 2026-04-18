FROM python:3.11-slim
WORKDIR /app
# Build context is project root — copy requirements from root
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# Copy backend source into /app (so app.main:app resolves correctly)
COPY backend/ .
ENV PYTHONPATH=/app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
