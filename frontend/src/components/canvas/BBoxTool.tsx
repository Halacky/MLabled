import { useState, useEffect } from "react";
import { Rect } from "react-konva";
import Konva from "konva";
import { useAnnotationStore, generateId } from "../../store/annotation";


interface Props {
  getImagePos: (e: Konva.KonvaEventObject<MouseEvent>) => { x: number; y: number } | null;
  stageRef: React.RefObject<Konva.Stage | null>;
}

export function BBoxTool({ getImagePos, stageRef }: Props) {
  const { activeLabel, addAnnotation } = useAnnotationStore();
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [curPos, setCurPos] = useState<{ x: number; y: number } | null>(null);
  const [drawing, setDrawing] = useState(false);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (e.evt.button !== 0) return;

      // Only start drawing on empty space (Stage or Image), not on annotations
      const target = e.target;
      if (target !== stage && target.getClassName() !== "Image") return;

      const pos = getImagePos(e);
      if (!pos) return;
      setStartPos(pos);
      setCurPos(pos);
      setDrawing(true);
    };

    const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (!drawing) return;
      const pos = getImagePos(e);
      if (pos) setCurPos(pos);
    };

    const handleMouseUp = () => {
      if (!drawing || !startPos || !curPos) {
        setDrawing(false);
        return;
      }

      const x = Math.min(startPos.x, curPos.x);
      const y = Math.min(startPos.y, curPos.y);
      const width = Math.abs(curPos.x - startPos.x);
      const height = Math.abs(curPos.y - startPos.y);

      if (width > 5 && height > 5) {
        addAnnotation({
          id: generateId(),
          type: "bbox",
          label: activeLabel || "unlabeled",
          data: {
            x: Math.round(x),
            y: Math.round(y),
            width: Math.round(width),
            height: Math.round(height),
          },
          source: "manual",
          visible: true,
          selected: false,
        });
      }

      setDrawing(false);
      setStartPos(null);
      setCurPos(null);
    };

    stage.on("mousedown", handleMouseDown);
    stage.on("mousemove", handleMouseMove);
    stage.on("mouseup", handleMouseUp);

    return () => {
      stage.off("mousedown", handleMouseDown);
      stage.off("mousemove", handleMouseMove);
      stage.off("mouseup", handleMouseUp);
    };
  }, [drawing, startPos, curPos, activeLabel, addAnnotation, getImagePos, stageRef]);

  if (!drawing || !startPos || !curPos) return null;

  const x = Math.min(startPos.x, curPos.x);
  const y = Math.min(startPos.y, curPos.y);
  const width = Math.abs(curPos.x - startPos.x);
  const height = Math.abs(curPos.y - startPos.y);

  const scale = useAnnotationStore((s) => s.scale);
  const sw = 1 / scale;
  const dashLen = 3 / scale;

  return (
    <Rect
      x={x}
      y={y}
      width={width}
      height={height}
      stroke="#6366f1"
      strokeWidth={sw}
      dash={[dashLen, dashLen]}
      fill="rgba(99, 102, 241, 0.05)"
    />
  );
}
