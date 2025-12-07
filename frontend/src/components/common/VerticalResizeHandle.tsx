import { useCallback, useEffect, useState } from 'react';

interface VerticalResizeHandleProps {
  onResize: (newHeight: number) => void;
  minHeight?: number;
  maxHeight?: number;
}

export function VerticalResizeHandle({
  onResize,
  minHeight = 100,
  maxHeight = 800,
}: VerticalResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback(() => {
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = document.querySelector('[data-resizable-container]');
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const newHeight = rect.bottom - e.clientY;

      if (newHeight >= minHeight && newHeight <= maxHeight) {
        onResize(newHeight);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, onResize, minHeight, maxHeight]);

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`h-1 bg-border hover:bg-primary/50 cursor-ns-resize transition-colors ${
        isDragging ? 'bg-primary' : ''
      }`}
      title="Drag to resize panel"
      style={{
        userSelect: isDragging ? 'none' : 'auto',
      }}
    />
  );
}
