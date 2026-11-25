"use client";

import BombGame from "../../components/minigame/BombGame";
import DesktopOnly from "../../components/minigame/DesktopOnly";

export default function BombGamePage() {
  return (
    <DesktopOnly title="폭탄돌리기">
      <BombGame />
    </DesktopOnly>
  );
}
