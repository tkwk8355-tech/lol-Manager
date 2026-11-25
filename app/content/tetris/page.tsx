"use client";

import TetrisGame from "../../components/minigame/TetrisGame";
import DesktopOnly from "../../components/minigame/DesktopOnly";

export default function TetrisGamePage() {
  return (
    <DesktopOnly title="테트리스">
      <TetrisGame />
    </DesktopOnly>
  );
}
