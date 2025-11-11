import * as React from "react";
import { EMAIL_TTL_MIN, RESET_TTL_MIN, BRAND_NAME } from "@/lib/constants";

type BaseProps = { children: React.ReactNode };

function EmailLayout({ children }: BaseProps) {
  const year = new Date().getFullYear();
  return (
    <div
      style={{
        fontFamily: "Arial, sans-serif",
        lineHeight: 1.6,
        color: "#333",
        maxWidth: "480px",
        margin: "0 auto",
        padding: "20px",
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
      }}
    >
      {/* 브랜드 헤더 */}
      <div style={{ textAlign: "center", marginBottom: "24px" }}>
        <h1 style={{ margin: 0, fontSize: "24px", color: "#2563eb" }}>{BRAND_NAME}</h1>
        <p style={{ fontSize: "14px", color: "#666", margin: "4px 0 0" }}>
          {BRAND_NAME} 계정 보안센터
        </p>
      </div>

      {children}

      {/* 브랜드 푸터 */}
      <div
        style={{
          borderTop: "1px solid #e5e7eb",
          marginTop: "24px",
          paddingTop: "12px",
          textAlign: "center",
          fontSize: "12px",
          color: "#999",
        }}
      >
        ⓒ {year} {BRAND_NAME}. All rights reserved.
      </div>
    </div>
  );
}

/** ✅ 이메일 인증 템플릿 */
export const VerifyEmailTemplate = ({ verifyUrl }: { verifyUrl: string }) => (
  <EmailLayout>
    <h2 style={{ color: "#111", fontSize: "20px", marginBottom: "12px" }}>이메일 인증 안내</h2>
    <p style={{ marginBottom: "16px" }}>아래 버튼을 클릭하여 이메일 인증을 완료해주세요.</p>

    <a
      href={verifyUrl}
      target="_blank"
      rel="noopener noreferrer"
      role="button"
      aria-label="이메일 인증하기"
      style={{
        display: "inline-block",
        backgroundColor: "#2563eb",
        color: "#fff",
        padding: "12px 20px",
        borderRadius: "4px",
        textDecoration: "none",
        fontWeight: "bold",
      }}
    >
      이메일 인증하기
    </a>

    <p style={{ fontSize: "14px", color: "#444", marginTop: "20px" }}>
      이 링크는 <strong>{EMAIL_TTL_MIN}분 동안만 유효</strong>합니다.
    </p>

    {/* Fallback 링크 */}
    <p style={{ fontSize: "12px", color: "#666", marginTop: "16px" }}>
      버튼이 동작하지 않는 경우 아래 링크를 복사하여 브라우저 주소창에 붙여넣으세요:
    </p>
    <p
      style={{
        fontSize: "12px",
        color: "#2563eb",
        wordBreak: "break-all",
        marginBottom: "20px",
      }}
    >
      {verifyUrl}
    </p>

    <p style={{ fontSize: "12px", color: "#666", marginTop: "24px" }}>
      이 메일은 회원가입 요청에 따라 발송되었습니다. 본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.
    </p>
  </EmailLayout>
);

/** ✅ 비밀번호 재설정 템플릿 */
export const PasswordResetTemplate = ({ resetUrl }: { resetUrl: string }) => (
  <EmailLayout>
    <h2 style={{ color: "#111", fontSize: "20px", marginBottom: "12px" }}>비밀번호 재설정 안내</h2>
    <p style={{ marginBottom: "16px" }}>아래 버튼을 클릭하여 비밀번호를 재설정하세요.</p>

    <a
      href={resetUrl}
      target="_blank"
      rel="noopener noreferrer"
      role="button"
      aria-label="비밀번호 재설정하기"
      style={{
        display: "inline-block",
        backgroundColor: "#2563eb",
        color: "#fff",
        padding: "12px 20px",
        borderRadius: "4px",
        textDecoration: "none",
        fontWeight: "bold",
      }}
    >
      비밀번호 재설정하기
    </a>

    <p style={{ fontSize: "14px", color: "#444", marginTop: "20px" }}>
      이 링크는 <strong>{RESET_TTL_MIN}분 동안만 유효</strong>합니다.
    </p>

    {/* Fallback 링크 */}
    <p style={{ fontSize: "12px", color: "#666", marginTop: "16px" }}>
      버튼이 동작하지 않는 경우 아래 링크를 복사하여 브라우저 주소창에 붙여넣으세요:
    </p>
    <p
      style={{
        fontSize: "12px",
        color: "#2563eb",
        wordBreak: "break-all",
        marginBottom: "20px",
      }}
    >
      {resetUrl}
    </p>

    <p style={{ fontSize: "12px", color: "#666", marginTop: "24px" }}>
      이 메일은 비밀번호 재설정 요청에 따라 발송되었습니다. 본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.
    </p>
  </EmailLayout>
);

/** ✅ 로그인 알림 템플릿 */
export const LoginAlertTemplate = ({
  ip,
  userAgent,
  location,
}: {
  ip: string;
  userAgent: string;
  location?: string | null;
}) => (
  <EmailLayout>
    <h2 style={{ color: "#111", fontSize: "20px", marginBottom: "12px" }}>새로운 로그인 감지</h2>
    <p style={{ marginBottom: "16px" }}>다음 환경에서 로그인되었습니다:</p>
    <ul style={{ fontSize: "14px", color: "#444", marginBottom: "16px" }}>
      <li>
        <strong>IP 주소:</strong> {ip}
      </li>
      <li>
        <strong>위치:</strong> {location ?? "알 수 없음"}
      </li>
      <li>
        <strong>기기 정보:</strong> {userAgent}
      </li>
      <li>
        <strong>시간:</strong>{" "}
        {new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
      </li>
    </ul>
    <p style={{ fontSize: "12px", color: "#666" }}>
      본인이 아니라면 즉시 비밀번호를 변경해주세요.
    </p>
  </EmailLayout>
);