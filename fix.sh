mkdir -p src/app
# verschieben, falls sie im Projektroot liegen:
[ -f app/page.tsx ] && mv app/page.tsx src/app/page.tsx || true
[ -f app/layout.tsx ] && mv app/layout.tsx src/app/layout.tsx || true
# falls globals.css existiert, mit verschieben:
[ -f app/globals.css ] && mv app/globals.css src/app/globals.css || true

# wenn layout.tsx noch nicht existiert, jetzt anlegen:
cat > src/app/layout.tsx <<'EOF'
import "./globals.css"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Wedding DJ",
  description: "Interaktive DJ-App für unsere Hochzeit",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen bg-zinc-900 text-zinc-100">
        {children}
      </body>
    </html>
  )
}
EOF