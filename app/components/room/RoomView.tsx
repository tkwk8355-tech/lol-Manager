"use client";

// 방 보기 전용 캔버스 (프로필 팝업에서 사용). 꾸미기는 RoomEditor.

import { useEffect, useRef } from "react";
import type { RoomData } from "@/lib/roomShared";
import { ROOM_H, ROOM_W, drawRoom } from "./roomRender";

export default function RoomView({ room, className }: { room: RoomData; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const paint = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const scale = Math.max(0.5, (canvas.clientWidth || ROOM_W) / ROOM_W) * dpr;
      canvas.width = Math.round(ROOM_W * scale);
      canvas.height = Math.round(ROOM_H * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      drawRoom(ctx, room);
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [room]);
  return <canvas ref={ref} className={className} style={{ width: "100%", height: "auto", aspectRatio: `${ROOM_W} / ${ROOM_H}`, display: "block" }} />;
}
