"use client";

import { useCallback } from "react";
import InfoTooltip from "@/components/InfoTooltip";

const ACCEPTED_TYPES = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/mp4", "audio/x-m4a"];
const ACCEPTED_EXTENSIONS = [".mp3", ".wav", ".m4a"];

function isAcceptedFile(file: File): boolean {
  if (ACCEPTED_TYPES.includes(file.type)) return true;
  const name = file.name?.toLowerCase() ?? "";
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

interface AudioUploaderProps {
  onFileSelect: (file: File) => void;
  isProcessing?: boolean;
  /** Display name of the currently loaded file (e.g. from parent state). */
  fileName?: string | null;
}

export default function AudioUploader({ onFileSelect, isProcessing, fileName }: AudioUploaderProps) {
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (isProcessing) return;
      const file = e.dataTransfer.files[0];
      if (file && isAcceptedFile(file)) {
        onFileSelect(file);
      }
    },
    [onFileSelect, isProcessing]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && isAcceptedFile(file)) {
        onFileSelect(file);
      }
    },
    [onFileSelect]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div className="space-y-3">
      <label
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className={`
          flex flex-col items-center justify-center w-full min-h-[12rem] border border-dashed rounded-2xl
          cursor-pointer transition-all duration-200 bg-white
          ${isProcessing
            ? "opacity-60 cursor-not-allowed border-slate-200"
            : "border-slate-300 hover:border-slate-400 hover:bg-slate-50 shadow-sm"}
        `}
      >
        <input
          type="file"
          accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4"
          onChange={handleChange}
          disabled={isProcessing}
          className="hidden"
        />
        <svg
          className="w-11 h-11 mb-3 text-slate-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        <span className="text-sm text-slate-900 mb-1 font-medium">
          {isProcessing ? "Processing…" : fileName ? "Replace audio or drop another file" : "Drop audio file here or click to choose"}
        </span>
        <span className="text-xs text-slate-500">
          {fileName ? (
            <span className="font-medium text-slate-700">{fileName}</span>
          ) : (
            "Optimized for MP3, WAV, or M4A"
          )}
        </span>
      </label>
      <div className="flex items-center gap-2 text-[11px] text-slate-500">
        <InfoTooltip label="Recommended audio">
          Use a final mix (not raw microphone feed) for the cleanest subtitles and visuals. Very long files may take more time to process.
        </InfoTooltip>
        <span>Recommended: 44.1 kHz or 48 kHz stereo exports.</span>
      </div>
    </div>
  );
}
