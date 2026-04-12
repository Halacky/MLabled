import httpx

from app.models.model_server import ModelServer


class ModelProxy:
    """Client for communicating with model servers via the unified API."""

    def __init__(self, timeout: float = 120.0):
        self.timeout = timeout

    async def health(self, server: ModelServer) -> dict:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{server.url}/health")
            resp.raise_for_status()
            return resp.json()

    async def info(self, server: ModelServer) -> dict:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{server.url}/info")
            resp.raise_for_status()
            return resp.json()

    async def predict(self, server: ModelServer, image_b64: str, params: dict) -> dict:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(
                f"{server.url}/predict",
                json={"image": image_b64, "params": params},
            )
            resp.raise_for_status()
            return resp.json()

    async def embed(self, server: ModelServer, image_b64: str) -> dict:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(
                f"{server.url}/embed",
                json={"image": image_b64},
            )
            resp.raise_for_status()
            return resp.json()

    async def predict_interactive(
        self, server: ModelServer, embedding_id: str, points: list, boxes: list
    ) -> dict:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{server.url}/predict_interactive",
                json={
                    "embedding_id": embedding_id,
                    "points": points,
                    "boxes": boxes,
                },
            )
            resp.raise_for_status()
            return resp.json()


model_proxy = ModelProxy()
