import { readFileSync } from "fs"
import { join } from "path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import {
  PasswordInput,
  PasswordReveal,
  maskSecret,
  passwordInputType,
} from "../src/components/password-controls"

const SECRET = "Rahasia#123"

function renderInput(props: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    createElement(PasswordInput, {
      value: SECRET,
      onChange: () => undefined,
      ...props,
    }),
  )
}

describe("password controls", () => {
  describe("passwordInputType", () => {
    it("maps visibility to the native input type", () => {
      expect(passwordInputType(false)).toBe("password")
      expect(passwordInputType(true)).toBe("text")
    })
  })

  describe("maskSecret", () => {
    it("never returns the secret itself", () => {
      expect(maskSecret(SECRET)).not.toContain(SECRET)
      expect(maskSecret(SECRET)).toMatch(/^•+$/)
    })

    it("uses a bounded number of bullets", () => {
      expect(maskSecret("abc")).toBe("•".repeat(8))
      expect(maskSecret(SECRET)).toBe("•".repeat(SECRET.length))
      expect(maskSecret("x".repeat(40))).toBe("•".repeat(16))
    })

    it("renders nothing for an empty secret", () => {
      expect(maskSecret("")).toBe("")
    })
  })

  describe("PasswordInput", () => {
    it("is hidden by default and exposes an accessible toggle", () => {
      const html = renderInput()
      expect(html).toContain('type="password"')
      expect(html).not.toContain('type="text"')
      expect(html).toContain('aria-label="Tampilkan password"')
      expect(html).toContain('title="Tampilkan password"')
      expect(html).toContain('aria-pressed="false"')
      expect(html).toMatch(/<button type="button" class="password-toggle"/)
    })

    it("keeps the current value and forwards existing input props", () => {
      const html = renderInput({
        autoComplete: "current-password",
        required: true,
        placeholder: "Masukkan kata sandi",
      })
      expect(html).toContain(`value="${SECRET}"`)
      expect(html).toContain('autoComplete="current-password"')
      expect(html).toContain("required")
      expect(html).toContain('placeholder="Masukkan kata sandi"')
    })

    it("disables the toggle together with the input while saving", () => {
      const html = renderInput({ disabled: true })
      expect(html.match(/disabled/g)).toHaveLength(2)
    })

    it("keeps each password field independently hidden by default", () => {
      const html = renderToStaticMarkup(
        createElement(
          "div",
          null,
          createElement(PasswordInput, {
            value: "first",
            onChange: () => undefined,
          }),
          createElement(PasswordInput, {
            value: "second",
            onChange: () => undefined,
          }),
        ),
      )
      expect(html.match(/type="password"/g)).toHaveLength(2)
      expect(html.match(/aria-label="Tampilkan password"/g)).toHaveLength(2)
      expect(html).toContain('value="first"')
      expect(html).toContain('value="second"')
    })
  })

  describe("PasswordReveal", () => {
    it("masks the temporary password by default", () => {
      const html = renderToStaticMarkup(
        createElement(PasswordReveal, { value: SECRET }),
      )
      expect(html).toContain("<code>")
      expect(html).not.toContain(SECRET)
      expect(html).toContain(maskSecret(SECRET))
      expect(html).toContain('aria-label="Tampilkan password"')
      expect(html).toContain('type="button"')
    })

    it("renders only a toggle button so the Salin action stays separate", () => {
      const html = renderToStaticMarkup(
        createElement(PasswordReveal, { value: SECRET }),
      )
      expect(html.match(/<button/g)).toHaveLength(1)
      expect(html.match(/class="password-toggle"/g)).toHaveLength(1)
    })
  })

  describe("reset password dialog wiring", () => {
    const app = readFileSync(join(__dirname, "..", "src", "App.tsx"), "utf8")

    it("uses the masked reveal instead of printing the temporary password", () => {
      expect(app).toContain(
        "<PasswordReveal value={temporary.temporaryPassword} />",
      )
      expect(app).not.toContain("<code>{temporary.temporaryPassword}</code>")
    })

    it("keeps the Salin button next to the reveal", () => {
      expect(app).toMatch(
        /<PasswordReveal value=\{temporary\.temporaryPassword\} \/><Button variant="secondary" onClick=\{\(\) => \{ void copyTemporary\(\); \}\}>/,
      )
    })

    it("renders every password entry point through PasswordInput", () => {
      expect(app).not.toContain('type="password"')
      expect(app.match(/<PasswordInput\b/g)?.length).toBe(9)
    })
  })
})
