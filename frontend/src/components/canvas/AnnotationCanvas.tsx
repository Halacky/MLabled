import { useRef, useEffect, useState, useCallback } from "react";
import { Stage, Layer, Image as KonvaImage } from "react-konva";
import Konva from "konva";
import { useAnnotationStore } from "../../store/annotation";
import { BBoxTool } from "./BBoxTool";
import { PolygonTool } from "./PolygonTool";
import { PointTool } from "./PointTool";
import { BrushTool } from "./BrushTool";
import { SAMTool } from "./SAMTool";
import { AnnotationsLayer } from "./AnnotationsLayer";

interface SAMState {
  points: { x: number; y: number; label: number }[];
  connected: boolean;
  loading: boolean;
  onLeftClick: (x: number, y: number) => void;
  onRightClick: (x: number, y: number) => void;
}

interface Props {
  imageUrl: string | null;
  imageWidth: number;
  imageHeight: number;
  sam?: SAMState;
}

export default function AnnotationCanvas({ imageUrl, imageWidth, imageHeight, sam }: Props) {
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  const { scale, setScale, offset, setOffset, activeTool, selectAnnotation } =
    useAnnotationStore();

  // Load image
  useEffect(() => {
    if (!imageUrl) {
      setImage(null);
      return;
    }
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.src = imageUrl;
    img.onload = () => setImage(img);
  }, [imageUrl]);

  // Fit container
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Fit image on load
  useEffect(() => {
    if (!image || !imageWidth || !imageHeight) return;
    const scaleX = containerSize.width / imageWidth;
    const scaleY = containerSize.height / imageHeight;
    const fitScale = Math.min(scaleX, scaleY, 1) * 0.95;
    setScale(fitScale);
    setOffset({
      x: (containerSize.width - imageWidth * fitScale) / 2,
      y: (containerSize.height - imageHeight * fitScale) / 2,
    });
  }, [image, imageWidth, imageHeight, containerSize]);

  // Zoom with wheel — clamp and round to prevent jitter
  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;

      const oldScale = scale;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const direction = e.evt.deltaY > 0 ? -1 : 1;
      const factor = 1.08;
      const raw = direction > 0 ? oldScale * factor : oldScale / factor;
      const newScale = Math.max(0.05, Math.min(50, raw));

      const mousePointTo = {
        x: (pointer.x - offset.x) / oldScale,
        y: (pointer.y - offset.y) / oldScale,
      };

      setScale(newScale);
      setOffset({
        x: Math.round((pointer.x - mousePointTo.x * newScale) * 100) / 100,
        y: Math.round((pointer.y - mousePointTo.y * newScale) * 100) / 100,
      });
    },
    [scale, offset, setScale, setOffset]
  );

  // Get mouse position in image coordinates
  const getImagePos = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>): { x: number; y: number } | null => {
      const stage = stageRef.current;
      if (!stage) return null;
      const pointer = stage.getPointerPosition();
      if (!pointer) return null;
      return {
        x: (pointer.x - offset.x) / scale,
        y: (pointer.y - offset.y) / scale,
      };
    },
    [scale, offset]
  );

  // Click on empty space deselects
  const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.target === e.target.getStage() || e.target.getClassName() === "Image") {
      if (activeTool === "select") {
        selectAnnotation(null);
      }
    }
  };

  // ── Pan: middle mouse drag OR space+left drag ──
  const [isPanning, setIsPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const panStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const isTyping = () => { const tag = (document.activeElement?.tagName || "").toLowerCase(); return tag === "input" || tag === "textarea" || tag === "select"; };
    const onKeyDown = (e: KeyboardEvent) => { if (e.code === "Space" && !e.repeat && !isTyping()) { setSpaceHeld(true); e.preventDefault(); } };
    const onKeyUp = (e: KeyboardEvent) => { if (e.code === "Space") setSpaceHeld(false); };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
  }, []);

  const handleMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    const isMiddle = e.evt.button === 1;
    const isSpaceLeft = spaceHeld && e.evt.button === 0;
    if (isMiddle || isSpaceLeft) {
      e.evt.preventDefault();
      setIsPanning(true);
      panStart.current = { x: e.evt.clientX, y: e.evt.clientY, ox: offset.x, oy: offset.y };
    }
  }, [spaceHeld, offset]);

  const handleMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!isPanning || !panStart.current) return;
    const dx = e.evt.clientX - panStart.current.x;
    const dy = e.evt.clientY - panStart.current.y;
    setOffset({ x: panStart.current.ox + dx, y: panStart.current.oy + dy });
  }, [isPanning, setOffset]);

  const handleMouseUp = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
      panStart.current = null;
    }
  }, [isPanning]);

  const cursorStyle = isPanning || spaceHeld
    ? "grab"
    : activeTool === "select"
    ? "default"
    : "crosshair";

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        overflow: "hidden",
        background: "#1a1d27",
        cursor: cursorStyle,
      }}
    >
      <Stage
        ref={stageRef}
        width={containerSize.width}
        height={containerSize.height}
        onWheel={handleWheel}
        onClick={handleStageClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {/* Image layer */}
        <Layer x={offset.x} y={offset.y} scaleX={scale} scaleY={scale}>
          {image && <KonvaImage image={image} width={imageWidth} height={imageHeight} />}
        </Layer>

        {/* Annotations layer */}
        <Layer x={offset.x} y={offset.y} scaleX={scale} scaleY={scale}>
          <AnnotationsLayer />
        </Layer>

        {/* Drawing layer — active tools */}
        <Layer x={offset.x} y={offset.y} scaleX={scale} scaleY={scale}>
          {activeTool === "bbox" && <BBoxTool getImagePos={getImagePos} stageRef={stageRef} />}
          {activeTool === "polygon" && <PolygonTool getImagePos={getImagePos} stageRef={stageRef} />}
          {activeTool === "point" && <PointTool getImagePos={getImagePos} stageRef={stageRef} />}
          {activeTool === "brush" && <BrushTool getImagePos={getImagePos} stageRef={stageRef} />}
          {activeTool === "sam" && sam && (
            <SAMTool
              getImagePos={getImagePos}
              stageRef={stageRef}
              points={sam.points}
              connected={sam.connected}
              loading={sam.loading}
              onLeftClick={sam.onLeftClick}
              onRightClick={sam.onRightClick}
            />
          )}
        </Layer>
      </Stage>
    </div>
  );
}
