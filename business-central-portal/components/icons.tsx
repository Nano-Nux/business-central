import type { SVGProps } from "react";

export type IconName =
  | "home"
  | "catalog"
  | "box"
  | "swap"
  | "cart"
  | "history"
  | "chart"
  | "repair"
  | "users"
  | "receipt"
  | "tag"
  | "settings"
  | "menu"
  | "search"
  | "plus"
  | "arrow"
  | "logout"
  | "store"
  | "printer"
  | "edit"
  | "trash"
  | "check"
  | "close"
  | "eye"
  | "eye-off"
  | "chevron"
  | "package";

const paths: Record<IconName, React.ReactNode> = {
  home: (
    <>
      <path d="m3 11 9-8 9 8" />
      <path d="M5 10v10h14V10M9 20v-6h6v6" />
    </>
  ),
  catalog: (
    <>
      <path d="M4 5h16v14H4z" />
      <path d="M8 5v14M4 10h16" />
    </>
  ),
  box: (
    <>
      <path d="m4 7 8-4 8 4-8 4z" />
      <path d="M4 7v10l8 4 8-4V7M12 11v10" />
    </>
  ),
  package: (
    <>
      <path d="m3 7 9 5 9-5-9-5z" />
      <path d="M3 7v10l9 5 9-5V7M12 12v10" />
    </>
  ),
  swap: (
    <>
      <path d="M7 7h12l-3-3M17 17H5l3 3" />
      <path d="m19 7-3 3M5 17l3-3" />
    </>
  ),
  cart: (
    <>
      <path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L20 8H6" />
      <circle cx="10" cy="20" r="1" />
      <circle cx="17" cy="20" r="1" />
    </>
  ),
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5M12 7v5l3 2" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
  repair: (
    <>
      <path d="M14 6a4 4 0 0 0-5-4l2.5 2.5-3 3L6 5a4 4 0 0 0 4 5L3 17a2.1 2.1 0 0 0 3 3l7-7a4 4 0 0 0 5-5l-2.5 2.5-3-3z" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="4" />
      <path d="M2 21v-2a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v2M16 4a4 4 0 0 1 0 8M18 14a6 6 0 0 1 4 5v2" />
    </>
  ),
  receipt: (
    <>
      <path d="M5 3h14v19l-3-2-4 2-4-2-3 2z" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </>
  ),
  tag: (
    <>
      <path d="M20 13 11 22 2 13V2h11z" />
      <circle cx="7" cy="7" r="1.5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z" />
    </>
  ),
  menu: (
    <>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  arrow: (
    <>
      <path d="m9 18 6-6-6-6" />
    </>
  ),
  logout: (
    <>
      <path d="M10 4H4v16h6M14 8l4 4-4 4M18 12H8" />
    </>
  ),
  store: (
    <>
      <path d="M3 10h18L19 4H5zM5 10v10h14V10M9 20v-6h6v6" />
      <path d="M3 10a3 3 0 0 0 5 2 3 3 0 0 0 4 0 3 3 0 0 0 4 0 3 3 0 0 0 5-2" />
    </>
  ),
  printer: (
    <>
      <path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <path d="M6 14h12v8H6z" />
    </>
  ),
  edit: (
    <>
      <path d="m14 4 6 6L9 21H3v-6zM12 6l6 6" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6" />
    </>
  ),
  check: <path d="m4 12 5 5L20 6" />,
  close: (
    <>
      <path d="m6 6 12 12M18 6 6 18" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  "eye-off": (
    <>
      <path d="m3 3 18 18" />
      <path d="M10.6 6.2A10.7 10.7 0 0 1 12 6c6 0 9.5 6 9.5 6a15.7 15.7 0 0 1-2.1 2.8M6.6 6.6C4 8.3 2.5 12 2.5 12s3.5 6 9.5 6c1.3 0 2.5-.3 3.5-.7" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>
  ),
  chevron: <path d="m9 6 6 6-6 6" />,
};

export function Icon({
  name,
  size = 20,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
