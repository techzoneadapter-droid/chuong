export const artwork = {
  icon: require('../assets/xianxia/icon.png'),
  banner: require('../assets/xianxia/library-banner.png'),
  emptyLibrary: require('../assets/xianxia/empty-library.png'),
  background: require('../assets/xianxia/app-background.jpg'),

  // The previous horizontal raster wordmark was intentionally retired from UI:
  // its brush lettering can be misread as “CHƯỞNG”. Brand text is now rendered
  // as literal Unicode “CHƯƠNG” beside the emblem so the name is always exact.
  home: require('../assets/xianxia/nav-home.png'),
  discover: require('../assets/xianxia/nav-discover.png'),
  write: require('../assets/xianxia/nav-write.png'),
  library: require('../assets/xianxia/nav-library.png'),
  profile: require('../assets/xianxia/nav-profile.png'),
  lotus: require('../assets/xianxia/lotus.png'),
  button: require('../assets/xianxia/button-jade.png'),
  divider: require('../assets/xianxia/divider.png'),
  vip: require('../assets/xianxia/badge-vip.png'),
} as const;
