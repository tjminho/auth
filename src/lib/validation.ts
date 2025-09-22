import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(8, "비밀번호는 최소 8자 이상이어야 합니다.")
  .max(20, "비밀번호는 최대 20자까지 가능합니다.")
  .regex(
    /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*()_\-+=\[{\]};:'",<.>/?\\|`~]).{8,20}$/,
    "비밀번호는 영문자, 숫자, 특수문자를 각각 1개 이상 포함해야 합니다."
  );

export const signupSchema = z.object({
  name: z.string().min(1, "이름을 입력하세요."),
  email: z.string().email("올바른 이메일 형식이 아닙니다."),
  password: passwordSchema,
});

export const emailSchema = z.string().email("올바른 이메일 형식이 아닙니다.");
