declare module "html-to-image" {
  export function toPng(
    node: HTMLElement,
    options?: {
      width?: number;
      height?: number;
      style?: Partial<CSSStyleDeclaration>;
      backgroundColor?: string;
      pixelRatio?: number;
      cacheBust?: boolean;
    }
  ): Promise<string>;

  export function toSvg(
    node: HTMLElement,
    options?: Record<string, unknown>
  ): Promise<string>;

  export function toJpeg(
    node: HTMLElement,
    options?: {
      quality?: number;
      backgroundColor?: string;
      width?: number;
      height?: number;
      style?: Partial<CSSStyleDeclaration>;
      pixelRatio?: number;
      cacheBust?: boolean;
    }
  ): Promise<string>;

  export function toBlob(
    node: HTMLElement,
    options?: Record<string, unknown>
  ): Promise<Blob | null>;

  export function getFontEmbedCSS(node: HTMLElement): Promise<string>;
}
