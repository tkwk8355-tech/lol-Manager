# SummonerLog

A personal, non-commercial **League of Legends match history & stats website** built for learning purposes.

Search for any player by their **Riot ID** (`gameName#tagLine`) and view their recent matches, ranked tier, and per-champion performance.

> ⚠️ This project is for personal/educational use only. It is **not** endorsed by or affiliated with Riot Games.
> SummonerLog isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.

## Features (planned)

- 🔍 Search a summoner by Riot ID (`gameName#tagLine`)
- 📜 Recent match history (KDA, champion, result)
- 🏆 Ranked tier & LP
- 📊 Per-champion performance summary

## Tech Stack

- **Next.js** (App Router) + **TypeScript**
- Riot Games API (server-side, key kept secret)

## Riot API usage

This app calls the Riot API **only from the server** so the API key is never exposed to the browser:

| API | Purpose |
| --- | --- |
| `ACCOUNT-V1` | Resolve a Riot ID into a PUUID |
| `SUMMONER-V4` | Get summoner profile details |
| `LEAGUE-V4` | Get ranked tier / LP |
| `MATCH-V5` | Fetch recent match data |

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Set up your environment variables
cp .env.example .env.local
# then open .env.local and paste your Riot API key

# 3. Run the dev server
npm run dev
```

Open http://localhost:3000 in your browser.

## Environment Variables

Create a `.env.local` file (see `.env.example`):

```
RIOT_API_KEY=YOUR_DEVELOPMENT_KEY_HERE
```

Get a key from the [Riot Developer Portal](https://developer.riotgames.com).
**Never commit your real API key.** `.env.local` is already in `.gitignore`.

## License

For personal learning use only.
