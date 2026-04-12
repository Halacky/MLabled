import { useState, useEffect } from "react";
import { Line, Circle } from "react-konva";
import Konva from "konva";
import { useAnnotationStore, generateId } from "../../store/annotation";

interface Props {
  getImagePos: (e: Konva.KonvaEventObject<MouseEvent>) => { x: number; y: number } | null;
  stageRef: React.RefObject<Konva.Stage | null>;
}

export function PolygonTool({ getImagePos, stageRef }: Props) {
  const { activeLabel, addAnnotation } = useAnnotationStore();
  const [points, setPoints] = useState<number[][]>([]);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const handleClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (e.evt.button !== 0) return;
      const pos = getImagePos(e);
      if (!pos) return;

      // Close polygon if clicking near first point
      if (points.length >= 3) {
        const dx = pos.x - points[0][0];
        const dy = pos.y - points[0][1];
        if (Math.sqrt(dx * dx + dy * dy) < 10) {
          addAnnotation({
            id: generateId(),
            type: "polygon",
            label: activeLabel || "unlabeled",
            data: { points: points.map((p) => [Math.round(p[0]), Math.round(p[1])]) },
            source: "manual",
            visible: true,
            selected: false,
          });
          setPoints([]);
          return;
        }
      }

      setPoints([...points, [pos.x, pos.y]]);
    };

    const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
      const pos = getImagePos(e);
      if (pos) setMousePos(pos);
    };

    const handleDblClick = () => {
      if (points.length >= 3) {
        addAnnotation({
          id: generateId(),
          type: "polygon",
          label: activeLabel || "unlabeled",
          data: { points: points.map((p) => [Math.round(p[0]), Math.round(p[1])]) },
          source: "manual",
          visible: true,
          selected: false,
        });
        setPoints([]);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPoints([]);
      }
    };

    stage.on("click", handleClick);
    stage.on("mousemove", handleMouseMove);
    stage.on("dblclick", handleDblClick);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      stage.off("click", handleClick);
      stage.off("mousemove", handleMouseMove);
      stage.off("dblclick", handleDblClick);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [points, activeLabel, addAnnotation, getImagePos, stageRef]);

  // Cleanup on tool switch
  useEffect(() => {
    return () => setPoints([]);
  }, []);

  if (points.length === 0 && !mousePos) return null;

  const flatPoints = points.flat();
  const allPoints = mousePos ? [...flatPoints, mousePos.x, mousePos.y] : flatPoints;

  return (
    <>
      {/* Polygon outline */}
      <Line points={allPoints} stroke="#6366f1" strokeWidth={2} dash={[4, 4]} closed={false} />

      {/* Vertices */}
      {points.map((pt, i) => (
        <Circle
          key={i}
          x={pt[0]}
          y={pt[1]}
          radius={i === 0 && points.length >= 3 ? 7 : 4}
          fill={i === 0 ? "#22c55e" : "#6366f1"}
          stroke="#fff"
          strokeWidth={1}
        />
      ))}
    </>
  );
}
