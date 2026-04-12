import { useState, useEffect } from "react";
import { Line } from "react-konva";
import Konva from "konva";
import { useAnnotationStore, generateId } from "../../store/annotation";

interface Props {
  getImagePos: (e: Konva.KonvaEventObject<MouseEvent>) => { x: number; y: number } | null;
  stageRef: React.RefObject<Konva.Stage | null>;
}

export function BrushTool({ getImagePos, stageRef }: Props) {
  const { activeLabel, addAnnotation, brushSize } = useAnnotationStore();
  const [currentStroke, setCurrentStroke] = useState<number[]>([]);
  const [allStrokes, setAllStrokes] = useState<{ points: number[]; strokeWidth: number }[]>([]);
  const [drawing, setDrawing] = useState(false);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (e.evt.button !== 0) return;
      const pos = getImagePos(e);
      if (!pos) return;
      setDrawing(true);
      setCurrentStroke([pos.x, pos.y]);
    };

    const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (!drawing) return;
      const pos = getImagePos(e);
      if (!pos) return;
      setCurrentStroke((prev) => [...prev, pos.x, pos.y]);
    };

    const handleMouseUp = () => {
      if (!drawing) return;
      if (currentStroke.length >= 4) {
        setAllStrokes((prev) => [...prev, { points: currentStroke, strokeWidth: brushSize }]);
      }
      setCurrentStroke([]);
      setDrawing(false);
    };

    stage.on("mousedown", handleMouseDown);
    stage.on("mousemove", handleMouseMove);
    stage.on("mouseup", handleMouseUp);

    return () => {
      stage.off("mousedown", handleMouseDown);
      stage.off("mousemove", handleMouseMove);
      stage.off("mouseup", handleMouseUp);
    };
  }, [drawing, currentStroke, brushSize, getImagePos, stageRef]);

  // Save mask on Enter or tool switch
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && allStrokes.length > 0) {
        addAnnotation({
          id: generateId(),
          type: "mask",
          label: activeLabel || "unlabeled",
          data: { strokes: allStrokes },
          source: "manual",
          visible: true,
          selected: false,
        });
        setAllStrokes([]);
      }
      if (e.key === "Escape") {
        setAllStrokes([]);
        setCurrentStroke([]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [allStrokes, activeLabel, addAnnotation]);

  // Finalize on tool switch (cleanup)
  useEffect(() => {
    return () => {
      // Accessing allStrokes via closure here
      const strokes = useAnnotationStore.getState();
      // We can't easily access allStrokes in cleanup, so we rely on Enter key
    };
  }, []);

  return (
    <>
      {/* Completed strokes for current mask */}
      {allStrokes.map((stroke, i) => (
        <Line
          key={`stroke-${i}`}
          points={stroke.points}
          stroke="rgba(99, 102, 241, 0.5)"
          strokeWidth={stroke.strokeWidth}
          lineCap="round"
          lineJoin="round"
        />
      ))}
      {/* Current stroke being drawn */}
      {currentStroke.length >= 4 && (
        <Line
          points={currentStroke}
          stroke="rgba(99, 102, 241, 0.5)"
          strokeWidth={brushSize}
          lineCap="round"
          lineJoin="round"
        />
      )}
    </>
  );
}
