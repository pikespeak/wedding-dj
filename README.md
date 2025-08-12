# 🎶 Wedding DJ App

Eine interaktive DJ- und Musikwunsch-App für unsere Hochzeit, optimiert für iPads und Echtzeitsteuerung via Spotify.  
Gäste können Musikwünsche eingeben, Songs liken oder disliken, und die Playlist passt sich automatisch an Stimmung, Uhrzeit und Gästedemografie an.  
Das Admin-Interface erlaubt die direkte Steuerung der Spotify-Wiedergabe.

---

## 🚀 Features (MVP-0)
- **Now Playing** – aktueller Song mit Cover, Titel, Artist & Restlaufzeit
- **Musikwunsch-System** – Gäste geben Wünsche ein, optional mit Kommentar
- **Likes/Dislikes** – beeinflussen zukünftige Songauswahl (ohne Song zu unterbrechen)
- **Queue-Übersicht** – nächste Titel mit Begründung
- **Admin-Drawer** – Phase umschalten, Device auswählen, Skip/Play/Pause
- **Realtime Sync** – mehrere Tablets sehen immer den gleichen Status

---

## 🛠 Tech-Stack
- **[Next.js](https://nextjs.org/)** mit App Router
- **[Tailwind CSS](https://tailwindcss.com/)** für schnelles, responsives Styling
- **[Supabase](https://supabase.com/)** für Datenbank, Auth & Realtime
- **[Spotify Web API](https://developer.spotify.com/documentation/web-api/)** für Musikwiedergabe
- **[Vercel](https://vercel.com/)** für Hosting & Deployment

---

## 📦 Installation

### 1. Repository klonen
```bash
git clone <REPO_URL>
cd wedding-dj