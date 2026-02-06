/**
 * Shared drawing logic for video preview and export.
 * Renders one frame with branding, circular waveform, progress, and subtitle.
 */

import type { BrandingTemplate } from "@/types";
import type { SubtitleSegment } from "@/types";
import {
  DEFAULT_LAYOUT,
  DEFAULT_SUBTITLE_STYLE,
  DEFAULT_TITLE_STYLE,
  type VideoLayout,
  type WaveformStyle,
} from "@/types";
import { getAmplitudeAtTime, type AmplitudeCurve } from "./amplitudeCurve";

export interface DrawVideoFrameOptions {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  time: number;
  duration: number;
  branding: BrandingTemplate;
  segments: SubtitleSegment[];
  logoImg: HTMLImageElement | null;
  /** Background image for blurred + dark overlay effect. Optional. */
  backgroundImg?: HTMLImageElement | null;
  /** Optional pre-computed amplitude curve so waveform bars pulse with real audio */
  amplitudeCurve?: AmplitudeCurve | null;
}

export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    const { width } = ctx.measureText(test);
    if (width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Get current phrase (words around current time) and which word index is being spoken. */
function getPhraseAndCurrentWord(
  segments: SubtitleSegment[],
  time: number
): { words: string[]; currentIndex: number } | null {
  if (segments.length === 0) return null;

  const idx = segments.findIndex((s) => time >= s.start && time <= s.end);

  if (idx === -1) {
    const next = segments.findIndex((s) => s.start > time);
    if (next === -1) return null;
    const prev = next - 1;
    if (prev < 0) return null;
    const seg = segments[prev];
    const w = seg.text.trim().split(/\s+/).filter(Boolean);
    return { words: w, currentIndex: Math.max(0, w.length - 1) };
  }

  const current = segments[idx];
  const words = current.text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  const segmentDuration = current.end - current.start;
  const t = segmentDuration > 0 ? (time - current.start) / segmentDuration : 0;
  const currentIndex = Math.min(Math.floor(t * words.length), words.length - 1);

  return { words, currentIndex };
}

function getCurrentSubtitle(segments: SubtitleSegment[], time: number): string {
  const segment = segments.find((s) => time >= s.start && time <= s.end);
  return segment?.text?.trim() ?? "";
}

/** How many words from the start fit in exactly maxLines lines. */
function countWordsFittingInLines(
  ctx: CanvasRenderingContext2D,
  words: string[],
  maxWidth: number,
  maxLines: number
): number {
  const spaceW = ctx.measureText(" ").width;
  let lineCount = 0;
  let lineWidth = 0;
  let wordCount = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const wordW = ctx.measureText(w).width;
    const need = lineWidth + (lineWidth > 0 ? spaceW : 0) + wordW;
    if (lineWidth > 0 && need > maxWidth) {
      lineCount++;
      if (lineCount >= maxLines) {
        lineWidth = wordW;
        wordCount++;
        for (let j = i + 1; j < words.length; j++) {
          const w2 = words[j];
          const n2 = lineWidth + spaceW + ctx.measureText(w2).width;
          if (n2 <= maxWidth) {
            lineWidth = n2;
            wordCount++;
          } else {
            return wordCount;
          }
        }
        return wordCount;
      }
      lineWidth = wordW;
      wordCount++;
    } else {
      lineWidth = need;
      wordCount++;
    }
  }
  return wordCount;
}

/** Sliding window: returns words to show + index of current word within that slice. Never drops words. */
function getVisibleWordWindow(
  ctx: CanvasRenderingContext2D,
  words: string[],
  currentIndex: number,
  maxWidth: number,
  maxLines: number
): { words: string[]; localCurrentIndex: number } {
  const count = countWordsFittingInLines(ctx, words, maxWidth, maxLines);
  if (count >= words.length) return { words, localCurrentIndex: currentIndex };
  for (let startIdx = 0; startIdx <= currentIndex; startIdx++) {
    const slice = words.slice(startIdx);
    const k = countWordsFittingInLines(ctx, slice, maxWidth, maxLines);
    if (k > 0 && startIdx + k > currentIndex) {
      return { words: slice.slice(0, k), localCurrentIndex: currentIndex - startIdx };
    }
  }
  const start = Math.max(0, currentIndex - 3);
  const k = countWordsFittingInLines(ctx, words.slice(start), maxWidth, maxLines);
  return { words: words.slice(start, start + k), localCurrentIndex: currentIndex - start };
}

/** Wrap words into exactly maxLines lines; returns array of word arrays per line. Never overflows. */
function wrapWordsIntoLines(
  ctx: CanvasRenderingContext2D,
  words: string[],
  maxWidth: number,
  maxLines: number
): string[][] {
  const lines: string[][] = [];
  let line: string[] = [];
  let lineWidth = 0;
  const spaceW = ctx.measureText(" ").width;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const wordW = ctx.measureText(word).width;
    const need = lineWidth + (line.length ? spaceW : 0) + wordW;
    if (line.length > 0 && need > maxWidth) {
      lines.push(line);
      if (lines.length >= maxLines) {
        const lastLine = lines.pop()!;
        let lastLineWidth = lastLine.reduce(
          (acc, w, idx) => acc + ctx.measureText(w).width + (idx > 0 ? spaceW : 0),
          0
        );
        for (let j = i; j < words.length; j++) {
          const w = words[j];
          const wW = ctx.measureText(w).width;
          const n = lastLineWidth + (lastLine.length ? spaceW : 0) + wW;
          if (n <= maxWidth) {
            lastLine.push(w);
            lastLineWidth = n;
          } else {
            break;
          }
        }
        lines.push(lastLine);
        break;
      }
      line = [word];
      lineWidth = wordW;
    } else {
      line.push(word);
      lineWidth = need;
    }
  }
  if (line.length > 0 && lines.length < maxLines) lines.push(line);

  while (lines.length < maxLines) {
    lines.push([]);
  }
  return lines.slice(0, maxLines);
}

/** Waveform drawing params shared by all styles */
function drawWaveformBars(
  ctx: CanvasRenderingContext2D,
  opts: {
    cx: number;
    cy: number;
    scale: number;
    progress: number;
    amplitude: number | null;
    waveformColor: string;
    innerR: number;
    outerR: number;
    barCount: number;
    time: number;
  }
) {
  const { cx, cy, scale, progress, amplitude, waveformColor, innerR, outerR, barCount, time } = opts;
  ctx.save();
  ctx.translate(cx, cy);
  for (let i = 0; i < barCount; i++) {
    const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
    const isActive = i < progress * barCount;
    let barLen: number;
    if (isActive && amplitude !== null) {
      const mix = 0.35 + 0.65 * amplitude;
      barLen = innerR + (outerR - innerR) * mix;
    } else if (isActive) {
      const wave = Math.sin((time * 3 + i * 0.15) * Math.PI) * 0.5 + 0.5;
      barLen = innerR + (outerR - innerR) * (wave * 0.7 + 0.3);
    } else {
      barLen = innerR + (outerR - innerR) * 0.08;
    }
    ctx.save();
    ctx.rotate(angle);
    ctx.fillStyle = isActive ? waveformColor : waveformColor + "30";
    ctx.fillRect(innerR, -2 * scale, barLen - innerR, 4 * scale);
    ctx.restore();
  }
  ctx.restore();
}

function drawWaveformDots(
  ctx: CanvasRenderingContext2D,
  opts: {
    cx: number;
    cy: number;
    scale: number;
    progress: number;
    amplitude: number | null;
    waveformColor: string;
    innerR: number;
    outerR: number;
    barCount: number;
    time: number;
  }
) {
  const { cx, cy, scale, progress, amplitude, waveformColor, innerR, outerR, barCount, time } = opts;
  const dotRadius = 3 * scale;
  ctx.save();
  ctx.translate(cx, cy);
  for (let i = 0; i < barCount; i++) {
    const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
    const isActive = i < progress * barCount;
    let r: number;
    if (isActive && amplitude !== null) {
      const mix = 0.35 + 0.65 * amplitude;
      r = innerR + (outerR - innerR) * mix;
    } else if (isActive) {
      const wave = Math.sin((time * 3 + i * 0.15) * Math.PI) * 0.5 + 0.5;
      r = innerR + (outerR - innerR) * (wave * 0.7 + 0.3);
    } else {
      r = innerR + (outerR - innerR) * 0.08;
    }
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    ctx.beginPath();
    ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
    ctx.fillStyle = isActive ? waveformColor : waveformColor + "30";
    ctx.fill();
  }
  ctx.restore();
}

function drawWaveformRing(
  ctx: CanvasRenderingContext2D,
  opts: {
    cx: number;
    cy: number;
    scale: number;
    progress: number;
    amplitude: number | null;
    waveformColor: string;
    innerR: number;
    outerR: number;
    time: number;
  }
) {
  const { cx, cy, scale, progress, amplitude, waveformColor, innerR, outerR, time } = opts;
  const lineW = 8 * scale;
  const baseR = (innerR + outerR) / 2;
  const rangeR = (outerR - innerR) * 0.5;
  const amp = amplitude !== null ? 0.4 + 0.6 * amplitude : 0.5 + 0.5 * (Math.sin(time * 4) * 0.5 + 0.5);
  const r = baseR + rangeR * amp;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
  ctx.strokeStyle = waveformColor;
  ctx.lineWidth = lineW;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r, -Math.PI / 2 + Math.PI * 2 * progress, -Math.PI / 2 + Math.PI * 2);
  ctx.strokeStyle = waveformColor + "30";
  ctx.stroke();
  ctx.restore();
}

function drawWaveformLinear(
  ctx: CanvasRenderingContext2D,
  opts: {
    cx: number;
    cy: number;
    width: number;
    scale: number;
    progress: number;
    duration: number;
    waveformColor: string;
    amplitudeCurve: AmplitudeCurve | null | undefined;
    waveformScale?: number;
  }
) {
  const { cx, cy, width, scale, progress, duration, waveformColor, amplitudeCurve, waveformScale = 1 } = opts;
  const stripW = Math.min(700 * scale * waveformScale, width * 0.8);
  const stripH = 56 * scale * waveformScale;
  const barCount = 100;
  const halfW = stripW / 2;
  const barW = stripW / barCount;
  ctx.save();
  ctx.translate(cx - halfW, cy - stripH / 2);
  for (let i = 0; i < barCount; i++) {
    const t = duration > 0 ? (i / (barCount - 1)) * duration : 0;
    const amp = amplitudeCurve ? getAmplitudeAtTime(amplitudeCurve, t) : 0.5;
    const played = duration > 0 ? t <= (progress * duration) : false;
    const h = (0.2 + 0.8 * amp) * stripH * 0.5;
    const x = i * barW + (barW - 1) / 2;
    ctx.fillStyle = played ? waveformColor : waveformColor + "40";
    ctx.fillRect(x, stripH / 2 - h, Math.max(1, barW - 1), h * 2);
  }
  ctx.restore();
}

/** Smooth flowing circular wave (modern continuous line) */
function drawWaveformWaves(
  ctx: CanvasRenderingContext2D,
  opts: {
    cx: number;
    cy: number;
    scale: number;
    progress: number;
    amplitude: number | null;
    waveformColor: string;
    innerR: number;
    outerR: number;
    time: number;
  }
) {
  const { cx, cy, scale, progress, amplitude, waveformColor, innerR, outerR, time } = opts;
  const baseR = (innerR + outerR) / 2;
  const rangeR = (outerR - innerR) * 0.45;
  const amp = amplitude !== null ? 0.4 + 0.6 * amplitude : 0.5 + 0.5 * (Math.sin(time * 3) * 0.5 + 0.5);
  const lobes = 5;
  const points = 120;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  for (let i = 0; i <= points; i++) {
    const t = i / points;
    const angle = t * Math.PI * 2 - Math.PI / 2;
    const wave = Math.sin(angle * lobes + time * 4) * 0.5 + 0.5;
    const r = baseR + rangeR * wave * amp;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.strokeStyle = waveformColor;
  ctx.lineWidth = 3 * scale;
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = waveformColor;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** Half-circle spectrum / equalizer bars */
function drawWaveformSpectrum(
  ctx: CanvasRenderingContext2D,
  opts: {
    cx: number;
    cy: number;
    scale: number;
    progress: number;
    amplitude: number | null;
    waveformColor: string;
    innerR: number;
    outerR: number;
    time: number;
    amplitudeCurve: AmplitudeCurve | null | undefined;
    duration: number;
  }
) {
  const { cx, cy, scale, progress, amplitude, waveformColor, innerR, outerR, time, amplitudeCurve, duration } = opts;
  const barCount = 32;
  const barW = 4 * scale;
  const maxH = 60 * scale;
  const amp = amplitude !== null ? amplitude : 0.5;
  ctx.save();
  ctx.translate(cx, cy + outerR * 0.6);
  for (let i = 0; i < barCount; i++) {
    const t = duration > 0 ? (i / (barCount - 1)) * duration : 0;
    const barAmp = amplitudeCurve ? getAmplitudeAtTime(amplitudeCurve, t) : 0.5;
    const played = duration > 0 ? t <= progress * duration : false;
    const h = (0.2 + 0.8 * barAmp) * maxH * (0.6 + 0.4 * amp);
    const x = (i - (barCount - 1) / 2) * (barW + 2 * scale);
    ctx.fillStyle = played ? waveformColor : waveformColor + "50";
    ctx.fillRect(x, -h, barW, h);
    ctx.fillRect(x, 0, barW, h);
  }
  ctx.restore();
}

/** Soft pulsing orb / glow */
function drawWaveformOrb(
  ctx: CanvasRenderingContext2D,
  opts: {
    cx: number;
    cy: number;
    scale: number;
    amplitude: number | null;
    waveformColor: string;
    innerR: number;
    outerR: number;
    time: number;
  }
) {
  const { cx, cy, scale, amplitude, waveformColor, innerR, outerR, time } = opts;
  const baseR = (innerR + outerR) / 2;
  const rangeR = (outerR - innerR) * 0.6;
  const amp = amplitude !== null ? 0.5 + 0.5 * amplitude : 0.7 + 0.3 * (Math.sin(time * 3) * 0.5 + 0.5);
  const r = baseR + rangeR * amp;
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  gradient.addColorStop(0, waveformColor + "cc");
  gradient.addColorStop(0.4, waveformColor + "66");
  gradient.addColorStop(0.7, waveformColor + "22");
  gradient.addColorStop(1, waveformColor + "00");
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.restore();
}

/** Concentric ripples pulsing outward */
function drawWaveformRipple(
  ctx: CanvasRenderingContext2D,
  opts: {
    cx: number;
    cy: number;
    scale: number;
    progress: number;
    amplitude: number | null;
    waveformColor: string;
    innerR: number;
    outerR: number;
    time: number;
  }
) {
  const { cx, cy, scale, progress, amplitude, waveformColor, innerR, outerR, time } = opts;
  const baseR = (innerR + outerR) / 2;
  const ringCount = 4;
  const lineW = 3 * scale;
  const amp = amplitude !== null ? 0.3 + 0.7 * amplitude : 0.6;
  ctx.save();
  ctx.translate(cx, cy);
  for (let i = 0; i < ringCount; i++) {
    const phase = (i / ringCount) * Math.PI * 2 + time * 2;
    const pulse = Math.sin(phase) * 0.5 + 0.5;
    const r = baseR * (0.4 + 0.6 * (i / ringCount)) + (outerR - innerR) * 0.2 * pulse * amp;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.strokeStyle = waveformColor + (progress > i / ringCount ? "99" : "40");
    ctx.lineWidth = lineW;
    ctx.stroke();
  }
  ctx.restore();
}

/** Single smooth horizontal wave line (filled curve from amplitude data) */
function drawWaveformWaveLine(
  ctx: CanvasRenderingContext2D,
  opts: {
    cx: number;
    cy: number;
    width: number;
    scale: number;
    progress: number;
    duration: number;
    waveformColor: string;
    amplitudeCurve: AmplitudeCurve | null | undefined;
    waveformScale?: number;
  }
) {
  const { cx, cy, width, scale, progress, duration, waveformColor, amplitudeCurve, waveformScale = 1 } = opts;
  const stripW = Math.min(800 * scale * waveformScale, width * 0.85);
  const stripH = 80 * scale * waveformScale;
  const pointCount = 150;
  const halfW = stripW / 2;
  ctx.save();
  ctx.translate(cx - halfW, cy - stripH / 2);
  ctx.beginPath();
  let firstX = 0;
  let firstY = stripH / 2;
  for (let i = 0; i <= pointCount; i++) {
    const t = duration > 0 ? (i / pointCount) * duration : 0;
    const amp = amplitudeCurve ? getAmplitudeAtTime(amplitudeCurve, t) : 0.5;
    const x = (i / pointCount) * stripW;
    const y = stripH / 2 - (0.2 + 0.8 * amp) * (stripH / 2);
    if (i === 0) {
      firstX = x;
      firstY = y;
      ctx.moveTo(x, y);
    } else ctx.lineTo(x, y);
  }
  ctx.lineTo(stripW, stripH / 2);
  ctx.lineTo(0, stripH / 2);
  ctx.closePath();
  const playedT = progress * duration;
  const playedX = duration > 0 ? (playedT / duration) * stripW : 0;
  ctx.fillStyle = waveformColor + "30";
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, stripH / 2);
  for (let i = 0; i <= pointCount; i++) {
    const t = (i / pointCount) * duration;
    if (t > playedT) break;
    const amp = amplitudeCurve ? getAmplitudeAtTime(amplitudeCurve, t) : 0.5;
    const x = (i / pointCount) * stripW;
    const y = stripH / 2 - (0.2 + 0.8 * amp) * (stripH / 2);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.lineTo(playedX, stripH / 2);
  ctx.closePath();
  ctx.fillStyle = waveformColor;
  ctx.fill();
  ctx.restore();
}

/** Luminous glow waves – smooth layered waves with neon glow (like reference image) */
function drawWaveformGlow(
  ctx: CanvasRenderingContext2D,
  opts: {
    cx: number;
    cy: number;
    width: number;
    scale: number;
    progress: number;
    duration: number;
    amplitude: number | null;
    amplitudeCurve: AmplitudeCurve | null | undefined;
    waveformColor: string;
    time: number;
    waveformScale?: number;
  }
) {
  const { cx, cy, width, scale, progress, duration, amplitude, amplitudeCurve, waveformColor, time, waveformScale = 1 } = opts;
  const stripW = Math.min(900 * scale * waveformScale, width * 0.95);
  const stripH = 100 * scale * waveformScale;
  const points = 120;
  const baseAmp = amplitude !== null ? 0.6 + 0.4 * amplitude : 0.85;
  const halfW = stripW / 2;
  const playedT = progress * duration;

  const getY = (i: number) => {
    const t = (i / points) * duration;
    const audioAmp = amplitudeCurve ? getAmplitudeAtTime(amplitudeCurve, t) : 0.5;
    const x = (i / points) * stripW;
    const amp = baseAmp * (0.4 + 0.6 * audioAmp);
    return amp * (stripH / 2) * Math.sin((x / stripW) * Math.PI * 4 + time * 2);
  };

  ctx.save();
  ctx.translate(cx - halfW, cy);

  const layers = [
    { opacity: "15", lineW: 12, blur: 35 },
    { opacity: "25", lineW: 9, blur: 25 },
    { opacity: "45", lineW: 6, blur: 16 },
    { opacity: "80", lineW: 4, blur: 8 },
  ];

  for (const layer of layers) {
    ctx.beginPath();
    for (let i = 0; i <= points; i++) {
      const x = (i / points) * stripW;
      const y = -getY(i);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.shadowColor = waveformColor;
    ctx.shadowBlur = layer.blur * scale;
    ctx.strokeStyle = waveformColor + layer.opacity;
    ctx.lineWidth = layer.lineW * scale;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  ctx.shadowBlur = 0;

  ctx.beginPath();
  let started = false;
  for (let i = 0; i <= points; i++) {
    const t = (i / points) * duration;
    if (t > playedT) break;
    const x = (i / points) * stripW;
    const y = -getY(i);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else ctx.lineTo(x, y);
  }
  if (started) {
    ctx.shadowColor = waveformColor;
    ctx.shadowBlur = 10 * scale;
    ctx.strokeStyle = waveformColor;
    ctx.lineWidth = 3.5 * scale;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  ctx.restore();
}

/** Horizontal equalizer bars – classic EQ display */
function drawWaveformEqualizer(
  ctx: CanvasRenderingContext2D,
  opts: {
    cx: number;
    cy: number;
    width: number;
    scale: number;
    progress: number;
    duration: number;
    waveformColor: string;
    amplitudeCurve: AmplitudeCurve | null | undefined;
    waveformScale?: number;
  }
) {
  const { cx, cy, width, scale, progress, duration, waveformColor, amplitudeCurve, waveformScale = 1 } = opts;
  const stripW = Math.min(750 * scale * waveformScale, width * 0.85);
  const stripH = 70 * scale * waveformScale;
  const barCount = 48;
  const barGap = 3 * scale;
  const barW = (stripW - (barCount - 1) * barGap) / barCount;
  const halfW = stripW / 2;
  ctx.save();
  ctx.translate(cx - halfW, cy - stripH / 2);
  for (let i = 0; i < barCount; i++) {
    const t = duration > 0 ? (i / (barCount - 1)) * duration : 0;
    const amp = amplitudeCurve ? getAmplitudeAtTime(amplitudeCurve, t) : 0.5;
    const played = duration > 0 ? t <= progress * duration : false;
    const h = (0.15 + 0.85 * amp) * stripH * 0.5;
    const x = i * (barW + barGap);
    ctx.fillStyle = played ? waveformColor : waveformColor + "35";
    ctx.fillRect(x, stripH / 2 - h, barW, h * 2);
  }
  ctx.restore();
}

/** Single amplitude trace line – SoundCloud / audio editor style */
function drawWaveformTrace(
  ctx: CanvasRenderingContext2D,
  opts: {
    cx: number;
    cy: number;
    width: number;
    scale: number;
    progress: number;
    duration: number;
    waveformColor: string;
    amplitudeCurve: AmplitudeCurve | null | undefined;
    waveformScale?: number;
  }
) {
  const { cx, cy, width, scale, progress, duration, waveformColor, amplitudeCurve, waveformScale = 1 } = opts;
  const stripW = Math.min(850 * scale * waveformScale, width * 0.9);
  const stripH = 90 * scale * waveformScale;
  const points = 200;
  const halfW = stripW / 2;
  const playedT = progress * duration;
  ctx.save();
  ctx.translate(cx - halfW, cy);
  ctx.beginPath();
  for (let i = 0; i <= points; i++) {
    const t = (i / points) * duration;
    const amp = amplitudeCurve ? getAmplitudeAtTime(amplitudeCurve, t) : 0.5;
    const x = (i / points) * stripW;
    const y = -(0.2 + 0.8 * amp) * (stripH / 2);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = waveformColor + "40";
  ctx.lineWidth = 2 * scale;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.beginPath();
  const playedIdx = duration > 0 ? Math.floor((playedT / duration) * points) : points;
  for (let i = 0; i <= playedIdx; i++) {
    const t = (i / points) * duration;
    const amp = amplitudeCurve ? getAmplitudeAtTime(amplitudeCurve, t) : 0.5;
    const x = (i / points) * stripW;
    const y = -(0.2 + 0.8 * amp) * (stripH / 2);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = waveformColor;
  ctx.lineWidth = 2.5 * scale;
  ctx.stroke();
  ctx.restore();
}

/** Minimal concentric pulse rings */
function drawWaveformPulseRings(
  ctx: CanvasRenderingContext2D,
  opts: {
    cx: number;
    cy: number;
    scale: number;
    progress: number;
    amplitude: number | null;
    waveformColor: string;
    innerR: number;
    outerR: number;
    time: number;
  }
) {
  const { cx, cy, scale, progress, amplitude, waveformColor, innerR, outerR, time } = opts;
  const ringCount = 4;
  const amp = amplitude !== null ? 0.5 + 0.5 * amplitude : 0.7;
  ctx.save();
  ctx.translate(cx, cy);
  for (let i = 0; i < ringCount; i++) {
    const phase = (i / ringCount) * Math.PI * 2 + time * 1.5;
    const pulse = Math.sin(phase) * 0.5 + 0.5;
    const r = innerR + ((outerR - innerR) / ringCount) * (i + 0.5 + pulse * amp * 0.3);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2 * progress);
    ctx.strokeStyle = waveformColor + (progress > i / ringCount ? "aa" : "40");
    ctx.lineWidth = 2 * scale;
    ctx.stroke();
  }
  ctx.restore();
}

/** Neon arc – glowing rotating arc */
function drawWaveformNeonArc(
  ctx: CanvasRenderingContext2D,
  opts: {
    cx: number;
    cy: number;
    scale: number;
    progress: number;
    amplitude: number | null;
    waveformColor: string;
    innerR: number;
    outerR: number;
    time: number;
  }
) {
  const { cx, cy, scale, amplitude, waveformColor, innerR, outerR, time } = opts;
  const r = (innerR + outerR) / 2;
  const arcLen = Math.PI * 1.2;
  const startAngle = -Math.PI / 2 + time * 0.5;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.shadowColor = waveformColor;
  ctx.shadowBlur = 20 * scale;
  ctx.beginPath();
  ctx.arc(0, 0, r, startAngle, startAngle + arcLen);
  ctx.strokeStyle = waveformColor;
  ctx.lineWidth = 6 * scale;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();
}

/** Organic morphing blob */
function drawWaveformBlob(
  ctx: CanvasRenderingContext2D,
  opts: {
    cx: number;
    cy: number;
    scale: number;
    amplitude: number | null;
    waveformColor: string;
    innerR: number;
    outerR: number;
    time: number;
  }
) {
  const { cx, cy, scale, amplitude, waveformColor, innerR, outerR, time } = opts;
  const baseR = (innerR + outerR) / 2;
  const amp = amplitude !== null ? 0.6 + 0.4 * amplitude : 0.8;
  const lobes = 6;
  const points = 60;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * Math.PI * 2 - Math.PI / 2;
    const wave = Math.sin(angle * lobes + time * 2) * 0.5 + 0.5;
    const r = baseR + (outerR - innerR) * 0.3 * wave * amp;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = waveformColor + "40";
  ctx.fill();
  ctx.strokeStyle = waveformColor;
  ctx.lineWidth = 2 * scale;
  ctx.stroke();
  ctx.restore();
}

/** DNA helix – double spiral */
function drawWaveformHelix(
  ctx: CanvasRenderingContext2D,
  opts: {
    cx: number;
    cy: number;
    width: number;
    scale: number;
    progress: number;
    duration: number;
    amplitude: number | null;
    amplitudeCurve: AmplitudeCurve | null | undefined;
    waveformColor: string;
    time: number;
    waveformScale?: number;
  }
) {
  const { cx, cy, width, scale, progress, duration, amplitude, amplitudeCurve, waveformColor, time, waveformScale = 1 } = opts;
  const stripW = Math.min(600 * scale * waveformScale, width * 0.75);
  const stripH = 80 * scale * waveformScale;
  const points = 80;
  const amp = amplitude !== null ? 0.5 + 0.5 * amplitude : 0.7;
  ctx.save();
  ctx.translate(cx - stripW / 2, cy);
  for (const sign of [1, -1]) {
    ctx.beginPath();
    for (let i = 0; i <= points; i++) {
      const t = (i / points) * duration;
      const audioAmp = amplitudeCurve ? getAmplitudeAtTime(amplitudeCurve, t) : 0.5;
      const x = (i / points) * stripW;
      const y = sign * (stripH / 2) * (0.3 + 0.7 * audioAmp * amp) * Math.sin((i / points) * Math.PI * 6 + time * 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = waveformColor + (sign > 0 ? "ff" : "99");
    ctx.lineWidth = 2.5 * scale;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  }
  ctx.restore();
}

/** Bouncing bars – classic bounce equalizer */
function drawWaveformBounce(
  ctx: CanvasRenderingContext2D,
  opts: {
    cx: number;
    cy: number;
    width: number;
    scale: number;
    progress: number;
    duration: number;
    waveformColor: string;
    amplitudeCurve: AmplitudeCurve | null | undefined;
    waveformScale?: number;
  }
) {
  const { cx, cy, width, scale, progress, duration, waveformColor, amplitudeCurve, waveformScale = 1 } = opts;
  const stripW = Math.min(700 * scale * waveformScale, width * 0.8);
  const stripH = 60 * scale * waveformScale;
  const barCount = 40;
  const barW = stripW / barCount - 2 * scale;
  const halfW = stripW / 2;
  ctx.save();
  ctx.translate(cx - halfW, cy);
  for (let i = 0; i < barCount; i++) {
    const t = duration > 0 ? (i / (barCount - 1)) * duration : 0;
    const amp = amplitudeCurve ? getAmplitudeAtTime(amplitudeCurve, t) : 0.5;
    const played = duration > 0 ? t <= progress * duration : false;
    const h = (0.2 + 0.8 * amp) * stripH * 0.5;
    const x = i * (stripW / barCount) + scale;
    ctx.fillStyle = played ? waveformColor : waveformColor + "30";
    ctx.fillRect(x, -h, barW, h * 2);
  }
  ctx.restore();
}

/** Liquid – thick flowing wave */
function drawWaveformLiquid(
  ctx: CanvasRenderingContext2D,
  opts: {
    cx: number;
    cy: number;
    width: number;
    scale: number;
    progress: number;
    duration: number;
    amplitude: number | null;
    amplitudeCurve: AmplitudeCurve | null | undefined;
    waveformColor: string;
    time: number;
    waveformScale?: number;
  }
) {
  const { cx, cy, width, scale, progress, duration, amplitude, amplitudeCurve, waveformColor, time, waveformScale = 1 } = opts;
  const stripW = Math.min(800 * scale * waveformScale, width * 0.88);
  const stripH = 100 * scale * waveformScale;
  const points = 100;
  const amp = amplitude !== null ? 0.6 + 0.4 * amplitude : 0.8;
  ctx.save();
  ctx.translate(cx - stripW / 2, cy);
  ctx.beginPath();
  ctx.moveTo(0, stripH / 2);
  for (let i = 0; i <= points; i++) {
    const t = (i / points) * duration;
    const audioAmp = amplitudeCurve ? getAmplitudeAtTime(amplitudeCurve, t) : 0.5;
    const x = (i / points) * stripW;
    const y = -(0.3 + 0.7 * audioAmp * amp) * (stripH / 2) * Math.sin((x / stripW) * Math.PI * 3 + time * 1.5);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(stripW, stripH / 2);
  ctx.closePath();
  ctx.fillStyle = waveformColor + "50";
  ctx.fill();
  ctx.strokeStyle = waveformColor;
  ctx.lineWidth = 3 * scale;
  ctx.stroke();
  ctx.restore();
}

/** Starburst – radial lines from center */
function drawWaveformStarburst(
  ctx: CanvasRenderingContext2D,
  opts: {
    cx: number;
    cy: number;
    scale: number;
    progress: number;
    amplitude: number | null;
    waveformColor: string;
    innerR: number;
    outerR: number;
    time: number;
  }
) {
  const { cx, cy, scale, progress, amplitude, waveformColor, innerR, outerR, time } = opts;
  const rayCount = 24;
  const amp = amplitude !== null ? 0.5 + 0.5 * amplitude : 0.7;
  const baseLen = outerR - innerR;
  ctx.save();
  ctx.translate(cx, cy);
  for (let i = 0; i < rayCount; i++) {
    const angle = (i / rayCount) * Math.PI * 2 - Math.PI / 2 + time * 0.3;
    const pulse = Math.sin(time * 2 + i * 0.5) * 0.5 + 0.5;
    const len = innerR + baseLen * (0.3 + 0.7 * pulse * amp);
    const isActive = (i / rayCount) < progress;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * innerR, Math.sin(angle) * innerR);
    ctx.lineTo(Math.cos(angle) * len, Math.sin(angle) * len);
    ctx.strokeStyle = isActive ? waveformColor : waveformColor + "30";
    ctx.lineWidth = 3 * scale;
    ctx.lineCap = "round";
    ctx.stroke();
  }
  ctx.restore();
}

/** Particles – scattered pulsing dots */
function drawWaveformParticles(
  ctx: CanvasRenderingContext2D,
  opts: {
    cx: number;
    cy: number;
    scale: number;
    progress: number;
    amplitude: number | null;
    waveformColor: string;
    innerR: number;
    outerR: number;
    time: number;
  }
) {
  const { cx, cy, scale, amplitude, waveformColor, innerR, outerR, time } = opts;
  const particleCount = 45;
  const amp = amplitude !== null ? 0.5 + 0.5 * amplitude : 0.7;
  const baseR = (innerR + outerR) / 2;
  ctx.save();
  ctx.translate(cx, cy);
  for (let i = 0; i < particleCount; i++) {
    const angle = (i / particleCount) * Math.PI * 2 + time * 0.5;
    const pulse = Math.sin(time * 3 + i * 0.3) * 0.5 + 0.5;
    const r = baseR + (outerR - innerR) * 0.4 * pulse * amp;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    const size = 2 + pulse * 2 * scale;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fillStyle = waveformColor + "cc";
    ctx.fill();
  }
  ctx.restore();
}

/** Ribbon – flowing ribbon wave */
function drawWaveformRibbon(
  ctx: CanvasRenderingContext2D,
  opts: {
    cx: number;
    cy: number;
    width: number;
    scale: number;
    progress: number;
    duration: number;
    amplitude: number | null;
    amplitudeCurve: AmplitudeCurve | null | undefined;
    waveformColor: string;
    time: number;
    waveformScale?: number;
  }
) {
  const { cx, cy, width, scale, progress, duration, amplitude, amplitudeCurve, waveformColor, time, waveformScale = 1 } = opts;
  const stripW = Math.min(750 * scale * waveformScale, width * 0.85);
  const ribbonH = 16 * scale * waveformScale;
  const points = 100;
  const amp = amplitude !== null ? 0.6 + 0.4 * amplitude : 0.8;
  ctx.save();
  ctx.translate(cx - stripW / 2, cy);
  ctx.beginPath();
  for (let i = 0; i <= points; i++) {
    const t = (i / points) * duration;
    const audioAmp = amplitudeCurve ? getAmplitudeAtTime(amplitudeCurve, t) : 0.5;
    const x = (i / points) * stripW;
    const y = ribbonH * amp * Math.sin((x / stripW) * Math.PI * 4 + time * 2) * (0.5 + 0.5 * audioAmp);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let i = points; i >= 0; i--) {
    const t = (i / points) * duration;
    const audioAmp = amplitudeCurve ? getAmplitudeAtTime(amplitudeCurve, t) : 0.5;
    const x = (i / points) * stripW;
    const y = ribbonH * amp * Math.sin((x / stripW) * Math.PI * 4 + time * 2) * (0.5 + 0.5 * audioAmp) + ribbonH;
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = waveformColor + "60";
  ctx.fill();
  ctx.strokeStyle = waveformColor;
  ctx.lineWidth = 1.5 * scale;
  ctx.stroke();
  ctx.restore();
}

/** Minimal – ultra-thin flowing lines */
function drawWaveformMinimal(
  ctx: CanvasRenderingContext2D,
  opts: {
    cx: number;
    cy: number;
    width: number;
    scale: number;
    amplitude: number | null;
    amplitudeCurve: AmplitudeCurve | null | undefined;
    waveformColor: string;
    time: number;
    waveformScale?: number;
  }
) {
  const { cx, cy, width, scale, amplitude, amplitudeCurve, waveformColor, time, waveformScale = 1 } = opts;
  const stripW = Math.min(650 * scale * waveformScale, width * 0.8);
  const lineCount = 3;
  const points = 60;
  const baseAmp = amplitude !== null ? 0.5 + 0.5 * amplitude : 0.7;
  const amp = 12 * scale * waveformScale * baseAmp;
  ctx.save();
  ctx.translate(cx - stripW / 2, cy);
  for (let l = 0; l < lineCount; l++) {
    ctx.beginPath();
    const audioAmp = amplitudeCurve ? getAmplitudeAtTime(amplitudeCurve, time) : 0.5;
    for (let i = 0; i <= points; i++) {
      const x = (i / points) * stripW;
      const y = amp * Math.sin((x / stripW) * Math.PI * 5 + time * 2 + l * 2) * (0.4 + 0.6 * audioAmp);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = waveformColor + (l === 0 ? "ff" : l === 1 ? "99" : "66");
    ctx.lineWidth = 1 * scale;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  }
  ctx.restore();
}

/** Stacked horizontal sine waves (modern minimal) */
function drawWaveformStacked(
  ctx: CanvasRenderingContext2D,
  opts: {
    cx: number;
    cy: number;
    width: number;
    scale: number;
    amplitude: number | null;
    waveformColor: string;
    time: number;
    waveformScale?: number;
  }
) {
  const { cx, cy, width, scale, amplitude, waveformColor, time, waveformScale = 1 } = opts;
  const stripW = Math.min(700 * scale * waveformScale, width * 0.8);
  const amp = (amplitude !== null ? 12 * scale * (0.5 + 0.5 * amplitude) : 12 * scale) * waveformScale;
  const layers = [
    { phase: 0, opacity: "ff" },
    { phase: Math.PI * 0.5, opacity: "99" },
    { phase: Math.PI, opacity: "66" },
  ];
  ctx.save();
  ctx.translate(cx - stripW / 2, cy);
  const points = 80;
  for (const layer of layers) {
    ctx.beginPath();
    for (let i = 0; i <= points; i++) {
      const x = (i / points) * stripW;
      const y = amp * Math.sin((x / stripW) * Math.PI * 4 + time * 3 + layer.phase);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = waveformColor + layer.opacity;
    ctx.lineWidth = 2.5 * scale;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  }
  ctx.restore();
}

export function drawVideoFrame(opts: DrawVideoFrameOptions): void {
  const {
    ctx,
    width,
    height,
    time,
    duration,
    branding,
    segments,
    logoImg,
    backgroundImg,
    amplitudeCurve,
  } = opts;

  const scale = width / 1920;
  const layout: VideoLayout = { ...DEFAULT_LAYOUT, ...(branding.layout ?? {}) };
  const pad = 80 * scale;
  const logoScale = layout.logo.scale ?? 1;
  const logoSize = 120 * scale * logoScale;

  if (backgroundImg) {
    ctx.save();
    const blurEnabled = branding.videoBackgroundBlurEnabled !== false;
    const overlayEnabled = branding.videoBackgroundOverlayEnabled !== false;
    const blurPx = blurEnabled ? (branding.videoBackgroundBlur ?? 12) : 0;
    const overlayAlpha = overlayEnabled ? (branding.videoBackgroundOverlay ?? 55) / 100 : 0;
    const imgW = backgroundImg.naturalWidth;
    const imgH = backgroundImg.naturalHeight;
    const scaleCover = Math.max(width / imgW, height / imgH);
    const drawW = imgW * scaleCover;
    const drawH = imgH * scaleCover;
    const x = (width - drawW) / 2;
    const y = (height - drawH) / 2;
    if (blurPx > 0) {
      ctx.filter = `blur(${Math.min(40, blurPx)}px)`;
    }
    ctx.drawImage(backgroundImg, x, y, drawW, drawH);
    ctx.filter = "none";
    if (overlayAlpha > 0) {
      ctx.fillStyle = `rgba(0,0,0,${Math.min(1, overlayAlpha)})`;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.restore();
  } else {
    const bgColor = branding.videoBackgroundColor ?? "#0a0a0a";
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);
  }

  const logoX = layout.logo.x * width;
  const logoY = layout.logo.y * height;
  if (logoImg) {
    ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
  }

  if (branding.titleVisible) {
    const titleX = layout.title.x * width;
    const titleY = layout.title.y * height;
    const titleStyle = branding.titleStyle ?? DEFAULT_TITLE_STYLE;
    const titleColor = titleStyle.color ?? branding.primaryColor;
    const titleFontSize = (titleStyle.fontSize ?? DEFAULT_TITLE_STYLE.fontSize) * scale;
    const titleWeight = titleStyle.fontWeight ?? DEFAULT_TITLE_STYLE.fontWeight;
    ctx.fillStyle = titleColor;
    ctx.font = `${titleWeight} ${titleFontSize}px ${branding.subtitleFont || "system-ui"}, sans-serif`;
    ctx.fillText(branding.podcastName, titleX, titleY);
  }

  const waveformColor = branding.waveformColor ?? branding.primaryColor;
  const cx = layout.waveform.centerX * width;
  const cy = layout.waveform.centerY * height;
  const waveformScale = layout.waveform.scale ?? 1;
  const innerR = 140 * scale * waveformScale;
  const outerR = 220 * scale * waveformScale;
  const barCount = 72;
  const progress = duration > 0 ? time / duration : 0;
  const amplitude = amplitudeCurve ? getAmplitudeAtTime(amplitudeCurve, time) : null;
  const waveformStyle: WaveformStyle = branding.waveformStyle ?? "bars";

  if (waveformStyle === "bars") {
    drawWaveformBars(ctx, { cx, cy, scale, progress, amplitude, waveformColor, innerR, outerR, barCount, time });
  } else if (waveformStyle === "dots") {
    drawWaveformDots(ctx, { cx, cy, scale, progress, amplitude, waveformColor, innerR, outerR, barCount, time });
  } else if (waveformStyle === "ring") {
    drawWaveformRing(ctx, { cx, cy, scale, progress, amplitude, waveformColor, innerR, outerR, time });
  } else if (waveformStyle === "linear") {
    drawWaveformLinear(ctx, { cx, cy, width, scale, progress, duration, waveformColor, amplitudeCurve, waveformScale });
  } else if (waveformStyle === "waves") {
    drawWaveformWaves(ctx, { cx, cy, scale, progress, amplitude, waveformColor, innerR, outerR, time });
  } else if (waveformStyle === "spectrum") {
    drawWaveformSpectrum(ctx, { cx, cy, scale, progress, amplitude, waveformColor, innerR, outerR, time, amplitudeCurve, duration });
  } else if (waveformStyle === "orb") {
    drawWaveformOrb(ctx, { cx, cy, scale, amplitude, waveformColor, innerR, outerR, time });
  } else if (waveformStyle === "ripple") {
    drawWaveformRipple(ctx, { cx, cy, scale, progress, amplitude, waveformColor, innerR, outerR, time });
  } else if (waveformStyle === "waveLine") {
    drawWaveformWaveLine(ctx, { cx, cy, width, scale, progress, duration, waveformColor, amplitudeCurve, waveformScale });
  } else if (waveformStyle === "stacked") {
    drawWaveformStacked(ctx, { cx, cy, width, scale, amplitude, waveformColor, time, waveformScale });
  } else if (waveformStyle === "equalizer") {
    drawWaveformEqualizer(ctx, { cx, cy, width, scale, progress, duration, waveformColor, amplitudeCurve, waveformScale });
  } else if (waveformStyle === "waveform") {
    drawWaveformTrace(ctx, { cx, cy, width, scale, progress, duration, waveformColor, amplitudeCurve, waveformScale });
  } else if (waveformStyle === "pulseRings") {
    drawWaveformPulseRings(ctx, { cx, cy, scale, progress, amplitude, waveformColor, innerR, outerR, time });
  } else if (waveformStyle === "neonArc") {
    drawWaveformNeonArc(ctx, { cx, cy, scale, progress, amplitude, waveformColor, innerR, outerR, time });
  } else if (waveformStyle === "blob") {
    drawWaveformBlob(ctx, { cx, cy, scale, amplitude, waveformColor, innerR, outerR, time });
  } else if (waveformStyle === "helix") {
    drawWaveformHelix(ctx, { cx, cy, width, scale, progress, duration, amplitude, amplitudeCurve, waveformColor, time, waveformScale });
  } else if (waveformStyle === "bounce") {
    drawWaveformBounce(ctx, { cx, cy, width, scale, progress, duration, waveformColor, amplitudeCurve, waveformScale });
  } else if (waveformStyle === "liquid") {
    drawWaveformLiquid(ctx, { cx, cy, width, scale, progress, duration, amplitude, amplitudeCurve, waveformColor, time, waveformScale });
  } else if (waveformStyle === "starburst") {
    drawWaveformStarburst(ctx, { cx, cy, scale, progress, amplitude, waveformColor, innerR, outerR, time });
  } else if (waveformStyle === "particles") {
    drawWaveformParticles(ctx, { cx, cy, scale, progress, amplitude, waveformColor, innerR, outerR, time });
  } else if (waveformStyle === "ribbon") {
    drawWaveformRibbon(ctx, { cx, cy, width, scale, progress, duration, amplitude, amplitudeCurve, waveformColor, time, waveformScale });
  } else if (waveformStyle === "minimal") {
    drawWaveformMinimal(ctx, { cx, cy, width, scale, amplitude, amplitudeCurve, waveformColor, time, waveformScale });
  } else if (waveformStyle === "glow") {
    drawWaveformGlow(ctx, { cx, cy, width, scale, progress, duration, amplitude, amplitudeCurve, waveformColor, time, waveformScale });
  }

  // Progress bar on the video itself (always on unless explicitly disabled)
  if (branding.progressBarVisible !== false) {
    const progressBarH = Math.max(10, 14 * scale);
    const progressBarY = layout.progressBar.y * height - progressBarH / 2;
    const barW = width - pad * 2;
    const progressWidth = duration > 0 ? (time / duration) * barW : 0;
    const trackColor = branding.primaryColor + "50";
    const fillColor = branding.primaryColor;
    ctx.fillStyle = trackColor;
    ctx.fillRect(pad, progressBarY, barW, progressBarH);
    if (progressWidth > 0) {
      ctx.fillStyle = fillColor;
      ctx.fillRect(pad, progressBarY, progressWidth, progressBarH);
    }
  }

  // Subtitle size, color, stroke, font: edit DEFAULT_SUBTITLE_STYLE in src/types/index.ts
  // or use the Branding UI (Subtitle style). Values here come from branding.subtitleStyle.
  const style = { ...DEFAULT_SUBTITLE_STYLE, ...(branding.subtitleStyle ?? {}) };
  const fontFamily = style.font || branding.subtitleFont || "system-ui";
  const fontSize = (style.fontSize ?? 42) * scale;
  const fontWeight = style.fontWeight ?? 400;
  const fontStr = `${fontWeight} ${fontSize}px ${fontFamily}, sans-serif`;
  const lineHeight = fontSize * 1.45;
  const maxWidthFraction = 0.7;
  const maxWidth = Math.max(100, width * maxWidthFraction);
  const centerX = width / 2;
  const subtitleCenterY = layout.subtitle.centerY * height;
  const strokeW = (style.strokeWidth ?? 0) * scale;
  const strokeColor = style.strokeColor ?? "#000000";

  const decorationOn = !!(style.transcriptDecoration ?? false);
  const decorationOpacity = Math.max(0, Math.min(1, (style.transcriptDecorationOpacity ?? 30) / 100));

  const drawWord = (word: string, x: number, y: number, fillColor: string, isCurrent: boolean) => {
    const text = word;
    ctx.font = fontStr;
    if (decorationOn) {
      ctx.fillStyle = isCurrent ? "#ffffff" : `rgba(255,255,255,${decorationOpacity})`;
    } else {
      ctx.fillStyle = fillColor;
    }
    if (strokeW > 0) {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeW;
      ctx.lineJoin = "round";
      ctx.strokeText(text, x, y);
    }
    ctx.fillText(text, x, y);
  };

  const phraseData = getPhraseAndCurrentWord(segments, time);
  if (phraseData) {
    const { words, currentIndex } = phraseData;
    const displayWords = words.map((w) => (style.uppercase ? w.toUpperCase() : w));
    ctx.font = fontStr;
    const subtitleMaxLines = 4;
    const { words: visibleWords, localCurrentIndex } = getVisibleWordWindow(ctx, displayWords, currentIndex, maxWidth, subtitleMaxLines);
    const linesOfWords = wrapWordsIntoLines(ctx, visibleWords, maxWidth, subtitleMaxLines);
    let wordIdx = 0;
    let currentLineIdx = -1;
    let currentWordInLine = -1;
    for (let li = 0; li < linesOfWords.length; li++) {
      for (let wi = 0; wi < linesOfWords[li].length; wi++) {
        if (wordIdx === localCurrentIndex) {
          currentLineIdx = li;
          currentWordInLine = wi;
        }
        wordIdx++;
      }
    }
    const totalLines = linesOfWords.length;
    const startY = subtitleCenterY - (totalLines * lineHeight) / 2 + lineHeight / 2;

    const spaceWidth = ctx.measureText(" ").width;
    ctx.textAlign = "center";
    for (let li = 0; li < linesOfWords.length; li++) {
      const lineWords = linesOfWords[li];
      const wordWidths = lineWords.map((w) => ctx.measureText(w).width + spaceWidth);
      ctx.font = fontStr;
      const totalLineWidth = wordWidths.reduce((a, b) => a + b, 0) - spaceWidth;
      let x = centerX - totalLineWidth / 2;
      const y = startY + li * lineHeight;

      for (let wi = 0; wi < lineWords.length; wi++) {
        const word = lineWords[wi];
        const isCurrent = li === currentLineIdx && wi === currentWordInLine;
        const wordOnlyWidth = wordWidths[wi] - spaceWidth;
        x += wordOnlyWidth / 2;
        const fillColor = isCurrent ? (style.highlightColor ?? branding.primaryColor) : (style.color ?? "#ffffff");
        drawWord(word, x, y, fillColor, isCurrent);
        x += wordOnlyWidth / 2 + spaceWidth;
      }
    }
    ctx.textAlign = "left";
  } else {
    const subtitle = getCurrentSubtitle(segments, time);
    if (subtitle) {
      ctx.font = fontStr;
      const source = style.uppercase ? subtitle.toUpperCase() : subtitle;
      const allLines = wrapText(ctx, source, maxWidth);
      const maxLines = 4;
      const lines = allLines.slice(0, maxLines);
      while (lines.length < 2) lines.push("");
      const lineCount = lines.length;
      const startY = subtitleCenterY - (lineCount * lineHeight) / 2 + lineHeight / 2;
      ctx.textAlign = "center";
      for (let i = 0; i < lineCount; i++) {
        const line = lines[i] ?? "";
        const y = startY + i * lineHeight;
        if (line) {
          if (strokeW > 0) {
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = strokeW;
            ctx.lineJoin = "round";
            ctx.strokeText(line, centerX, y);
          }
          ctx.fillStyle = decorationOn ? `rgba(255,255,255,${decorationOpacity})` : (style.color ?? "#ffffff");
          ctx.fillText(line, centerX, y);
        }
      }
      ctx.textAlign = "left";
    }
  }
}
