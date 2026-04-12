import { useEffect } from "react";
import Konva from "konva";
import { useAnnotationStore, generateId } from "../../store/annotation";

interface Props {
  getImagePos: (e: Konva.KonvaEventObject<MouseEvent>) => { x: number; y: number } | null;
  stageRef: React.RefObject<Konva.Stage | null>;
}

export function PointTool({ getImagePos, stageRef }: Props) {
  const { activeLabel, addAnnotation, annotations } = useAnnotationStore();

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const handleClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (e.evt.button !== 0) return;
      const pos = getImagePos(e);
      if (!pos) return;

      // Find existing selected keypoints annotation or create new
      const selected = annotations.find((a) => a.selected && a.type === "keypoints");

      if (selected) {
        // Add point to existing group
        const data = selected.data as { points: { x: number; y: number; name: string }[] };
        useAnnotationStore.getState().updateAnnotation(selected.id, {
          data: {
            points: [
              ...data.points,
              { x: Math.round(pos.x), y: Math.round(pos.y), name: `pt${data.points.length + 1}` },
            ],
          },
        });
      } else {
        addAnnotation({
          id: generateId(),
          type: "keypoints",
          label: activeLabel || "unlabeled",
          data: {
            points: [{ x: Math.round(pos.x), y: Math.round(pos.y), name: "pt1" }],
          },
          source: "manual",
          visible: true,
          selected: true,
        });
      }
    };

    stage.on("click", handleClick);
    return () => {
      stage.off("click", handleClick);
    };
  }, [activeLabel, addAnnotation, annotations, getImagePos, stageRef]);

  return null;
}
