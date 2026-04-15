# Деплой моделей для MLabled

MLabled использует модульную архитектуру: каждая модель — отдельный сервис с unified API.
Адаптеры (в `model_template/examples/`) — лёгкие прокси, которые вызывают реальные модели через HTTP.

## Архитектура

```
MLabled Backend ──→ Adapter (порт 800X) ──→ Реальная модель (порт 850X)
                    (unified API)             (внешний сервис)
```

**Адаптеры** запускаются через docker-compose.models.yml и регистрируются в MLabled.
**Реальные модели** поднимаются отдельно (свой docker-compose или venv).

---

## 1. YOLO (Detection)

### Характеристики
- **Тип**: fixed-class (80 классов COCO)
- **Задачи**: detection
- **VRAM**: ~500MB (yolo11n), ~2GB (yolo11x)
- **GPU**: любая NVIDIA (работает и на CPU)

### Деплой

YOLO модель встроена прямо в адаптер — внешний сервис не нужен.

```bash
# Сборка и запуск
docker build -t mlabled-yolo \
  -f model_template/examples/yolo/Dockerfile \
  model_template/

docker run -d --name mlabled-yolo \
  --network mlabled_default \
  --gpus all \
  -p 8001:8000 \
  mlabled-yolo

# Проверка
curl http://localhost:8001/health
curl http://localhost:8001/info | python3 -m json.tool
```

### Регистрация в MLabled
```
Models → + Register Model
  Name: YOLOv11
  URL:  http://mlabled-yolo:8000
```

### Настройка весов
Отредактируйте `model_template/examples/yolo/config.yaml`:
```yaml
weights: "yolo11n.pt"    # nano (5MB, быстрая)
# weights: "yolo11s.pt"  # small (20MB)
# weights: "yolo11m.pt"  # medium (40MB)
# weights: "yolo11x.pt"  # extra-large (110MB, точная)
```
Веса скачиваются автоматически при первом запуске.

---

## 2. Qwen3-VL (Open-vocabulary Detection + Classification)

### Характеристики
- **Тип**: open-class (любые классы через текстовый промпт)
- **Задачи**: detection, classification
- **VRAM**: ~10GB (4B int8), ~15GB (7B int8)
- **GPU**: RTX 3060+ (12GB) для 4B, RTX 3090+ (24GB) для 7B

### Шаг 1: Поднять Qwen3-VL сервер

Используется репозиторий [qwen3-vl-inference](https://github.com/rpol-recart/qwen3-vl-inference):

```bash
# Клонировать (если ещё не)
git clone https://github.com/rpol-recart/qwen3-vl-inference.git
cd qwen3-vl-inference

# Настроить .env
cp .env.example .env
```

Отредактируйте `.env`:
```env
MODEL_PATH=Qwen/Qwen3-VL-4B-Instruct   # для RTX 3060 (12GB)
# MODEL_PATH=Qwen/Qwen3-VL-7B-Instruct  # для RTX 3090 (24GB)
GPU_MEMORY_UTILIZATION=0.95
MAX_MODEL_LEN=2048
DEFAULT_MAX_PIXELS=262144
PORT=8000
```

```bash
# Запуск через Docker
docker compose up -d

# Или через Make
make deploy-prod

# Проверка (модель скачается при первом старте, ~8GB)
curl http://localhost:8000/api/health
```

**Порт по умолчанию: 8000.** Если занят, измените `HOST_PORT` в `.env` или docker-compose.

### Шаг 2: Поднять адаптер MLabled

```bash
cd /path/to/mlabled

# Убедитесь что config.yaml указывает на правильный URL:
# model_template/examples/qwen_vl/config.yaml
#   api_url: "http://host.docker.internal:8000"  # если Qwen на том же хосте
#   api_url: "http://192.168.1.100:8000"          # если на другом сервере

docker build -t mlabled-qwen-adapter \
  -f model_template/examples/qwen_vl/Dockerfile \
  model_template/

docker run -d --name mlabled-qwen-adapter \
  --network mlabled_default \
  --add-host host.docker.internal:host-gateway \
  -p 8003:8000 \
  mlabled-qwen-adapter
```

### Шаг 3: Регистрация
```
Models → + Register Model
  Name: Qwen3-VL
  URL:  http://mlabled-qwen-adapter:8000
```

### Использование в разметке
- Выберите модель → укажите классы через запятую в промпте: `person, car, bicycle`
- Или опишите объекты: `red defects on metal surface`
- Работает в режимах Manual и Semi-auto

---

## 3. SAM3 (Interactive Segmentation)

### Характеристики
- **Тип**: open-class (сегментирует любые объекты по клику)
- **Задачи**: segmentation
- **VRAM**: ~2GB (sam2-tiny), ~7GB (sam2-large)
- **GPU**: RTX 2060+ (6GB) для tiny

### Шаг 1: Поднять SAM сервер

SAM сервер нужно реализовать или использовать готовый. Ожидаемый API:

```
GET  /health                              → {"status": "ready"}
POST /embed    {"image_base64": "..."}    → {"embedding_id": "uuid"}
POST /predict  {"embedding_id": "...",
                "points": [{"x":10,"y":20,"label":1}],
                "boxes": []}              → {"mask_rle": "...", "score": 0.95}
```

Пример сервера на основе SAM2 от Meta:

```python
# sam_server.py
from fastapi import FastAPI
from sam2.build_sam import build_sam2
from sam2.sam2_image_predictor import SAM2ImagePredictor
import numpy as np, base64, io, uuid
from PIL import Image

app = FastAPI()
predictor = SAM2ImagePredictor(build_sam2("sam2_hiera_large", "sam2_hiera_large.pt"))
embeddings = {}

@app.get("/health")
def health():
    return {"status": "ready"}

@app.post("/embed")
def embed(body: dict):
    img = Image.open(io.BytesIO(base64.b64decode(body["image_base64"])))
    predictor.set_image(np.array(img))
    eid = str(uuid.uuid4())
    embeddings[eid] = predictor.get_image_embedding()
    return {"embedding_id": eid}

@app.post("/predict")
def predict(body: dict):
    # ... decode points, call predictor.predict(), encode mask to RLE
    return {"mask_rle": "...", "score": 0.95}
```

Запуск:
```bash
pip install sam2 fastapi uvicorn
uvicorn sam_server:app --host 0.0.0.0 --port 8502
```

### Шаг 2: Поднять адаптер

```bash
# config: model_template/examples/sam3/config.yaml
#   api_url: "http://host.docker.internal:8502"

docker build -t mlabled-sam-adapter \
  -f model_template/examples/sam3/Dockerfile \
  model_template/

docker run -d --name mlabled-sam-adapter \
  --network mlabled_default \
  --add-host host.docker.internal:host-gateway \
  -p 8002:8000 \
  mlabled-sam-adapter
```

### Шаг 3: Регистрация
```
Models → + Register Model
  Name: SAM3
  URL:  http://mlabled-sam-adapter:8000
```

### Использование
- Выберите SAM в тулбаре (S) или в модели
- Клик по объекту → маска в реальном времени (WebSocket)
- Enter — принять маску, Escape — сбросить

---

## 4. DINOv3 Few-Shot (Similarity Search)

### Характеристики
- **Тип**: open-class (учится на ваших примерах)
- **Задачи**: detection (через sliding window + similarity)
- **VRAM**: ~2GB
- **GPU**: любая NVIDIA (или CPU, медленнее)

### Шаг 1: Поднять DINOv3 feature extraction сервер

Нужен сервер который извлекает эмбеддинги из crop-ов изображения. Ожидаемый API:

```
GET  /health → {"status": "ready"}
POST /extract {
  "image_base64": "...",
  "crops": [{"x": 0, "y": 0, "w": 128, "h": 128}, ...]
} → {
  "embeddings": [[0.1, 0.2, ...], ...]   // один вектор на каждый crop
}
```

Пример сервера:

```python
# dino_server.py
import torch
from fastapi import FastAPI
from PIL import Image
import base64, io, numpy as np

app = FastAPI()

# Загрузка DINOv3 из safetensors
from transformers import AutoModel, AutoImageProcessor
processor = AutoImageProcessor.from_pretrained("facebook/dinov2-base")
model = AutoModel.from_pretrained("facebook/dinov2-base")
# Или загрузка из локального safetensors:
# model = AutoModel.from_pretrained("/path/to/dinov3/", local_files_only=True)
model.eval().cuda()

@app.get("/health")
def health():
    return {"status": "ready"}

@app.post("/extract")
def extract(body: dict):
    img = Image.open(io.BytesIO(base64.b64decode(body["image_base64"])))
    crops = body.get("crops", [])
    
    embeddings = []
    for crop in crops:
        x, y, w, h = crop["x"], crop["y"], crop["w"], crop["h"]
        patch = img.crop((x, y, x + w, y + h))
        inputs = processor(images=patch, return_tensors="pt").to("cuda")
        with torch.no_grad():
            emb = model(**inputs).last_hidden_state[:, 0]  # CLS token
        embeddings.append(emb[0].cpu().numpy().tolist())
    
    return {"embeddings": embeddings}
```

Запуск:
```bash
pip install torch transformers fastapi uvicorn safetensors
# Если используете свой safetensors:
# Положите файл модели в /path/to/dinov3/
uvicorn dino_server:app --host 0.0.0.0 --port 8503
```

### Шаг 2: Поднять адаптер

```bash
# config: model_template/examples/dinov3_fewshot/config.yaml
#   api_url: "http://host.docker.internal:8503"
#   patch_sizes: [64, 128, 256]
#   stride_ratio: 0.5

docker build -t mlabled-dino-adapter \
  -f model_template/examples/dinov3_fewshot/Dockerfile \
  model_template/

docker run -d --name mlabled-dino-adapter \
  --network mlabled_default \
  --add-host host.docker.internal:host-gateway \
  -p 8004:8000 \
  mlabled-dino-adapter
```

### Шаг 3: Регистрация
```
Models → + Register Model
  Name: DINOv3-FewShot
  URL:  http://mlabled-dino-adapter:8000
```

### Использование (Few-Shot)
1. Разметьте 3-5 изображений с примерами дефектов (bbox)
2. Выберите модель DINOv3-FewShot
3. Переключите в Semi-auto режим
4. При переходе на пустые изображения модель автоматически найдёт похожие дефекты
5. Параметры:
   - `threshold`: 0.7 (чем выше — тем строже, меньше FP)
   - `nms_iou`: 0.5 (порог подавления дубликатов)

API для ручного вызова few-shot:
```bash
curl -X POST http://localhost:3000/api/inference/fewshot \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model_id": 4,
    "image_id": 100,
    "reference_image_ids": [1, 2, 3],
    "params": {"threshold": 0.7}
  }'
```

---

## Сводная таблица

| Модель | Порт (модель) | Порт (адаптер) | VRAM | Тип классов | Задачи |
|--------|--------------|----------------|------|-------------|--------|
| YOLO | — (встроен) | 8001 | 0.5-2 GB | fixed (80) | detection |
| Qwen3-VL | 8000* | 8003 | 10-15 GB | open | detection, classification |
| SAM3 | 8502 | 8002 | 2-7 GB | open | segmentation |
| DINOv3 | 8503 | 8004 | 2 GB | open (few-shot) | detection |

*Qwen использует порт 8000 из своего docker-compose. Если конфликт — измените `HOST_PORT`.

## Общие заметки

- **Сеть**: адаптеры подключаются к `mlabled_default` сети. Реальные модели доступны через `host.docker.internal` (из Docker) или напрямую по IP.
- **Удалённые серверы**: адаптер можно поднять на одном сервере, а модель на другом. Укажите IP в `config.yaml`.
- **GPU sharing**: YOLO и DINOv3 могут работать на одной GPU. Qwen и SAM лучше разносить.
- **Без GPU**: YOLO и DINOv3 работают на CPU (медленнее). Qwen и SAM требуют GPU.
