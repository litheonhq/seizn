'use client';

import { ReactNode } from 'react';
import { TokenCleanup } from './TokenCleanup';

interface DashboardClientWrapperProps {
  children: ReactNode;
}

/**
 * 대시보드 클라이언트 래퍼
 * URL 토큰 정리 등 대시보드 전용 클라이언트 로직을 포함
 */
export function DashboardClientWrapper({ children }: DashboardClientWrapperProps) {
  return (
    <>
      <TokenCleanup />
      {children}
    </>
  );
}

export default DashboardClientWrapper;
