import {
  FORGOT_PASSWORD_HELP,
  FORGOT_PASSWORD_THRESHOLD,
  TEMP_PASSWORD_NOTICE,
  nextFailureCount,
  shouldShowForgotPassword,
} from "../src/api/login-help";

describe("login help (Lupa Password?)", () => {
  it("counts consecutive failures and resets on success", () => {
    expect(nextFailureCount(0, false)).toBe(1);
    expect(nextFailureCount(1, false)).toBe(2);
    expect(nextFailureCount(2, false)).toBe(3);
    expect(nextFailureCount(5, true)).toBe(0);
  });

  it("only reveals the help link at the threshold, not before", () => {
    expect(shouldShowForgotPassword(FORGOT_PASSWORD_THRESHOLD - 1)).toBe(false);
    expect(shouldShowForgotPassword(FORGOT_PASSWORD_THRESHOLD)).toBe(true);
    expect(shouldShowForgotPassword(FORGOT_PASSWORD_THRESHOLD + 4)).toBe(true);
  });

  it("tells the officer to contact an Admin and warns the temporary password is single-use", () => {
    expect(FORGOT_PASSWORD_HELP.instruction).toContain("hubungi Admin");
    expect(FORGOT_PASSWORD_HELP.steps.length).toBeGreaterThanOrEqual(3);
    expect(TEMP_PASSWORD_NOTICE).toContain("sekali");
  });
});
