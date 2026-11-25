import { redirect } from "next/navigation";

// 예전 '내 방' 주소. 이제 프로필은 헤더 팝업, 꾸미기는 콘텐츠 > 방꾸미기로 옮겼다.
// (app/room 폴더는 지워도 된다)
export default function OldRoomPage() {
  redirect("/content/room");
}
