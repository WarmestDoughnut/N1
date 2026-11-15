# N1 Hub backend — FastAPI stats/API (pandas/numpy/scikit-learn).
# Build context = backend/ . Deploy on a container host (Railway/Render/Fly), NOT Vercel
# serverless (sklearn exceeds the serverless bundle/cold-start limits).
FROM python:3.11-slim

WORKDIR /app

# System deps kept minimal; psycopg2-binary ships its own libpq.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code + the demo data package (CSV time series, patients, devices, demo plans).
COPY app ./app
COPY data ./data
COPY tests ./tests

# Container hosts inject $PORT; default to 8000 locally.
ENV PORT=8000
EXPOSE 8000

# Set DATABASE_URL (Supabase Postgres) to centralize state; unset => local store.json.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
