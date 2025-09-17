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
      }}
    >
      <h2 style={{ color: "#111111", fontSize: "20px", marginBottom: "12px" }}>
        이메일 인증 안내
      </h2>

      <p style={{ marginBottom: "16px" }}>
        아래 버튼을 클릭하여 이메일 인증을 완료해주세요.
      </p>

      <a
        href={verifyUrl}
        style={{
          display: "inline-block",
          backgroundColor: "#2563eb",
          color: "#ffffff",
          padding: "10px 18px",
          borderRadius: "4px",
          textDecoration: "none",
          fontWeight: "bold",
        }}
      >
        이메일 인증하기
      </a>

      <p style={{ fontSize: "12px", color: "#666666", marginTop: "24px" }}>
        이 메일은 회원가입 요청에 따라 발송되었습니다. 본인이 요청하지 않았다면
        이 메일을 무시하셔도 됩니다.
      </p>
    </div>
  );
}