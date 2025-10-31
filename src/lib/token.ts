import { customAlphabet } from "nanoid";

// ✅ 영문+숫자 32자리 토큰 생성
const alphabet =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const nanoid = customAlphabet(alphabet, 32);

export function generateToken(): string {
  return nanoid();
}
