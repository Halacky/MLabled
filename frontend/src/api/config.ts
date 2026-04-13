import api from "./client";

let _config: { minio_console_url: string; s3_bucket: string } | null = null;

export async function getAppConfig() {
  if (!_config) {
    const { data } = await api.get("/config");
    _config = data;
  }
  return _config!;
}

export function getMinioConsoleUrl(): string {
  return _config?.minio_console_url ?? `http://${window.location.hostname}:9003`;
}
