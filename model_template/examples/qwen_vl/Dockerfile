FROM python:3.12-slim

WORKDIR /app

COPY base /app/base/
COPY examples/qwen_vl/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY examples/qwen_vl/ .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
