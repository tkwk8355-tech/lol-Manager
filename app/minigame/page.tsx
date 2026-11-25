import { redirect } from "next/navigation";

// 예전 주소(/minigame)로 들어오면 콘텐츠 > 폭탄돌리기로 보낸다.
export default function MinigamePage() {
  redirect("/content/bomb");
}
