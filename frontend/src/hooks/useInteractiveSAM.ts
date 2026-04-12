import { useRef, useState, useCallback } from "react";
import { useAnnotationStore, generateId } from "../store/annotation";

interface SAMPoint {
  x: number;
  y: number;
  label: number; // 1 = foreground, 0 = background
}

export function useInteractiveSAM() {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [maskRle, setMaskRle] = useState<string | null>(null);
  const [points, setPoints] = useState<SAMPoint[]>([]);

  const connect = useCallback((imageId: number, modelId: number) => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    setLoading(true);
    setMaskRle(null);
    setPoints([]);

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(
      `${protocol}//${window.location.host}/api/inference/ws/interactive/${imageId}?model_id=${modelId}`
    );

    ws.onopen = () => {
      // Wait for "ready" message with embedding
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "ready") {
        setConnected(true);
        setLoading(false);
      } else if (data.type === "mask") {
        setMaskRle(data.mask_rle);
        setLoading(false);
      }
    };

    ws.onerror = () => {
      setConnected(false);
      setLoading(false);
    };

    ws.onclose = () => {
      setConnected(false);
    };

    wsRef.current = ws;
  }, []);

  const sendClick = useCallback(
    (x: number, y: number, isPositive: boolean) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

      const newPoint: SAMPoint = { x: Math.round(x), y: Math.round(y), label: isPositive ? 1 : 0 };
      const newPoints = [...points, newPoint];
      setPoints(newPoints);
      setLoading(true);

      wsRef.current.send(
        JSON.stringify({
          points: newPoints,
          boxes: [],
        })
      );
    },
    [points]
  );

  const acceptMask = useCallback(() => {
    if (!maskRle) return;

    const store = useAnnotationStore.getState();
    store.pushHistory();
    store.addAnnotation({
      id: generateId(),
      type: "mask",
      label: store.activeLabel || "unlabeled",
      data: { rle: maskRle },
      source: "model",
      modelName: "SAM",
      confidence: undefined,
      visible: true,
      selected: false,
    });

    // Reset for next mask
    setMaskRle(null);
    setPoints([]);
  }, [maskRle]);

  const reset = useCallback(() => {
    setMaskRle(null);
    setPoints([]);
  }, []);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
    setMaskRle(null);
    setPoints([]);
  }, []);

  return {
    connect,
    disconnect,
    sendClick,
    acceptMask,
    reset,
    connected,
    loading,
    maskRle,
    points,
  };
}
