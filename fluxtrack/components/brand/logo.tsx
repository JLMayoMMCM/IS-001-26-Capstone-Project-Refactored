import { ROLE_LABEL, type Role } from "@/lib/auth/config";

// Brand assets live in fluxtrack/public/brand/ — they are the canonical MMCM
// shield + full logo + login background. Treat them as immutable institutional
// branding; do not redraw.
//
// We render the shield with a plain <img> instead of next/image because:
//   1. It's a small static asset (~140KB), no optimization gains worth the
//      strict width/height/aspect-ratio constraints Next/Image enforces.
//   2. The image is used at variable sizes (28px sidebar, 96px login). With
//      next/image we'd need to fight the width/height props at every callsite.
//   3. Plain <img> with explicit width on the element produces consistent SSR
//      and client renders → no hydration mismatch.
export const SHIELD_SRC = "/brand/mmcm-shield.webp";
export const FULL_LOGO_SRC = "/brand/mmcm-logo-full.webp";
// Horizontal lock-up (shield + Mapúa wordmark side-by-side, white background).
// Use this on light/white surfaces, or inside a white card on dark imagery.
export const FULL_LOGO_HORIZONTAL_SRC = "/brand/mmcm-logo_full_horizontal.webp";
// Partnership lock-up — MMCM × ASU horizontal logo. Used as the institutional
// header on the login form. PNG-only (no WebP twin exists for this asset).
export const MMCM_X_ASU_LOGO_SRC = "/brand/MMCM_X_ASU_LOGO_Full-horizontal.png";
export const LOGIN_BG_SRC = "/brand/login-bg.webp";
// Intrinsic dimensions of the shield asset (verified with `file`).
const SHIELD_INTRINSIC = { w: 658, h: 622 };

export function Logo({
  size = 32,
  className,
  title = "Mapua MCM — FluxTrack",
}: {
  size?: number;
  // `role` kept in signature for API compatibility but ignored — the MMCM
  // shield has its own canonical colors.
  role?: Role;
  className?: string;
  title?: string;
}) {
  const h = Math.round((size * SHIELD_INTRINSIC.h) / SHIELD_INTRINSIC.w);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={SHIELD_SRC}
      alt={title}
      width={size}
      height={h}
      className={className}
      style={{
        display: "block",
        flexShrink: 0,
        width: `${size}px`,
        height: `${h}px`,
        objectFit: "contain",
      }}
    />
  );
}

export function Wordmark({
  size = 32,
  role,
  subtitle,
  collapsed = false,
}: {
  size?: number;
  role?: Role;
  subtitle?: string;
  collapsed?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Logo size={size} role={role} />
      {!collapsed && (
        <div className="leading-tight">
          <div className="text-sm font-semibold text-slate-900">FluxTrack</div>
          {(subtitle ?? (role ? ROLE_LABEL[role] : null)) && (
            <div className="text-[10px] uppercase tracking-wide text-slate-500">
              {subtitle ?? (role ? ROLE_LABEL[role] : "")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
