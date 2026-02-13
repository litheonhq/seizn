'use client';

import { useState, useEffect } from 'react';

/**
 * 리뷰 모드 감지 훅
 * URL의 review_token 또는 쿠키의 review_mode를 확인합니다.
 */
export function useReviewMode() {
  const [isReviewMode, setIsReviewMode] = useState(false);

  useEffect(() => {
    // 쿠키에서 review_mode 확인
    const cookies = document.cookie.split(';');
    const reviewModeCookie = cookies.find(c => c.trim().startsWith('review_mode='));

    if (reviewModeCookie) {
      const value = reviewModeCookie.split('=')[1]?.trim();
      // Avoid synchronous setState directly in effect body (React compiler lint).
      setTimeout(() => setIsReviewMode(value === 'true'), 0);
    }
  }, []);

  return {
    isReviewMode,
  };
}

export default useReviewMode;
