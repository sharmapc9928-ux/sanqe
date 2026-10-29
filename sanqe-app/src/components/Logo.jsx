// Green tile with the white "F" and the yellow play wedge.
export function LogoMark({ size = 30 }) {
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="100" height="100" rx="28" fill="#12a26f" />
      <rect x="30" y="22" width="16" height="56" rx="8" fill="#ffffff" />
      <rect x="30" y="22" width="36" height="16" rx="8" fill="#ffffff" />
      <polygon points="50,44 50,66 72,55" fill="#ffd43b" />
    </svg>
  )
}

// "Sanqe" wordmark; `by` adds a small green tag after it ("for coachings", "Portal").
export function SiteLogo({ className = '', by }) {
  return (
    <div className={`site-logo ${className}`}>
      <LogoMark />
      <span className="logo-word" aria-label="Fedge Sanqe">Sanqe</span>
      {by && <span className="logo-by">{by}</span>}
    </div>
  )
}
