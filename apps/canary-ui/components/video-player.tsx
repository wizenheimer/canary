"use client";

import { useEffect, useRef } from "react";
import videojs from "video.js";
import "video.js/dist/video-js.css";

type VideoJsPlayer = ReturnType<typeof videojs>;

// Video.js React wrapper following the official pattern: a <video-js> node is
// created imperatively (so React never owns Video.js's DOM) and disposed on
// unmount. The /api/artifact route serves byte ranges, so the scrubber seeks.
export function VideoPlayer({ src, type }: { src: string; type?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<VideoJsPlayer | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    const el = document.createElement("video-js");
    el.classList.add("vjs-big-play-centered");
    host.appendChild(el);
    const player = videojs(el, {
      controls: true,
      fluid: true,
      playbackRates: [0.5, 1, 1.5, 2],
      preload: "metadata",
      sources: [{ src, type: type ?? "video/webm" }],
    });
    playerRef.current = player;

    return () => {
      if (!player.isDisposed()) {
        player.dispose();
      }
      playerRef.current = null;
    };
  }, [src, type]);

  return (
    <div
      className="overflow-hidden rounded-lg border border-border"
      data-vjs-player
    >
      <div ref={hostRef} />
    </div>
  );
}
