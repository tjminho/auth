import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export async function recordAuditLog(
  userId: string,
  action: string,
  ip?: string,
  ua?: string
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        ipAddress: ip,
        userAgent: ua,
      },
    });
    logger.info("AuditLog 기록 완료", { userId, action, ip, ua });
  } catch (err) {
    logger.error("AuditLog 기록 실패", { userId, action, error: String(err) });
  }
}
