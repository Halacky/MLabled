import { useEffect } from "react";
import { Circle, Group, Text } from "react-konva";
import Konva from "konva";
import { useAnnotationStore } from "../../store/annotation";

interface SAMPoint {
  x: number;
  y: number;
  label: number;
}

interface Props {
  getImagePos: (e: Konva.KonvaEventObject<MouseEvent>) => { x: number; y: number } | null;
  stageRef: React.RefObject<Konva.Stage | null>;
  points: SAMPoint[];
  connected: boolean;
  loading: boolean;
  onLeftClick: (x: number, y: number) => void;
  onRightClick: (x: number, y: number) => void;
}

export function SAMTool({
  getImagePos,
  stageRef,
  points,
  connected,
  loading,
  onLeftClick,
  onRightClick,
}: Props) {
  const scale = useAnnotationStore((s) => s.scale);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const handleClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (!connected) return;
      const pos = getImagePos(e);
      if (!pos) return;

      if (e.evt.button === 0) {
        onLeftClick(pos.x, pos.y);
      }
    };

    const handleContextMenu = (e: Konva.KonvaEventObject<PointerEvent>) => {
      e.evt.preventDefault();
      if (!connected) return;
      const pos = getImagePos(e as any);
      if (!pos) return;
      onRightClick(pos.x, pos.y);
    };

    stage.on("click", handleClick);
    stage.on("contextmenu", handleContextMenu);

    return () => {
      stage.off("click", handleClick);
      stage.off("contextmenu", handleContextMenu);
    };
  }, [connected, getImagePos, stageRef, onLeftClick, onRightClick]);

  const r = 6 / scale;
  const fontSize = 11 / scale;

  return (
    <Group>
      {/* Prompt points */}
      {points.map((pt, i) => (
        <Group key={i}>
          <Circle
            x={pt.x}
            y={pt.y}
            radius={r}
            fill={pt.label === 1 ? "#22c55e" : "#ef4444"}
            stroke="#fff"
            strokeWidth={2 / scale}
          />
          <Text
            x={pt.x + r + 2 / scale}
            y={pt.y - r}
            text={pt.label === 1 ? "+" : "−"}
            fontSize={fontSize}
            fill={pt.label === 1 ? "#22c55e" : "#ef4444"}
            listening={false}
          />
        </Group>
      ))}

      {/* Status indicator */}
      {!connected && (
        <Text
          x={10 / scale}
          y={10 / scale}
          text="SAM: connecting..."
          fontSize={14 / scale}
          fill="#f59e0b"
          listening={false}
        />
      )}
      {connected && loading && (
        <Text
          x={10 / scale}
          y={10 / scale}
          text="SAM: computing..."
          fontSize={14 / scale}
          fill="#6366f1"
          listening={false}
        />
      )}
    </Group>
  );
}
