import yaml
import os

from base.app import create_app
from model import QwenVLAdapter

config_path = os.getenv("MODEL_CONFIG", "config.yaml")
config = {}
if os.path.exists(config_path):
    with open(config_path) as f:
        config = yaml.safe_load(f) or {}

app = create_app(QwenVLAdapter, config=config)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
