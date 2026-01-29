/**
 * 文件处理工具函数
 */

/**
 * 将文件转换为 base64 格式
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * 验证图片文件
 * @returns { valid: boolean; error?: string }
 */
export function validateImageFile(file: File): { valid: boolean; error?: string } {
  const isImage = file.type.startsWith('image/');
  if (!isImage) {
    return { valid: false, error: '只能上传图片文件（支持 JPG、PNG 等格式）' };
  }

  const isLt2M = file.size / 1024 / 1024 < 2;
  if (!isLt2M) {
    const fileSizeMB = (file.size / 1024 / 1024).toFixed(2);
    return { valid: false, error: `图片大小不能超过 2MB，当前文件大小为 ${fileSizeMB}MB` };
  }

  return { valid: true };
}
