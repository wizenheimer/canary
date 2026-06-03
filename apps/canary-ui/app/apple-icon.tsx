import { ImageResponse } from "next/og";

// The apple touch / PWA icon: the lime "spark" mark on the dark brand tile.
export const size = { height: 180, width: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#0a0a0a",
        display: "flex",
        height: "100%",
        justifyContent: "center",
        width: "100%",
      }}
    >
      <div
        style={{
          background: "#e4f222",
          borderRadius: 9999,
          height: 84,
          width: 84,
        }}
      />
    </div>,
    { ...size }
  );
}
