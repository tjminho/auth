import { Resend } from "resend";
import { logger } from "@/lib/logger";

const resend = new Resend(process.env.RESEND_API_KEY);

// ✅ 비밀번호 재설정 메일
export async function sendPasswordResetEmail(email: string, token: string) {
  const resetUrl = `${process.env.BASE_URL}/auth/reset-password?token=${token}`;

  try {
    const { data, error } = await resend.emails.send({
      from: process.env.FROM_EMAIL || "no-reply@ainosm.com",
      to: email,
      subject: "비밀번호 재설정 안내",
      html: `
        <div style="font-family: sans-serif; line-height: 1.5;">
          <h2>비밀번호 재설정 요청</h2>
          <p>아래 버튼을 클릭하여 비밀번호를 재설정하세요. 이 링크는 <strong>30분간 유효</strong>합니다.</p>
          <p>
            <a href="${resetUrl}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:5px;">
              비밀번호 재설정
            </a>
          </p>
          <p>본인이 요청하지 않았다면 이 메일을 무시해주세요.</p>
        </div>
      `,
    });

    if (error) {
      logger.error("Resend 메일 발송 실패", { email, error });
      throw new Error("MAIL_SEND_FAILED");
    }

    logger.info("비밀번호 재설정 메일 발송 완료", { email });
  } catch (err: any) {
    logger.error("Resend 메일 발송 중 오류", { email, error: err?.message });
    throw new Error("MAIL_SEND_FAILED");
  }
}

// ✅ 새로운 기기/위치 로그인 알림 메일
export async function sendLoginAlertEmail(
  email: string,
  {
    ip,
    userAgent,
    location,
  }: { ip: string; userAgent: string; location?: string | null }
) {
  try {
    const { data, error } = await resend.emails.send({
      from: process.env.FROM_EMAIL || "no-reply@ainosm.com",
      to: email,
      subject: "새로운 기기에서 로그인되었습니다",
      html: `
        <div style="font-family: sans-serif; line-height: 1.5;">
          <h2>새로운 로그인 감지</h2>
          <p>다음 환경에서 로그인되었습니다:</p>
          <ul>
            <li><strong>IP 주소:</strong> ${ip}</li>
            <li><strong>위치:</strong> ${location ?? "알 수 없음"}</li>
            <li><strong>기기 정보:</strong> ${userAgent}</li>
            <li><strong>시간:</strong> ${new Date().toLocaleString("ko-KR")}</li>
          </ul>
          <p>본인이 아니라면 즉시 비밀번호를 변경해주세요.</p>
        </div>
      `,
    });

    if (error) {
      logger.error("로그인 알림 메일 발송 실패", { email, error });
      throw new Error("MAIL_SEND_FAILED");
    }

    logger.info("로그인 알림 메일 발송 완료", { email });
  } catch (err: any) {
    logger.error("로그인 알림 메일 발송 중 오류", {
      email,
      error: err?.message,
    });
    throw new Error("MAIL_SEND_FAILED");
  }
}
