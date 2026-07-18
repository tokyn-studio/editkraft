import {
  createElement,
  type CSSProperties,
  type ImgHTMLAttributes,
  type ReactNode,
  type VideoHTMLAttributes,
} from "react";
import { imageFrameStyles, type EkMediaValue } from "@editkraft/schema";

export interface EkMediaProps {
  /** Wert eines ekImage-Feldes — Bild ODER Video (siehe EkMediaValue). */
  value: EkMediaValue;
  className?: string;
  style?: CSSProperties;
  /** Zusätzliche <img>-Attribute (nur bei kind !== "video"). */
  imgProps?: ImgHTMLAttributes<HTMLImageElement>;
  /** Zusätzliche <video>-Attribute (nur bei kind === "video"). */
  videoProps?: VideoHTMLAttributes<HTMLVideoElement>;
}

/**
 * Rendert den Wert eines ekImage-FELDES als Bild oder Video. Agenturen ersetzen
 * ihr `<img …>` durch `<EkMedia value={props.field} …/>`; danach kann der
 * Redakteur dasselbe Feld frei zwischen Bild und Video umschalten.
 *
 * - `kind !== "video"` → `<img>` (Default; bestehende Werte ohne `kind` sind Bilder).
 * - `kind === "video"` → `<video muted loop autoplay playsinline>`; Ton bleibt
 *   stumm (muted ist Pflicht für Autoplay), Steuerelemente nur bei `controls === true`.
 *
 * Ist `value.frame` gesetzt, wird das Medium exakt wie ein gerahmtes Bild
 * dargestellt (imageFrameStyles: quadratischer Container + object-fit/-position),
 * identisch in Preview und veröffentlichter Seite. SSR-tauglich, keine Hooks.
 */
export function EkMedia({
  value,
  className,
  style,
  imgProps,
  videoProps,
}: EkMediaProps): ReactNode {
  const isVideo = value.kind === "video";
  const frame = value.frame;

  if (frame) {
    const styles = imageFrameStyles(frame);
    const containerStyle: CSSProperties = { ...(styles.container as CSSProperties), ...style };
    const mediaStyle = styles.image as CSSProperties;
    return createElement(
      "div",
      { className, style: containerStyle },
      isVideo
        ? videoElement(value, undefined, mediaStyle, videoProps)
        : imgElement(value, undefined, mediaStyle, imgProps),
    );
  }

  return isVideo
    ? videoElement(value, className, style, videoProps)
    : imgElement(value, className, style, imgProps);
}

function imgElement(
  value: EkMediaValue,
  className: string | undefined,
  style: CSSProperties | undefined,
  imgProps: ImgHTMLAttributes<HTMLImageElement> | undefined,
): ReactNode {
  return createElement("img", {
    src: value.url,
    alt: value.alt ?? "",
    ...(className !== undefined ? { className } : {}),
    ...(style !== undefined ? { style } : {}),
    ...imgProps,
  });
}

function videoElement(
  value: EkMediaValue,
  className: string | undefined,
  style: CSSProperties | undefined,
  videoProps: VideoHTMLAttributes<HTMLVideoElement> | undefined,
): ReactNode {
  return createElement("video", {
    src: value.url,
    ...(value.poster ? { poster: value.poster } : {}),
    muted: true,
    loop: true,
    autoPlay: true,
    playsInline: true,
    controls: value.controls === true,
    ...(className !== undefined ? { className } : {}),
    ...(style !== undefined ? { style } : {}),
    ...videoProps,
  });
}
