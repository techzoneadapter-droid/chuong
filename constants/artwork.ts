export const artwork = {
  icon: require('../assets/xianxia/icon.png'),
  banner: require('../assets/xianxia/library-banner.png'),
  emptyLibrary: require('../assets/xianxia/empty-library.png'),
};

const covers = [
  require('../assets/xianxia/cover-palace.png'),
  require('../assets/xianxia/cover-bamboo.png'),
  require('../assets/xianxia/cover-archive.png'),
];

export function coverArtwork(seed: string) {
  const index = Array.from(seed).reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 0);
  return covers[index % covers.length];
}
