import { redirect } from "next/navigation";

// 경매내전은 이벤트 페이지의 "경매내전" 탭으로 통합되었다. 예전 주소로 들어오면 이동시킨다.
export default function AuctionPage() {
  redirect("/event");
}
