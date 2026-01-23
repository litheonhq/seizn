'use client';

import { useEffect } from 'react';

/**
 * URL에서 민감한 토큰을 제거하는 컴포넌트
 * WP-P0-01: review_token 누출 방지
 *
 * 대시보드 진입 후 URL에서 토큰을 제거하여:
 * - 브라우저 히스토리에 토큰이 남지 않도록 함
 * - 화면 공유/스크린샷 시 노출 방지
 * - Referer 헤더를 통한 누출 방지 (보조)
 */
export function TokenCleanup() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const url = new URL(window.location.href);
    const sensitiveParams = ['review_token', 'token', 'api_key', 'secret'];
    let hasModified = false;

    for (const param of sensitiveParams) {
      if (url.searchParams.has(param)) {
        url.searchParams.delete(param);
        hasModified = true;
      }
    }

    if (hasModified) {
      // replaceState로 히스토리를 수정하여 토큰이 포함된 URL이 기록되지 않도록 함
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    }
  }, []);

  return null;
}

export default TokenCleanup;
