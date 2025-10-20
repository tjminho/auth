namespace NodeJS {
  interface ProcessEnv {
    NEXT_PUBLIC_APP_URL: string;
    AUTH_SECRET: string;
    NEXTAUTH_URL: string;
    DATABASE_URL: string;
    RESEND_API_KEY: string;
    FROM_EMAIL: string;
    UPSTASH_REDIS_REST_URL: string;
    UPSTASH_REDIS_REST_TOKEN: string;
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
    KAKAO_CLIENT_ID: string;
    KAKAO_CLIENT_SECRET: string;
    NAVER_CLIENT_ID: string;
    NAVER_CLIENT_SECRET: string;
    EMAIL_TOKEN_SECRET: string;
    EMAIL_TOKEN_BIND_IP?: "true" | "false";
    EMAIL_TOKEN_BIND_UA?: "true" | "false";
    EMAIL_TOKEN_TTL_MIN?: string;
    SESSION_CACHE_TTL?: string;
    WS_PORT?: string;
    NEXT_PUBLIC_WS_URL?: string;
    FCM_SERVER_KEY?: string;
  }
}
