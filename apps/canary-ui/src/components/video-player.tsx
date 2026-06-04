// Native <video> replaces the Video.js wrapper (~150 KB gz of player code).
// The /api/artifact route serves byte ranges, so the scrubber seeks natively,
// and the built-in controls menu covers playback speed in Chromium, Firefox,
// and Safari. `key={src}` remounts the element per source, mirroring the old
// dispose-and-recreate behavior on artifact changes.
export function VideoPlayer({ src, type }: { src: string; type?: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-black">
      {/* biome-ignore lint/a11y/useMediaCaption: recordings have no dialogue — they're silent browser-session captures. */}
      <video
        className="block max-h-[70vh] w-full"
        controls
        key={src}
        preload="metadata"
      >
        <source src={src} type={type ?? "video/webm"} />
      </video>
    </div>
  );
}
