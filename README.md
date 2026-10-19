# Age of Stellara — Official Website

An original, responsive progressive-metal band website built with React and Vite.

## Run locally

Requires Node.js 20.19+ or 22.12+.

```bash
npm install
npm run dev
```

Open the local URL shown by Vite. Build for production with `npm run build`; deploy the `dist` directory to any static host.

## Add your music

Edit `src/content.js`. Add a release with its tracks, artwork, and real audio file URLs. Place your own MP3/M4A/OGG files and licensed images in `public/assets/`. For example:

```js
export const releases = [{
  id: 'chapter-one',
  title: 'Chapter One',
  type: 'EP',
  year: '2026',
  artwork: '/assets/album-cover.jpg',
  tracks: [
    { id: 'chapter-one-01', title: 'Your Track Title', duration: '5:12', src: '/assets/track-01.mp3' }
  ]
}];
```

The player provides play/pause, previous/next, seek, elapsed and duration, volume/mute, shuffle, repeat-all, repeat-one, and track selection. Browser autoplay restrictions apply. Duration is read from the actual audio when loaded.

## Customize

- Band biography, social links, contact: `band` in `src/content.js`.
- Hero image: `heroImage` in `src/content.js`.
- Gallery: `photos` in `src/content.js`.
- Colors and layout: `src/styles.css`.

No music or band photos were invented. Designed placeholders appear until licensed media is provided. No external photos or audio are fetched. The player doesn't claim playback when nothing has been uploaded.

## Deploying

Vite builds a static site. On Railway or other static hosts, run `npm ci && npm run build` and serve `dist`. Configure your chosen host's static publishing directory as `dist`. The project contains no backend or secrets.
