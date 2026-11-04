/** Inline SVG icons (from the approved mockups). */
import type { JSX } from 'preact';

type P = { size?: number; sw?: number };
const S = ({ size = 22, sw = 2, children }: P & { children: JSX.Element | JSX.Element[] }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={sw}
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{children}</svg>
);

export const IconCheck = (p: P) => <S sw={2.6} {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></S>;
export const IconBook = (p: P) => (
  <S {...p}><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z" /><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z" /></S>
);
export const IconReview = (p: P) => (
  <S sw={2.2} {...p}><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" /><path d="M20 20v-4h-4" /></S>
);
export const IconTable = (p: P) => <S sw={2.2} {...p}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 10h16M4 15h16M10 4v16" /></S>;
export const IconPlus = (p: P) => <S sw={2.4} {...p}><path d="M12 5v14M5 12h14" /></S>;
export const IconForms = (p: P) => <S sw={2.2} {...p}><path d="M5 6h14M5 12h9M5 18h11" /></S>;
export const IconLaurel = (p: P) => (
  <S sw={2.2} {...p}><path d="M12 20c-4-1-7-5-7-10M12 20c4-1 7-5 7-10" /><path d="M9 12l2 2 4-4" /></S>
);
export const IconFlame = (p: P) => (
  <S size={16} {...p}><path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.2 1-3.6 2.2-4.8.3 1.6 1 2.6 1.8 3.1C11 9 11 6 12 3z" /></S>
);
export const IconStar = (p: P) => (
  <S size={16} {...p}><path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z" /></S>
);
export const IconCloudOff = (p: P) => (
  <S size={16} {...p}><path d="M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z" /><path d="M4 4l16 16" /></S>
);
export const IconCloud = (p: P) => (
  <S size={16} {...p}><path d="M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z" /></S>
);
export const IconX = (p: P) => <S size={24} sw={2.4} {...p}><path d="M6 6l12 12M18 6L6 18" /></S>;
export const IconBack = (p: P) => <S size={24} sw={2.4} {...p}><path d="M15 5l-7 7 7 7" /></S>;
export const IconPath = (p: P) => <S sw={2.2} {...p}><path d="M6 20c0-4 12-4 12-8s-12-4-12-8" /></S>;
export const IconPractice = (p: P) => <S {...p}><path d="M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12" /></S>;
export const IconWords = (p: P) => <S {...p}><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" /></S>;
export const IconProfile = (p: P) => <S {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></S>;
