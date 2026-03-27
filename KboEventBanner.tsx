import React, { useRef, useEffect, useState, useCallback } from "react";

const Heart = ({ size = 40, style }: { size?: number; style?: React.CSSProperties }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#FF3D6E" style={style}>
    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
  </svg>
);

const FlipIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
    <path d="M20 5h-3.17L15 3H9L7.17 5H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-5 11.5V14H9v2.5L5.5 13 9 9.5V12h6V9.5l3.5 3.5-3.5 3.5z" />
  </svg>
);

const MIN_ZOOM = 1, MAX_ZOOM = 5, ZOOM_STEP = 0.5;

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });

const iconBtn: React.CSSProperties = {
  width: "40px", height: "40px", borderRadius: "50%", border: "none",
  background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center",
  justifyContent: "center", cursor: "pointer",
  WebkitTapHighlightColor: "transparent", backdropFilter: "blur(6px)",
};

export default function KboEventBanner() {
  const videoRef      = useRef<HTMLVideoElement>(null);
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const streamRef     = useRef<MediaStream | null>(null);
  const cameraAreaRef = useRef<HTMLDivElement>(null);
  const containerRef  = useRef<HTMLDivElement>(null);
  const leftPanelRef  = useRef<HTMLDivElement>(null);

  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraError,   setCameraError]   = useState<string | null>(null);
  const [isCapturing,   setIsCapturing]   = useState(false);
  const [countdown,     setCountdown]     = useState<number | null>(null);
  const [flash,         setFlash]         = useState(false);
  const [facingMode,    setFacingMode]    = useState<"user" | "environment">("user");
  const [zoom,          setZoom]          = useState(1);
  const [hwZoomRange,   setHwZoomRange]   = useState<{ min: number; max: number } | null>(null);

  // ── 카메라 시작 ──────────────────────────────
  const startCamera = useCallback(async (mode: "user" | "environment") => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setCameraError(null); setZoom(1); setHwZoomRange(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode,
          width:     { ideal: 4096 },
          height:    { ideal: 2160 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      const caps = stream.getVideoTracks()[0].getCapabilities() as MediaTrackCapabilities & { zoom?: { min: number; max: number } };
      if (caps.zoom) setHwZoomRange({ min: caps.zoom.min, max: caps.zoom.max });
    } catch { setCameraError("카메라 접근 권한이 필요합니다."); }
  }, []);

  useEffect(() => {
    startCamera(facingMode);
    return () => streamRef.current?.getTracks().forEach((t) => t.stop());
  }, [facingMode, startCamera]);

  // ── 가로 강제 ────────────────────────────────
  useEffect(() => {
    const ori = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void>; unlock?: () => void };
    ori.lock?.("landscape").catch(() => {});
    return () => ori.unlock?.();
  }, []);

  // ── 줌 ───────────────────────────────────────
  const applyZoom = useCallback((next: number) => {
    const v = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    setZoom(v);
    const track = streamRef.current?.getVideoTracks()[0];
    if (track && hwZoomRange) {
      const hw = hwZoomRange.min + ((v - 1) / (MAX_ZOOM - 1)) * (hwZoomRange.max - hwZoomRange.min);
      track.applyConstraints({ advanced: [{ zoom: hw } as MediaTrackConstraintSet] }).catch(() => {});
    }
  }, [hwZoomRange]);

  // ── 핀치 줌 ──────────────────────────────────
  useEffect(() => {
    const el = cameraAreaRef.current;
    if (!el) return;
    let startDist = 0, startZoom = 1;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = (e: TouchEvent) => { if (e.touches.length === 2) { startDist = dist(e.touches); startZoom = zoom; } };
    const onMove  = (e: TouchEvent) => { if (e.touches.length === 2) { e.preventDefault(); applyZoom(startZoom * dist(e.touches) / startDist); } };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove",  onMove,  { passive: false });
    return () => { el.removeEventListener("touchstart", onStart); el.removeEventListener("touchmove", onMove); };
  }, [zoom, applyZoom]);

  const isFront = facingMode === "user";
  const cssZoom = hwZoomRange ? 1 : zoom;

  // ── 촬영 ─────────────────────────────────────
  const capture = useCallback(() => {
    if (isCapturing) return;
    setIsCapturing(true); setCountdown(3);
    let count = 3;
    const timer = setInterval(() => {
      count -= 1;
      if (count > 0) { setCountdown(count); return; }
      clearInterval(timer); setCountdown(null);
      setFlash(true); setTimeout(() => setFlash(false), 300);
      const video = videoRef.current, canvas = canvasRef.current;
      if (video && canvas) {
        const scale = hwZoomRange ? 1 : zoom;
        const sw = video.videoWidth / scale, sh = video.videoHeight / scale;
        const sx = (video.videoWidth - sw) / 2, sy = (video.videoHeight - sh) / 2;
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d")!;
        if (isFront) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        setCapturedImage(canvas.toDataURL("image/png"));
      }
      setIsCapturing(false);
    }, 1000);
  }, [isCapturing, isFront, zoom, hwZoomRange]);

  const retake = () => { setCapturedImage(null); setZoom(1); };

  // ── 전체 합성 저장 ────────────────────────────
  const download = useCallback(async () => {
    if (!capturedImage || !containerRef.current || !leftPanelRef.current) return;
    const OUTPUT_W = 4000;
    const OUTPUT_H = 3000;
    const layoutTotalW = containerRef.current.offsetWidth;
    const layoutLeftW = leftPanelRef.current.offsetWidth;
    const leftRatio = layoutTotalW > 0 ? layoutLeftW / layoutTotalW : 0.4;
    const totalW = OUTPUT_W;
    const totalH = OUTPUT_H;
    const leftW = Math.round(totalW * leftRatio);
    const rightW = totalW - leftW;
    const out = document.createElement("canvas");
    out.width = totalW;
    out.height = totalH;
    const ctx = out.getContext("2d")!;

    const grad = ctx.createLinearGradient(0, 0, 0, totalH);
    grad.addColorStop(0, "#87CEEB"); grad.addColorStop(0.6, "#B8E6FF"); grad.addColorStop(1, "#C8EBFF");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, leftW, totalH);

    await document.fonts.ready;
    const pad = 14, fsize = Math.min(38, leftW * 0.19);
    ctx.font = `900 ${fsize}px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif`;
    ctx.fillStyle = "#2D7A2D"; ctx.fillText("컬러즈", pad, pad + fsize);
    const my = pad + fsize + 6, mw = ctx.measureText("만루홈런").width + 8;
    ctx.fillStyle = "#FFE135";
    ctx.save(); ctx.translate(pad - 3 + mw / 2, my + fsize / 2); ctx.rotate(-0.017);
    ctx.fillRect(-mw / 2 - 2, -fsize / 2 + 3, mw + 4, fsize - 3); ctx.restore();
    ctx.fillStyle = "#1A4A1A"; ctx.fillText("만루홈런", pad, my + fsize);
    const subY = my + fsize + 14;
    ctx.font = `600 ${Math.round(fsize * 0.26)}px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif`;
    ctx.fillStyle = "#333";
    ctx.fillText("4주차 KBO 개막전 게더링", pad, subY);
    ctx.fillText("삼성 vs 롯데", pad, subY + fsize * 0.32);

    try {
      const pl = await loadImage("/baseball-player.png");
      const ih = Math.min(totalH * 0.65, leftW * 1.1);
      const iw = (pl.width / pl.height) * ih;
      ctx.drawImage(pl, (leftW - iw) / 2, totalH - ih, iw, ih);
    } catch { /* 무시 */ }

    const cam = await loadImage(capturedImage);
    const srcAR = cam.width / cam.height, dstAR = rightW / totalH;
    let sx = 0, sy = 0, sw = cam.width, sh = cam.height;
    if (srcAR > dstAR) { sw = cam.height * dstAR; sx = (cam.width - sw) / 2; }
    else               { sh = cam.width  / dstAR; sy = (cam.height - sh) / 2; }
    ctx.drawImage(cam, sx, sy, sw, sh, leftW, 0, rightW, totalH);

    const a = document.createElement("a");
    a.href = out.toDataURL("image/png");
    a.download = `colorz-kisscam-${Date.now()}.png`;
    a.click();
  }, [capturedImage]);

  return (
    <div ref={containerRef} style={{
      width: "100%", height: "100dvh",
      display: "flex", flexDirection: "row",
      background: "#000",
      fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif",
      overflow: "hidden",
    }}>

      {/* ── 왼쪽 배너 ── */}
      <div ref={leftPanelRef} style={{
        width: "40%", maxWidth: "320px", height: "100%",
        background: "linear-gradient(180deg, #87CEEB 0%, #B8E6FF 60%, #C8EBFF 100%)",
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        position: "relative", overflow: "hidden", flexShrink: 0,
      }}>
        <div style={{ padding: "14px 12px 0", zIndex: 2, position: "relative" }}>
          <div style={{ fontSize: "clamp(24px, 5.5vw, 38px)", fontWeight: 900, color: "#2D7A2D", lineHeight: 1, letterSpacing: "-1px" }}>
            컬러즈
          </div>
          <div style={{ position: "relative", display: "inline-block", marginTop: "4px" }}>
            <div style={{ position: "absolute", top: "3px", left: "-3px", right: "-3px", bottom: "3px", background: "#FFE135", borderRadius: "4px", transform: "rotate(-1deg) skewX(-2deg)" }} />
            <div style={{ fontSize: "clamp(24px, 5.5vw, 38px)", fontWeight: 900, color: "#1A4A1A", lineHeight: 1, letterSpacing: "-1px", position: "relative", padding: "0 4px" }}>
              만루홈런
            </div>
          </div>
          <div style={{ fontSize: "9px", fontWeight: 600, color: "#333", marginTop: "8px", lineHeight: 1.6 }}>
            4주차 KBO 개막전 게더링<br />삼성 vs 롯데
          </div>
        </div>
        <img src="/baseball-player.png" alt="player" style={{
          width: "100%", objectFit: "contain", objectPosition: "bottom center",
          filter: "drop-shadow(4px 2px 6px rgba(0,0,0,0.2))", zIndex: 1,
        }} />
      </div>

      {/* ── 오른쪽: 카메라가 전체를 채움 ── */}
      <div ref={cameraAreaRef} style={{
        flex: 1, position: "relative", overflow: "hidden", background: "#000",
        boxShadow: "inset 0 0 0 10px #87CEEB",
      }}>

        {/* 카메라 에러 */}
        {cameraError && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#aaa" }}>
            <div style={{ fontSize: "40px", marginBottom: "10px" }}>📷</div>
            <div style={{ fontSize: "13px" }}>{cameraError}</div>
          </div>
        )}

        {/* 라이브 비디오 */}
        {!capturedImage && (
          <video ref={videoRef} autoPlay playsInline muted style={{
            position: "absolute", inset: 0,
            width: "100%", height: "100%", objectFit: "cover",
            transform: `scaleX(${isFront ? -cssZoom : cssZoom}) scaleY(${cssZoom})`,
            transformOrigin: "center center",
            display: cameraError ? "none" : "block",
            transition: "transform 0.1s",
          }} />
        )}

        {/* 촬영 사진 */}
        {capturedImage && (
          <img src={capturedImage} alt="captured" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        )}

        {/* 플래시 */}
        {flash && <div style={{ position: "absolute", inset: 0, background: "white", opacity: 0.9, pointerEvents: "none", zIndex: 10 }} />}

        {/* ── 라이브 오버레이 ── */}
        {!capturedImage && !cameraError && (
          <>
            {/* 코너 프레임 */}
            {(["tl","tr","bl","br"] as const).map((c) => (
              <div key={c} style={{
                position: "absolute", width: "28px", height: "28px",
                borderColor: "#2563EB", borderStyle: "solid", borderWidth: 0, zIndex: 2,
                ...(c === "tl" && { top: 12, left: 12, borderTopWidth: 3, borderLeftWidth: 3 }),
                ...(c === "tr" && { top: 12, right: 12, borderTopWidth: 3, borderRightWidth: 3 }),
                ...(c === "bl" && { bottom: 70, left: 12, borderBottomWidth: 3, borderLeftWidth: 3 }),
                ...(c === "br" && { bottom: 70, right: 12, borderBottomWidth: 3, borderRightWidth: 3 }),
              }} />
            ))}

            {/* LIVE 뱃지 */}
            <div style={{
              position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
              background: "#FF3D6E", color: "#fff", fontSize: "10px", fontWeight: 800,
              padding: "3px 10px", borderRadius: "20px", letterSpacing: "2px",
              display: "flex", alignItems: "center", gap: "5px", zIndex: 2,
            }}>
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#fff", animation: "pulse 1.2s infinite" }} />
              LIVE
            </div>

            <Heart size={26} style={{ position: "absolute", bottom: 70, left: 14, opacity: 0.7, zIndex: 2 }} />
            <Heart size={18} style={{ position: "absolute", bottom: 92, left: 36, opacity: 0.45, zIndex: 2 }} />

            {/* 우측 세로 컨트롤 (전환 + 줌) */}
            <div style={{
              position: "absolute", top: 10, right: 10, zIndex: 3,
              display: "flex", flexDirection: "column", gap: "8px", alignItems: "center",
            }}>
              <button onClick={() => { if (!isCapturing) { setCapturedImage(null); setFacingMode(p => p === "user" ? "environment" : "user"); } }} style={iconBtn}>
                <FlipIcon />
              </button>
              <button onClick={() => applyZoom(zoom + ZOOM_STEP)} disabled={zoom >= MAX_ZOOM} style={{ ...iconBtn, opacity: zoom >= MAX_ZOOM ? 0.3 : 1 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/><path d="M12 10h-2v2H9v-2H7V9h2V7h1v2h2v1z"/></svg>
              </button>
              <div style={{ color: "#fff", fontSize: "10px", fontWeight: 700, background: "rgba(0,0,0,0.5)", borderRadius: "10px", padding: "3px 6px", textAlign: "center", backdropFilter: "blur(4px)" }}>
                {zoom.toFixed(1)}×
              </div>
              <button onClick={() => applyZoom(zoom - ZOOM_STEP)} disabled={zoom <= MIN_ZOOM} style={{ ...iconBtn, opacity: zoom <= MIN_ZOOM ? 0.3 : 1 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/><path d="M7 9h5v1H7z"/></svg>
              </button>
            </div>

            {/* 하단 중앙: 셔터 버튼 */}
            <div style={{
              position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
              zIndex: 3,
            }}>
              <button
                onClick={capture}
                disabled={isCapturing || !!cameraError}
                style={{
                  width: "60px", height: "60px", borderRadius: "50%",
                  border: "4px solid rgba(255,255,255,0.9)",
                  background: "rgba(255,255,255,0.15)",
                  backdropFilter: "blur(6px)",
                  cursor: isCapturing ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: "0 0 0 2px rgba(255,61,110,0.6), 0 4px 20px rgba(0,0,0,0.4)",
                  WebkitTapHighlightColor: "transparent",
                  transition: "all 0.15s",
                }}
              >
                <div style={{
                  width: "44px", height: "44px", borderRadius: "50%",
                  background: isCapturing ? "rgba(255,255,255,0.4)" : "#FF3D6E",
                  transition: "background 0.15s",
                  boxShadow: isCapturing ? "none" : "0 0 12px rgba(255,61,110,0.7)",
                }} />
              </button>
            </div>
          </>
        )}

        {/* 카운트다운 */}
        {countdown !== null && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)", zIndex: 5 }}>
            <span style={{ fontSize: "clamp(100px, 22vw, 160px)", fontWeight: 900, color: "#FF3D6E", textShadow: "0 0 60px rgba(255,61,110,0.8)", lineHeight: 1, animation: "popIn 0.2s ease-out" }}>
              {countdown}
            </span>
          </div>
        )}

        {/* ── 촬영 후 오버레이 ── */}
        {capturedImage && (
          <>
            {/* 상단 하트 */}
            <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", fontSize: "28px", display: "flex", gap: "6px", zIndex: 3 }}>
              ❤️❤️❤️
            </div>

            {/* 하단 버튼들 */}
            <div style={{
              position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
              display: "flex", gap: "12px", zIndex: 3,
            }}>
              <button onClick={retake} style={{
                padding: "11px 24px", borderRadius: "40px",
                border: "2px solid rgba(255,255,255,0.8)",
                background: "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)",
                color: "#fff", fontSize: "14px", fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit",
                WebkitTapHighlightColor: "transparent",
              }}>다시 찍기</button>
              <button onClick={download} style={{
                padding: "11px 24px", borderRadius: "40px",
                border: "none", background: "#FF3D6E", color: "#fff",
                fontSize: "14px", fontWeight: 700, cursor: "pointer",
                fontFamily: "inherit",
                boxShadow: "0 4px 20px rgba(255,61,110,0.5)",
                WebkitTapHighlightColor: "transparent",
              }}>💾 저장하기</button>
            </div>
          </>
        )}
      </div>

      <canvas ref={canvasRef} style={{ display: "none" }} />

      <style>{`
        @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:0.2} }
        @keyframes popIn   { from{transform:scale(0.5);opacity:0} to{transform:scale(1);opacity:1} }
      `}</style>
    </div>
  );
}
