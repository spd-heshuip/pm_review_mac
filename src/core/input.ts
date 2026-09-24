import { hasMaterial, type TaskInput } from "./prompt.js";

export interface ImageAttachment {
  dataBase64: string;
  mimeType: string;
  byteLength: number;
}

const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export class SubmissionError extends Error {}

export function validateSubmission(input: TaskInput, images: ImageAttachment[]): void {
  if (!hasMaterial(input)) {
    throw new SubmissionError("至少填写一项：需求 ID、TAPD 链接、正文或功能入口");
  }
  if (images.length > MAX_IMAGES) {
    throw new SubmissionError("最多 5 张截图");
  }
  for (const image of images) {
    if (!IMAGE_MIME_TYPES.has(image.mimeType)) {
      throw new SubmissionError("截图只支持 png、jpeg、gif、webp");
    }
    if (image.byteLength > MAX_IMAGE_BYTES) {
      throw new SubmissionError("单张截图不能超过 15 MB");
    }
  }
}
