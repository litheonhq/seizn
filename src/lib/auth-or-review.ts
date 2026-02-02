import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * 인증된 사용자 또는 리뷰 모드 확인
 * 인증되지 않았고 리뷰 모드도 아니면 로그인 페이지로 리다이렉트
 */
export async function getAuthOrReview() {
  const session = await auth();
  const cookieStore = await cookies();
  const isReviewMode = cookieStore.get("review_mode")?.value === "true";

  // Allow access if authenticated OR in review mode
  if (!session?.user && !isReviewMode) {
    redirect("/login");
  }

  // In review mode without auth, provide a mock user for display
  const user = session?.user ?? {
    id: "review",
    name: "Review Mode",
    email: "review@seizn.com",
    image: null,
  };

  return {
    user,
    isReviewMode,
    isAuthenticated: !!session?.user,
  };
}
