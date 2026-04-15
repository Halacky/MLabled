FROM python:3.12-slim

WORKDIR /app

COPY base /app/base/
COPY examples/dinov3_fewshot/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY examples/dinov3_fewshot/ .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
