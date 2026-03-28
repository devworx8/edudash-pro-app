import { Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { toast } from '@/components/ui/ToastProvider';
import { ensureImageLibraryPermission } from '@/lib/utils/mediaLibrary';

export interface ComposerAttachmentItem {
  uri: string;
  mimeType: string;
  name?: string;
  size?: number;
  webFile?: Blob;
}

export const COMPOSER_IMAGE_ASPECT: [number, number] = [4, 3];

const getImageDimensions = (uri: string): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (error) => reject(error),
    );
  });

export const centerCropToAspect = async (uri: string, aspect: [number, number]): Promise<string> => {
  try {
    const { width, height } = await getImageDimensions(uri);
    if (!width || !height) return uri;

    const targetRatio = aspect[0] / aspect[1];
    const currentRatio = width / height;

    let cropWidth = width;
    let cropHeight = height;

    if (currentRatio > targetRatio) {
      cropWidth = Math.max(1, Math.round(height * targetRatio));
    } else if (currentRatio < targetRatio) {
      cropHeight = Math.max(1, Math.round(width / targetRatio));
    } else {
      return uri;
    }

    const originX = Math.max(0, Math.round((width - cropWidth) / 2));
    const originY = Math.max(0, Math.round((height - cropHeight) / 2));

    const result = await manipulateAsync(
      uri,
      [{ crop: { originX, originY, width: cropWidth, height: cropHeight } }],
      { compress: 0.9, format: SaveFormat.JPEG },
    );

    return result.uri || uri;
  } catch {
    return uri;
  }
};

export const pickCameraAsset = async ({
  onUnsupported,
}: {
  onUnsupported: () => void;
}): Promise<{ uri: string; mimeType: string } | null> => {
  const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
  if (!permissionResult.granted) {
    onUnsupported();
    return null;
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.8,
    allowsEditing: false,
  });

  if (result.canceled || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  return {
    uri: asset.uri,
    mimeType: asset.mimeType || 'image/jpeg',
  };
};

export const pickAttachmentAssets = async ({
  onPermissionDenied,
}: {
  onPermissionDenied: () => void;
}): Promise<ComposerAttachmentItem[] | null> => {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      multiple: true,
      copyToCacheDirectory: true,
    });

    if (result.canceled || result.assets.length === 0) {
      return null;
    }

    return result.assets.map((asset) => ({
      uri: asset.uri,
      mimeType: asset.mimeType || 'application/octet-stream',
      name: asset.name,
      size: asset.size,
      webFile: (asset as any).file,
    }));
  } catch {
    const hasPermission = await ensureImageLibraryPermission();
    if (!hasPermission) {
      onPermissionDenied();
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.8,
      allowsEditing: false,
      allowsMultipleSelection: true,
      videoMaxDuration: 120,
    });

    if (result.canceled || result.assets.length === 0) {
      return null;
    }

    return result.assets.map((asset) => ({
      uri: asset.uri,
      mimeType: asset.mimeType || ((asset as { type?: string }).type === 'video' ? 'video/mp4' : 'image/jpeg'),
      name: asset.fileName,
      size: asset.fileSize,
      webFile: (asset as any).file,
    }));
  }
};

export const sendPickedAssets = async ({
  items,
  onImageAttach,
  onImageSelected,
  setSendingImage,
}: {
  items: ComposerAttachmentItem[];
  onImageAttach: (uri: string, mimeType: string, options?: { name?: string; size?: number; webFile?: Blob }) => Promise<void>;
  onImageSelected: (item: ComposerAttachmentItem) => void;
  setSendingImage: (value: boolean) => void;
}) => {
  const videos = items.filter((item) => item.mimeType.startsWith('video/'));
  const images = items.filter((item) => item.mimeType.startsWith('image/'));
  const files = items.filter((item) => !item.mimeType.startsWith('video/') && !item.mimeType.startsWith('image/'));

  if (items.length === 1) {
    if (videos.length === 1) {
      setSendingImage(true);
      try {
        await onImageAttach(items[0].uri, items[0].mimeType, { name: items[0].name, size: items[0].size, webFile: items[0].webFile });
      } finally {
        setSendingImage(false);
      }
      return;
    }

    if (images.length === 1) {
      onImageSelected(items[0]);
      return;
    }

    if (files.length === 1) {
      setSendingImage(true);
      try {
        await onImageAttach(items[0].uri, items[0].mimeType, { name: items[0].name, size: items[0].size, webFile: items[0].webFile });
      } finally {
        setSendingImage(false);
      }
    }
    return;
  }

  setSendingImage(true);
  try {
    for (const item of items) {
      await onImageAttach(item.uri, item.mimeType, { name: item.name, size: item.size, webFile: item.webFile });
    }
    toast.success(`${items.length} items sent`, 'Attachments');
  } finally {
    setSendingImage(false);
  }
};
