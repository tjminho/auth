import * as React from "react";

export function VerifyEmailTemplate({ verifyUrl }: { verifyUrl: string }) {
  return (
    <div
      style={{
        fontFamily: "Arial, sans-serif",
        lineHeight: 1.6,
        color: "#333333",
        maxWidth: "480px",
        margin: "0 auto",
        padding: "20px",
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
      }}
    >
      {/* 브랜드 헤더 */}
      <div style={{ textAlign: "center", marginBottom: "24px" }}>
        <h1 style={{ margin: 0, fontSize: "24px", color: "#2563eb" }}>
          MZMON
        </h1>
        <p style={{ fontSize: "14px", color: "#666666", margin: "4px 0 0" }}>
          엠지몬 계정 보안센터
        </p>
      </div>

      {/* 본문 */}
      <h2 style={{ color: "#111111", fontSize: "20px", marginBottom: "12px" }}>
        이메일 인증 안내
      </h2>

      <p style={{ marginBottom: "16px" }}>
        아래 버튼을 클릭하여 이메일 인증을 완료해주세요.
      </p>

      <a
        href={verifyUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "inline-block",
          backgroundColor: "#2563eb",
          color: "#ffffff",
          padding: "12px 20px",
          borderRadius: "4px",
          textDecoration: "none",
          fontWeight: "bold",
        }}
      >
        이메일 인증하기
      </a>

      <p style={{ fontSize: "14px", color: "#444444", marginTop: "20px" }}>
        이 링크는 <strong>15분 동안만 유효</strong>합니다.
      </p>

      {/* Fallback 링크 */}
      <p style={{ fontSize: "12px", color: "#666666", marginTop: "16px" }}>
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

      {/* 안내 문구 */}
      <p style={{ fontSize: "12px", color: "#666666", marginTop: "24px" }}>
        이 메일은 회원가입 요청에 따라 발송되었습니다. 본인이 요청하지 않았다면
        이 메일을 무시하셔도 됩니다.
      </p>

      {/* 브랜드 푸터 */}
      <div
        style={{
          borderTop: "1px solid #e5e7eb",
          marginTop: "24px",
          paddingTop: "12px",
          textAlign: "center",
          fontSize: "12px",
          color: "#999999",
        }}
      >
        ⓒ {new Date().getFullYear()} MZMON. All rights reserved.
      </div>
    </div>
  );
}