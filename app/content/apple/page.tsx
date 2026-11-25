"use client";

import AppleGame from "../../components/minigame/AppleGame";
import DesktopOnly from "../../components/minigame/DesktopOnly";

export default function AppleGamePage() {
  return (
    <DesktopOnly title="사과게임">
      <AppleGame />
    </DesktopOnly>
  );
}
