"use client";

import Script from "next/script";

// Paddle environment configuration
const paddleEnvironment = process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT === 'production' ? 'production' : 'sandbox';
const paddleClientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN || '';

export function PaddleInit() {
  const handlePaddleLoad = () => {
    if (typeof window !== 'undefined' && window.Paddle) {
      // Set environment (sandbox for testing, production for live)
      if (paddleEnvironment === 'sandbox') {
        window.Paddle.Environment.set('sandbox');
      }
      // Initialize Paddle with client token
      if (paddleClientToken) {
        window.Paddle.Initialize({
          token: paddleClientToken,
          checkout: {
            settings: {
              displayMode: 'overlay',
              theme: 'dark',
              allowLogout: true,
            },
          },
        });
      }
    }
  };

  return (
    <Script
      src="https://cdn.paddle.com/paddle/v2/paddle.js"
      strategy="lazyOnload"
      onLoad={handlePaddleLoad}
    />
  );
}
