import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Player } from "@/components/Player";
import { NowPlaying } from "@/components/NowPlaying";
import { SWRegister } from "@/components/SWRegister";
import { SearchBox } from "@/components/SearchBox";
import { getCurrentUser } from "@/lib/auth";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NODE_ENV === "production"
      ? "https://lifestreamradio.com"
      : "http://localhost:3000",
  ),
  title: {
    default: "Life Stream",
    template: "%s · Life Stream",
  },
  description: "Music from our church community — listen, like, and share.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Life Stream",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0e13",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2 font-bold" aria-label="Life Stream home">
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <defs>
          <linearGradient id="ls-logo" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#38bdf8" />
            <stop offset="1" stopColor="#a78bfa" />
          </linearGradient>
        </defs>
        <rect width="24" height="24" rx="6" fill="#0c4a6e" opacity="0.55" />
        <rect x="4" y="10" width="3" height="7" rx="1.5" fill="url(#ls-logo)" />
        <rect x="10" y="5" width="3" height="14" rx="1.5" fill="url(#ls-logo)" />
        <rect x="16" y="8" width="3" height="9" rx="1.5" fill="url(#ls-logo)" />
      </svg>
      <span className="hidden sm:inline">Life Stream</span>
    </Link>
  );
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser().catch(() => null);

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-40 border-b border-border bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-3 sm:gap-3 sm:px-4">
            <Logo />
            <SearchBox className="min-w-0 w-full flex-1 sm:ml-auto sm:w-64 sm:flex-none" />
            <nav className="flex shrink-0 items-center gap-1">
              {user ? (
                <Link href="/library" className="btn btn-ghost !px-3 !py-1.5" aria-label="Library">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M12 12a4.5 4.5 0 1 0-4.5-4.5A4.5 4.5 0 0 0 12 12Zm0 2.25c-3.4 0-9 1.7-9 5.06V21h18v-1.69c0-3.36-5.6-5.06-9-5.06Z" />
                  </svg>
                </Link>
              ) : (
                <>
                  <Link href="/login" className="btn btn-ghost !px-3 !py-1.5">
                    Sign in
                  </Link>
                  <Link href="/register" className="btn btn-primary !px-3 !py-1.5">
                    Join
                  </Link>
                </>
              )}
            </nav>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-6">
          {children}
        </main>

        <footer className="border-t border-border py-6 pb-[calc(7rem+env(safe-area-inset-bottom))] text-center text-xs text-muted">
          <Link href="/about" className="hover:underline">
            about
          </Link>
        </footer>

        <Player />
        <NowPlaying />
        <SWRegister />
      </body>
    </html>
  );
}
