// Replace placeholders with actual Age of Stellara releases and media.
// Audio must be publicly available HTTPS or a file hosted under public/assets.
export const band = {
  name: 'AGE OF STELLARA',
  eyebrow: 'PROGRESSIVE METAL',
  description: 'Age of Stellara is a progressive metal project. The debut EP, settling into the jaws of death and chaos, is the first part of a story that concludes on a full-length album.',
  contact: '', // e.g. booking@example.com
  links: [] // e.g. {label:'YouTube',url:'https://...'}
};
// Shown in the hero and music section until tracks are added to `releases`.
export const upcoming = { title: 'settling into the jaws of death and chaos', type: 'EP', status: 'Coming soon' };
// Public address of the Cloudflare R2 bucket that holds the EP audio (no trailing slash).
// Leave empty to keep showing "Coming soon"; once set, the tracklist and player go live.
export const audioBase = '';
const epTracks = [
  'the wilderness between us',
  '7 years',
  'exile',
  'dear v4.0.0',
  'the pit',
];
export const releases = audioBase ? [{
  id: 'settling-into-the-jaws',
  title: 'settling into the jaws of death and chaos',
  type: 'EP',
  year: '2026',
  artwork: '/assets/album-cover.jpg',
  tracks: epTracks.map((title, i) => {
    const n = String(i + 1).padStart(2, '0');
    return { id: 'ep-' + n, title, duration: '', src: audioBase + '/' + encodeURIComponent(n + ' - ' + title + '.wav') };
  }),
}] : [];
export const photos = [
  // {src:'/assets/gallery-01.jpg',alt:'Age of Stellara live performance'},
  // {src:'/assets/gallery-02.jpg',alt:'Age of Stellara studio session'}
];
export const heroImage = ''; // e.g. '/assets/hero.jpg'
// Artwork for "Settling into the jaws of death and chaos".
export const coverArt = '/assets/album-cover.jpg';
