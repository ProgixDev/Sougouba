import * as ImagePicker from 'expo-image-picker';
import { Alert, type AlertButton } from 'react-native';

import { useT } from '@/lib/i18n/useT';

/** One picked photo, whichever way it was taken. */
export interface PickedImage {
  uri: string;
  /** Pickers do not always name the file — a camera shot often has none. */
  fileName: string;
  /** As reported by the picker, which sometimes reports none. */
  mimeType?: string;
  fileSize?: number;
}

export interface ImagePickOptions {
  /** Crop to a square before returning: avatars and product photos. */
  square?: boolean;
  /** 0–1. Below 1 also makes iOS hand back a JPEG rather than a HEIC. */
  quality?: number;
}

export interface ImageSourceSheet extends ImagePickOptions {
  title: string;
  onPick: (image: PickedImage) => void;
  /** More choices after the two photo ones — `DocumentField`'s "choose a file". */
  extraActions?: AlertButton[];
}

const DEFAULT_QUALITY = 0.7;

function launchOptions({ square, quality = DEFAULT_QUALITY }: ImagePickOptions): ImagePicker.ImagePickerOptions {
  return { mediaTypes: ['images'], quality, allowsEditing: Boolean(square), aspect: square ? [1, 1] : undefined };
}

function toPicked(result: ImagePicker.ImagePickerResult): PickedImage | null {
  if (result.canceled) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    fileName: asset.fileName ?? 'photo.jpg',
    mimeType: asset.mimeType ?? undefined,
    fileSize: asset.fileSize,
  };
}

/**
 * The app's one way to get a photo from the camera or the library.
 *
 * Every screen that asks for a picture — a registration document, a product,
 * an avatar, a delivery proof — goes through here, so the permission handling
 * and the "camera or library?" sheet read the same everywhere.
 *
 * Only the camera asks for permission. The library picker needs none for
 * images (expo-image-picker docs, SDK 57), so asking first would put a system
 * prompt in front of the user for nothing.
 */
export function useImagePicker() {
  const t = useT();

  async function takePhoto(options: ImagePickOptions = {}): Promise<PickedImage | null> {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('common.imagePicker.cameraDeniedTitle'), t('common.imagePicker.cameraDeniedBody'));
      return null;
    }
    return toPicked(await ImagePicker.launchCameraAsync(launchOptions(options)));
  }

  async function choosePhoto(options: ImagePickOptions = {}): Promise<PickedImage | null> {
    return toPicked(await ImagePicker.launchImageLibraryAsync(launchOptions(options)));
  }

  /** "Take a photo" or "Choose a photo", asked in one sheet. Cancelling calls nothing. */
  function chooseSource({ title, onPick, extraActions = [], ...options }: ImageSourceSheet) {
    const pickWith = (pick: (o: ImagePickOptions) => Promise<PickedImage | null>) => async () => {
      const image = await pick(options);
      if (image) onPick(image);
    };
    Alert.alert(title, undefined, [
      { text: t('common.imagePicker.takePhoto'), onPress: pickWith(takePhoto) },
      { text: t('common.imagePicker.choosePhoto'), onPress: pickWith(choosePhoto) },
      ...extraActions,
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  return { takePhoto, choosePhoto, chooseSource };
}
