import { useState, type InputHTMLAttributes } from "react"

export type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className"> & {
  className?: string
}

export function passwordInputType(visible: boolean): "text" | "password" {
  return visible ? "text" : "password"
}

export function maskSecret(value: string): string {
  if (!value) return ""
  return "•".repeat(Math.min(Math.max(value.length, 8), 16))
}

function EyeIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c6.5 0 10 7 10 7a17.5 17.5 0 0 1-2.3 3.2" />
      <path d="M6.61 6.61A17.4 17.4 0 0 0 2 12s3.5 7 10 7a10.4 10.4 0 0 0 4.34-.93" />
      <path d="m2 2 20 20" />
    </svg>
  )
}

type ToggleProps = {
  visible: boolean
  disabled?: boolean
  onToggle: () => void
}

function PasswordToggle({ visible, disabled, onToggle }: ToggleProps) {
  const label = visible ? "Sembunyikan password" : "Tampilkan password"
  return (
    <button
      type="button"
      className="password-toggle"
      aria-label={label}
      aria-pressed={visible}
      title={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onToggle()
      }}
    >
      {visible ? <EyeOffIcon /> : <EyeIcon />}
    </button>
  )
}

export function PasswordInput({
  className,
  disabled,
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false)
  return (
    <span
      className={className ? `password-input ${className}` : "password-input"}
    >
      <input {...props} type={passwordInputType(visible)} disabled={disabled} />
      <PasswordToggle
        visible={visible}
        disabled={disabled}
        onToggle={() => setVisible((current) => !current)}
      />
    </span>
  )
}

export function PasswordReveal({ value }: { value: string }) {
  const [visible, setVisible] = useState(false)
  return (
    <>
      <code>{visible ? value : maskSecret(value)}</code>
      <PasswordToggle
        visible={visible}
        onToggle={() => setVisible((current) => !current)}
      />
    </>
  )
}
