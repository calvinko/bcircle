# Bible Reading App

This project uses:
- React
- Vite
- Tailwind CSS
- framer-motion
- lucide-react

## What changed

The Read page now loads real chapter text from `bible-api.com`.

## Run locally

```bash
npm install
npm run dev
```

## Notes

- Real chapter text is fetched on the client from `bible-api.com`
- Default translation is WEB, and you can switch translations in the app
- Reading progress, plan settings, and profile data are stored in `localStorage`
