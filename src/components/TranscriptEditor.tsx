"use client";

import { useCallback, useEffect, useState } from "react";
import { segmentsToSrt, srtToSegments, removeFillersFromSegments } from "@/lib/srt";
import type { SubtitleSegment } from "@/types";
import InfoTooltip from "@/components/InfoTooltip";

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface TranscriptEditorProps {
  segments: SubtitleSegment[];
  onChange: (segments: SubtitleSegment[]) => void;
  audioDuration?: number | null;
}

export default function TranscriptEditor({ segments, onChange, audioDuration }: TranscriptEditorProps) {
  const [srtText, setSrtText] = useState("");
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setSrtText(segmentsToSrt(segments));
    setIsDirty(false);
  }, [segments]);

  const handleApply = useCallback(() => {
    try {
      const parsed = srtToSegments(srtText);
      if (parsed.length > 0) {
        onChange(parsed);
        setIsDirty(false);
      }
    } catch {
      /* keep previous */
    }
  }, [srtText, onChange]);

  const segmentsToCheck = isDirty ? (() => {
    try {
      return srtToSegments(srtText);
    } catch {
      return segments;
    }
  })() : segments;
  const maxSegmentEnd = segmentsToCheck.length > 0
    ? Math.max(...segmentsToCheck.map((s) => s.end))
    : 0;
  const segmentsBeyondAudio = audioDuration != null && audioDuration > 0 && maxSegmentEnd > audioDuration + 1;

  const handleRemoveFillers = useCallback(() => {
    const filtered = removeFillersFromSegments(segments);
    onChange(filtered);
  }, [segments, onChange]);

  const handleDownload = useCallback(() => {
    const srt = isDirty ? srtText : segmentsToSrt(segments);
    const blob = new Blob([srt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transcription.srt";
    a.click();
    URL.revokeObjectURL(url);
  }, [segments, srtText, isDirty]);

  if (segments.length === 0) return null;

  return (
    <div className="space-y-3">
      {isDirty && (
        <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-100 text-amber-800 text-sm flex items-start gap-2">
          <InfoTooltip label="Unsaved edits">
            These transcript changes are local to this editor until you click &quot;Apply edits&quot;. Applying updates the preview and exported video.
          </InfoTooltip>
          <p>
            <strong className="font-semibold">Unsaved edits.</strong> Click &quot;Apply edits&quot; below to use these subtitles in the video preview and export.
          </p>
        </div>
      )}
      {segmentsBeyondAudio && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm flex items-start gap-2">
          <InfoTooltip label="Subtitle timing">
            One or more subtitle entries end after the audio file does. Adjust the SRT timings or trim the audio so everything fits inside the episode.
          </InfoTooltip>
          <p>
            Some subtitles are timed <strong>after the audio ends</strong> (last at {formatTime(maxSegmentEnd)}, audio is {formatTime(audioDuration)}). They will not appear in the video. Use an SRT that matches your audio length, or trim your audio.
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 mt-10">
        <span className="text-xs font-normal text-slate-600">
          Edit the transcript below. <br />Click Apply to sync subtitles with the preview and export.
        </span>
        <button
          type="button"
          onClick={handleRemoveFillers}
          className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-amber-600/30 text-white text-xs font-medium transition-colors"
        >
          Remove fillers (um, uh, like…)
        </button>
        <button
          type="button"
          onClick={handleApply}
          disabled={!isDirty}
          className="px-3 py-1.5 rounded-lg bg-indigo-800 hover:bg-indigo-500 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
        >
          Apply edits
        </button>
        <button
          type="button"
          onClick={handleDownload}
          className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-600 text-zinc-200 text-xs font-medium transition-colors"
        >
          Download SRT
        </button>
      </div>
      <textarea
        value={srtText}
        onChange={(e) => {
          setSrtText(e.target.value);
          setIsDirty(true);
        }}
        className="w-full h-64 px-4 py-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-sm font-mono resize-y focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none placeholder-slate-400"
        placeholder="SRT transcript..."
        spellCheck={true}
      />
    </div>
  );
}
