import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { FileCheck2, FileUp, X } from 'lucide-react-native';
import { Alert, Pressable, View } from 'react-native';

import { Text } from '@/components/ui';
import { useThemeColors } from '@/hooks/useColorScheme';
import { useT } from '@/lib/i18n/useT';
import { MAX_DOCUMENT_BYTES, pickedDocumentSchema, type PickedDocument } from '@/lib/validation/merchant';

export interface DocumentFieldProps {
  label: string;
  helperText?: string;
  value: PickedDocument | null;
  onChange: (document: PickedDocument | null) => void;
  error?: string;
  required?: boolean;
}

const ACCEPTED: PickedDocument['mimeType'][] = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic'];

/** Pickers do not always report a type — a camera shot often has none — so the extension decides. */
function mimeTypeOf(name: string, reported?: string | null): PickedDocument['mimeType'] | null {
  if (reported && (ACCEPTED as string[]).includes(reported)) return reported as PickedDocument['mimeType'];
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'heic') return 'image/heic';
  return null;
}

/**
 * One registration document: a photo taken now, one from the library, or a
 * file (a PDF from the bank or the registraire, typically).
 *
 * Only *picks* — nothing is uploaded until the whole application is sent, so
 * a merchant who changes their mind leaves nothing behind in Storage.
 */
export function DocumentField({ label, helperText, value, onChange, error, required }: DocumentFieldProps) {
  const t = useT();
  const colors = useThemeColors();

  function accept(uri: string, name: string, reportedType?: string | null, size?: number | null) {
    const mimeType = mimeTypeOf(name, reportedType);
    if (!mimeType) {
      Alert.alert(t('business.documentField.unsupportedTitle'), t('business.documentField.unsupportedBody'));
      return;
    }
    if (size && size > MAX_DOCUMENT_BYTES) {
      Alert.alert(t('business.documentField.tooLargeTitle'), t('business.documentField.tooLargeBody'));
      return;
    }
    onChange(pickedDocumentSchema.parse({ uri, name, mimeType }));
  }

  async function fromCamera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('business.documentField.cameraDeniedTitle'), t('business.documentField.cameraDeniedBody'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (result.canceled) return;
    const asset = result.assets[0];
    accept(asset.uri, asset.fileName ?? 'photo.jpg', asset.mimeType ?? 'image/jpeg', asset.fileSize);
  }

  async function fromLibrary() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (result.canceled) return;
    const asset = result.assets[0];
    accept(asset.uri, asset.fileName ?? 'photo.jpg', asset.mimeType, asset.fileSize);
  }

  async function fromFiles() {
    const result = await DocumentPicker.getDocumentAsync({ type: ACCEPTED, copyToCacheDirectory: true });
    if (result.canceled) return;
    const asset = result.assets[0];
    accept(asset.uri, asset.name, asset.mimeType, asset.size);
  }

  function choose() {
    Alert.alert(label, undefined, [
      { text: t('business.documentField.takePhoto'), onPress: fromCamera },
      { text: t('business.documentField.choosePhoto'), onPress: fromLibrary },
      { text: t('business.documentField.chooseFile'), onPress: fromFiles },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  const tint = error ? colors.destructive : value ? colors.primary : colors.mutedForeground;
  const Icon = value ? FileCheck2 : FileUp;

  return (
    <View className="gap-1.5">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={t('business.documentField.a11yHint')}
        onPress={choose}
        className={`min-h-[64px] rounded-2xl px-4 py-3 flex-row items-center gap-3 border-[1.5px] ${
          value ? 'bg-primary/5 border-primary/40' : 'bg-card border-dashed'
        }`}
        style={!value ? { borderColor: error ? colors.destructive : colors.borderStrong } : undefined}
      >
        <View className="w-10 h-10 rounded-xl items-center justify-center" style={{ backgroundColor: `${tint}1A` }}>
          <Icon size={20} color={tint} strokeWidth={2} />
        </View>
        <View className="flex-1 gap-0.5">
          <Text variant="caption" weight="semibold" numberOfLines={1}>
            {label}
            {required ? ' *' : ''}
          </Text>
          <Text variant="caption" tone="muted" className="text-[12px]" numberOfLines={1}>
            {value ? value.name : t('business.documentField.formats')}
          </Text>
        </View>
        {value ? (
          <Pressable
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('business.documentField.remove')}
            onPress={() => onChange(null)}
          >
            <X size={18} color={colors.mutedForeground} />
          </Pressable>
        ) : (
          <Text variant="caption" weight="semibold" tone="primary">
            {t('business.documentField.add')}
          </Text>
        )}
      </Pressable>
      {error ? (
        <Text variant="caption" tone="destructive" className="text-[12px] px-1">
          {error}
        </Text>
      ) : helperText ? (
        <Text variant="caption" tone="muted" className="text-[12px] px-1">
          {helperText}
        </Text>
      ) : null}
    </View>
  );
}
