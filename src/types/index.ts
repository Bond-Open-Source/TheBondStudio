export interface SubtitleSegment {
  text: string;
  start: number;
  end: number;
}

/** Position in 0–1 (normalized) for layout */
export interface VideoLayout {
  logo: { x: number; y: number; scale?: number };
  title: { x: number; y: number };
  waveform: { centerX: number; centerY: number; scale?: number };
  subtitle: { centerY: number };
  progressBar: { y: number };
}

export const DEFAULT_LAYOUT: VideoLayout = {
  logo: { x: 80 / 1920, y: 80 / 1080, scale: 1 },
  title: { x: 80 / 1920, y: 240 / 1080 },
  waveform: { centerX: 0.5, centerY: 0.35, scale: 1 },
  subtitle: { centerY: 0.78 },
  progressBar: { y: (1080 - 120) / 1080 },
};

/** Subtitle text style – size, color, stroke, font, area width */
export interface SubtitleStyle {
  fontSize: number;
  fontWeight?: number;
  color: string;
  highlightColor: string;
  strokeWidth: number;
  strokeColor: string;
  font: string;
  /** Transcript area width as fraction of canvas (0.2–1). Higher = more space for text; the rest is margin on the sides. */
  maxWidthFraction: number;
  /** Render subtitles in uppercase */
  uppercase?: boolean;
  /** White decoration behind words (semi-transparent). Current word in full white. */
  transcriptDecoration?: boolean;
  /** Opacity of the white decoration (0–100). Current word always full opacity. */
  transcriptDecorationOpacity?: number;
}

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  fontSize: 46,
  fontWeight: 700,
  color: "#ffffff",
  highlightColor: "#3b82f6",
  strokeWidth: 0,
  strokeColor: "#000000",
  font: "Lato, sans-serif",
  maxWidthFraction: 0.98,
  uppercase: true,
  transcriptDecoration: false,
  transcriptDecorationOpacity: 30,
};

/** Title text style – size, color, weight */
export interface TitleStyle {
  fontSize: number;
  color: string;
  fontWeight: number;
}

export const DEFAULT_TITLE_STYLE: TitleStyle = {
  fontSize: 48,
  color: "#1d4ed8",
  fontWeight: 700,
};

/** Visual style of the waveform in the video */
export type WaveformStyle =
  | "bars"
  | "dots"
  | "ring"
  | "linear"
  | "waves"
  | "spectrum"
  | "orb"
  | "ripple"
  | "waveLine"
  | "stacked"
  | "equalizer"
  | "waveform"
  | "pulseRings"
  | "neonArc"
  | "blob"
  | "helix"
  | "bounce"
  | "liquid"
  | "starburst"
  | "particles"
  | "ribbon"
  | "minimal"
  | "glow";

export interface BrandingTemplate {
  podcastName: string;
  /** Show podcast title on video. Default false. */
  titleVisible?: boolean;
  /** Show progress bar on video. Default true. */
  progressBarVisible?: boolean;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  /** Video canvas background color (hex). Used only for the exported video background. */
  videoBackgroundColor?: string;
  /** Background image (data URL). Drawn blurred with dark overlay. Falls back to solid color if not set. */
  videoBackgroundImageUrl?: string | null;
  /** Blur amount for background image (0–40px). Default 12. */
  videoBackgroundBlur?: number;
  /** Black overlay opacity for background image (0–100). Default 55. */
  videoBackgroundOverlay?: number;
  /** Apply blur to background image. If false, no blur. Default true. */
  videoBackgroundBlurEnabled?: boolean;
  /** Apply black overlay to background image. If false, no overlay. Default true. */
  videoBackgroundOverlayEnabled?: boolean;
  /** Waveform bar color (hex). Falls back to primaryColor if not set. */
  waveformColor: string;
  /** Which waveform visualization to use */
  waveformStyle: WaveformStyle;
  /** @deprecated use subtitleStyle.font */
  subtitleFont: string;
  /** Title (podcast name) text style */
  titleStyle?: TitleStyle;
  subtitleStyle: SubtitleStyle;
  layout: VideoLayout;
}

export const DEFAULT_BRANDING: BrandingTemplate = {
  podcastName: "My Podcast",
  titleVisible: false,
  progressBarVisible: true,
  logoUrl: null,
  primaryColor: "#1d4ed8",
  secondaryColor: "#3b82f6",
  videoBackgroundColor: "#0a0a0a",
  waveformColor: "#1d4ed8",
  waveformStyle: "bars",
  subtitleFont: "system-ui",
  titleStyle: DEFAULT_TITLE_STYLE,
  subtitleStyle: DEFAULT_SUBTITLE_STYLE,
  layout: DEFAULT_LAYOUT,
};
