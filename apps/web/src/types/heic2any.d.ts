declare module "heic2any" {
  type HeicConvertOptions = {
    blob: Blob;
    toType?: string;
    quality?: number;
  };

  function heic2any(options: HeicConvertOptions): Promise<Blob | Blob[]>;

  export default heic2any;
}
