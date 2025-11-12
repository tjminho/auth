import { z } from "zod";

// ✅ 비밀번호 규칙: 8~20자, 영문자·숫자·특수문자 각각 1개 이상
export const passwordSchema = z
  .string()
  .min(8, "비밀번호는 최소 8자 이상이어야 합니다.")
  .max(20, "비밀번호는 최대 20자까지 가능합니다.")
  .regex(
    /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).*$/,
    "비밀번호는 영문자, 숫자, 특수문자를 각각 1개 이상 포함해야 합니다."
  );

export const emailSchema = z
  .string()
  .trim()
  .email("올바른 이메일 형식이 아닙니다.")
  .refine((val) => !val.endsWith("@placeholder.local"), {
    message: "임시 이메일 주소는 사용할 수 없습니다.",
  });

export const signupSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "이름을 입력하세요.")
      .max(50, "이름은 최대 50자까지 가능합니다."),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, "비밀번호 확인을 입력하세요."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "비밀번호가 일치하지 않습니다.",
    path: ["confirmPassword"], // ✅ confirmPassword 필드에 에러 표시
  });

export const signinSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "비밀번호를 입력하세요."),
});
