"use client";

import AimGame from "../../components/minigame/AimGame";
import DesktopOnly from "../../components/minigame/DesktopOnly";

export default function AimGamePage() {
  return (
    <DesktopOnly title="에임 연습">
      <AimGame />
    </DesktopOnly>
  );
}
