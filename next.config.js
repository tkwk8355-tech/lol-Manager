// =============================================================
// Next.js 설정 파일.
// =============================================================

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 개발 중 잠재적 문제를 잡아주는 엄격 모드.
  reactStrictMode: true,
  // instrumentation.ts (서버 시작 시 스케줄러 등록) 사용. Next 14에서는 실험 옵션으로 켜야 한다.
  experimental: {
    instrumentationHook: true,
  },
  images: {
    // next/image로 외부 이미지를 쓸 경우 허용할 도메인 목록.
    // 챔피언/프로필 아이콘은 Riot의 Data Dragon CDN에서 가져온다.
    // (현재는 일반 <img> 태그를 쓰지만, 도메인을 미리 등록해 둔다.)
    remotePatterns: [
      { protocol: "https", hostname: "ddragon.leagueoflegends.com" },
    ],
  },
};

module.exports = nextConfig;
