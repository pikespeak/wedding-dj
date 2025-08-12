import "./globals.css"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Wedding DJ",
  description: "Interaktive DJ-App für unsere Hochzeit",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen bg-zinc-900 text-zinc-100">{children}</body>
    </html>
  )
}