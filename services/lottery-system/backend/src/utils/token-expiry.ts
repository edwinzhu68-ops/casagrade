/**
 * 登录 Token 时效策略（唯一真源）。
 *
 * 背景：历史 token 格式为 base64(userId:account).hmac，不含签发时间，HMAC 永久有效，
 * 一旦泄露即永久可用。现新格式追加签发时间：base64(userId:account:iat).hmac，并校验：
 *   - 新 token：签发后 TOKEN_TTL_MS 内有效（默认 90 天）。
 *   - 旧 token（无 iat）：宽限到 LEGACY_TOKEN_VALID_UNTIL，过后必须重新登录，
 *     避免上线即把所有在线商家强制登出（旧 token 在宽限期内随正常登录自动换成新格式）。
 */

export const TOKEN_TTL_MS = 90 * 24 * 3600 * 1000; // 新 token 有效期 90 天

// 旧（无签发时间）token 的最后宽限期：到此日期后旧 token 失效，需重新登录。
// 设为上线日 + 约 3 个月，给所有商家充足的自然换发窗口。
export const LEGACY_TOKEN_VALID_UNTIL = Date.parse('2026-09-01T00:00:00-05:00');

/** 校验 token 时效。iatStr = payload 第 3 段（base64 解码后按 ':' 切分）；旧 token 无此段。 */
export function isTokenTimeValid(iatStr: string | undefined | null): boolean {
  const now = Date.now();
  if (!iatStr) {
    // 旧格式：宽限期内有效
    return now < LEGACY_TOKEN_VALID_UNTIL;
  }
  const iat = parseInt(iatStr, 10);
  if (!iat || isNaN(iat)) return false;
  // 拒绝未来时间（>1 天容差）与超过 TTL 的 token
  if (iat > now + 86400000) return false;
  return now - iat <= TOKEN_TTL_MS;
}
