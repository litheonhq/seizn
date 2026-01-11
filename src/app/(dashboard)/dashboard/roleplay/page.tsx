import Link from "next/link";
import DashboardShell from "@/components/dashboard/DashboardShell";

const painPoints = [
  {
    title: "안정성",
    detail: "자주 끊기거나 느려지는 불만이 많았습니다. 세션 유지·자동 재시도·상태 표시를 기본 제공합니다.",
  },
  {
    title: "컨텍스트 길이",
    detail: "메모리가 짧다는 피드백을 반영해 대화 맥락 + 사용자 프리퍼런스를 길게 유지하도록 설계합니다.",
  },
  {
    title: "모더레이션 밸런스",
    detail: "과도한 검열/무시되는 규칙을 개선하기 위해 톤·제약을 캐릭터별로 설정하고 투명하게 표기합니다.",
  },
  {
    title: "프라이버시",
    detail: "민감 정보는 기본적으로 저장하지 않으며, 클라우드 메모리 업로드 여부를 UI에서 명시적으로 제어합니다.",
  },
];

const quickStarts = [
  {
    title: "Spring 대화로 바로 가기",
    description: "Cursor/Perplexity 스타일 좌측 아이콘 → 펼쳐지는 챗. Roleplay 모드로 진입합니다.",
    href: "/spring/chat?mode=roleplay",
  },
  {
    title: "캐릭터/롤플레이 설정",
    description: "테마, 말투, 금지사항을 캐릭터별로 저장하고 재사용합니다. (초기 베타)",
    href: "/dashboard/roleplay#characters",
  },
];

export default function RoleplayHubPage() {
  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="glass-card p-6 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Roleplay Hub (Beta)</p>
              <h1 className="text-2xl font-semibold text-gray-900">토스급 UX 목표로 개편 중</h1>
              <p className="text-sm text-gray-600 mt-1">
                Spring 챗은 좌측 아이콘에서 펼쳐지는 형태로 접근할 수 있습니다. Roleplay Hub에서 캐릭터/모드 선택 후 바로
                대화하세요.
              </p>
            </div>
            <Link
              href="/spring/chat?mode=roleplay"
              className="theme-gradient-btn text-white rounded-xl px-4 py-2.5 text-sm font-semibold shadow-lg"
            >
              Spring 대화 시작
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {quickStarts.map((item) => (
              <Link
                key={item.title}
                href={item.href}
                className="rounded-xl border theme-border p-4 hover:shadow-md transition-all bg-white/50"
              >
                <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                <p className="text-xs text-gray-600 mt-1">{item.description}</p>
              </Link>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {painPoints.map((item) => (
            <div key={item.title} className="glass-card p-5">
              <p className="text-sm font-semibold text-gray-900">{item.title}</p>
              <p className="text-sm text-gray-600 mt-2 leading-relaxed">{item.detail}</p>
            </div>
          ))}
        </div>

        <div id="characters" className="glass-card p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">캐릭터 베타</p>
              <h2 className="text-lg font-semibold text-gray-900">Roleplay 캐릭터 스케폴드</h2>
            </div>
            <Link href="/spring/chat" className="text-sm theme-primary hover:underline">
              대화 진입 위치 확인
            </Link>
          </div>
          <ul className="space-y-2 text-sm text-gray-700 list-disc list-inside">
            <li>캐릭터 카드: 말투, 금지/허용, 선호 태그를 저장하고 불러오기.</li>
            <li>기억 유지: 최근 대화 요약 + 선호도 메모리를 자동 업데이트.</li>
            <li>세이프가드: 개인정보/금칙어 필터를 투명하게 안내하고 토글 제공.</li>
            <li>업타임: 상태 배지와 자동 재시도 안내로 “끊김” 불만을 줄입니다.</li>
          </ul>
          <p className="text-xs text-gray-500">
            참고 기반: Janitor AI / Character.AI 사용자 리뷰(끊김, 짧은 메모리, 검열 불균형, 프라이버시 우려, 자유도/커스텀
            호평).
          </p>
        </div>
      </div>
    </DashboardShell>
  );
}
