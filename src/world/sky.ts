import { configureSky, underRoof, type PaletteStop } from '../engine/sky/sky';
import { SH, roofTop } from './layout';
import { WX_SEED, cloudMat, clouds, fireU, groundTop, vcMat, waterMat } from './mesh';
import { dogs } from '../entities/registry';

// ================= the meadow's sky: its palettes, where it sits, and what shelters from the rain =================
// palettes keyed by sun elevation in degrees; everything in between is blended
// palettes keyed by sun elevation in degrees; sunrise and sunset have their own pastel looks
const NIGHT_P = {
  e: -12,
  top: 0x0b1230,
  mid: 0x1d2a52,
  hor: 0x2a3560,
  bot: 0x18213f,
  sun: 0x9db2ff,
  hs: 0x4a5a96,
  hg: 0x1c2336,
  hI: 0.5,
  water: 0x2f4f86,
  cloudE: 0x161d33,
};
const DAY_P = {
  e: 26,
  top: 0x3a88d6,
  mid: 0x86c0ea,
  hor: 0xbfe0f0,
  bot: 0x6aaedb,
  sun: 0xfff3df,
  hs: 0xe4f3ff,
  hg: 0x7f9a62,
  hI: 0.62,
  water: 0x5fb3d9,
  cloudE: 0x58616e,
};
export const PAL_PM: PaletteStop[] = [
  NIGHT_P, // dusk afterglow, then the big pink sunset
  {
    e: -5,
    top: 0x2b2f6b,
    mid: 0x7d5c9c,
    hor: 0xe08aa6,
    bot: 0x5a3f6a,
    sun: 0xc0a0ff,
    hs: 0x8a78b0,
    hg: 0x2e2a40,
    hI: 0.46,
    water: 0x6a5a9a,
    cloudE: 0x7a4a78,
  },
  {
    e: 0,
    top: 0x5a63b0,
    mid: 0xd98cbc,
    hor: 0xffa9a4,
    bot: 0xf2b2b2,
    sun: 0xffa08e,
    hs: 0xffb8c8,
    hg: 0x6a5060,
    hI: 0.54,
    water: 0xb08ab8,
    cloudE: 0xc46a86,
  },
  {
    e: 6,
    top: 0x6480c8,
    mid: 0xe898bc,
    hor: 0xffb4a6,
    bot: 0xffcebe,
    sun: 0xffb69a,
    hs: 0xffd0d0,
    hg: 0x786656,
    hI: 0.57,
    water: 0x9fb0d0,
    cloudE: 0xb4707e,
  },
  {
    e: 14,
    top: 0x6b9ad8,
    mid: 0xf6cfc4,
    hor: 0xffe0c8,
    bot: 0xffeede,
    sun: 0xffd4b4,
    hs: 0xffe6da,
    hg: 0x7d7458,
    hI: 0.6,
    water: 0x7ab8d6,
    cloudE: 0x8a6a6a,
  },
  DAY_P,
];
export const PAL_AM: PaletteStop[] = [
  NIGHT_P, // a cooler violet dawn warming to peach and gold
  {
    e: -5,
    top: 0x22346e,
    mid: 0x6a68a8,
    hor: 0xe6a0b0,
    bot: 0x4a4a72,
    sun: 0xc8b4ff,
    hs: 0x7a80b4,
    hg: 0x2a2c42,
    hI: 0.46,
    water: 0x5a68a0,
    cloudE: 0x6a5078,
  },
  {
    e: 0,
    top: 0x4a6cb4,
    mid: 0xd896bc,
    hor: 0xffb08e,
    bot: 0xf2b8a0,
    sun: 0xffae74,
    hs: 0xffcfb8,
    hg: 0x6a5a50,
    hI: 0.54,
    water: 0xa898c0,
    cloudE: 0xc4787a,
  },
  {
    e: 6,
    top: 0x5f86cc,
    mid: 0xe6a6c0,
    hor: 0xffc08e,
    bot: 0xffd8b4,
    sun: 0xffc48e,
    hs: 0xffe0c8,
    hg: 0x7a6a52,
    hI: 0.57,
    water: 0x98b6d0,
    cloudE: 0xb07a6e,
  },
  {
    e: 14,
    top: 0x66a0dc,
    mid: 0xf2dcc8,
    hor: 0xffe8c8,
    bot: 0xfff0dc,
    sun: 0xffe0b8,
    hs: 0xffeedc,
    hg: 0x7f7858,
    hI: 0.6,
    water: 0x78b8d8,
    cloudE: 0x7e6a62,
  },
  DAY_P,
];

configureSky({
  palettes: { am: PAL_AM, pm: PAL_PM },
  lat: -30.6,   // Sandy Beach, NSW
  cover: (x, z) => x > SH.x0 + 2 && x < SH.x1 - 2 && z > SH.z0 + 2 && z < SH.z1 - 2 ? roofTop(x) : null,
  ground: groundTop,
  clouds, cloudMat, groundMat: vcMat, waterMat, fireU,
  // thunder sends Murphy looking for someone, unless he is already under the shelter
  onBolt: () => { for (const d of dogs) if (d.p.nervous && !underRoof(d.pos.x, d.pos.y)) d.startle(); },
  weather: WX_SEED,
});
