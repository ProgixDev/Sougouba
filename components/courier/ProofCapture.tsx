import { Image } from 'expo-image';
import { Camera, Check, Delete, PenLine, ShieldCheck } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Path } from 'react-native-svg';
import { runOnJS } from 'react-native-reanimated';

import { Button, Text } from '@/components/ui';
import { useT } from '@/lib/i18n/useT';
import type { DeliveryProof, ProofMethod } from '@/data/types';
import { useThemeColors } from '@/hooks/useColorScheme';
import { useImagePicker } from '@/hooks/useImagePicker';
import { forest } from '@/theme/tokens';

export interface ProofCaptureProps {
  /**
   * Resolves to an error message to show under the proof, or nothing on
   * success. The PIN is checked by the server — the courier's app never holds
   * it, or it would prove nothing.
   */
  onSubmit: (proof: Omit<DeliveryProof, 'at'>) => Promise<string | void>;
  busy?: boolean;
}

/**
 * Keys, not sentences — module scope. The labels ("Code", "Photo", "Signature")
 * are the same word in both languages, so they stay inline.
 */
const METHODS: { key: ProofMethod; label: string; icon: typeof Camera }[] = [
  { key: 'pin', label: 'Code', icon: ShieldCheck },
  { key: 'photo', label: 'Photo', icon: Camera },
  { key: 'signature', label: 'Signature', icon: PenLine },
];

/**
 * Proof that the order arrived.
 *
 * Three methods because three situations exist: the customer is at the door
 * (code), the customer said leave it (photo), or the customer wants a receipt
 * (signature). Forcing one method would mean a courier who cannot complete a
 * legitimate delivery — which is how proof-of-delivery gets faked in practice.
 *
 * The PIN is checked by the server against the code stored on the order, which
 * only the shopper is shown. A photo or a signature is stored as an image the
 * back office can open if the delivery is disputed.
 */
export function ProofCapture({ onSubmit, busy = false }: ProofCaptureProps) {
  const t = useT();
  const colors = useThemeColors();
  const imagePicker = useImagePicker();
  const [method, setMethod] = useState<ProofMethod>('pin');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<{ uri: string; mimeType: string } | null>(null);
  const [strokes, setStrokes] = useState<string[]>([]);
  const [pad, setPad] = useState({ width: 0, height: 0 });
  // Photo and signature failures — an upload that did not go through, a run
  // that moved. The PIN keeps its own, under the boxes it is about.
  const [submitError, setSubmitError] = useState<string | null>(null);
  const current = useRef<string>('');
  const photoUri = photo?.uri ?? null;

  const signature = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      runOnJS(startStroke)(e.x, e.y);
    })
    .onUpdate((e) => {
      runOnJS(extendStroke)(e.x, e.y);
    })
    .onEnd(() => {
      runOnJS(endStroke)();
    });

  function startStroke(x: number, y: number) {
    setSubmitError(null);
    current.current = `M${x.toFixed(1)} ${y.toFixed(1)}`;
    setStrokes((s) => [...s, current.current]);
  }

  function extendStroke(x: number, y: number) {
    current.current += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
    setStrokes((s) => [...s.slice(0, -1), current.current]);
  }

  function endStroke() {
    current.current = '';
  }

  async function takePhoto() {
    // Camera only: a proof is taken at the door, not picked from the library.
    const image = await imagePicker.takePhoto({ quality: 0.6 });
    if (!image) return;
    setSubmitError(null);
    setPhoto({ uri: image.uri, mimeType: image.mimeType ?? mimeFromUri(image.uri) });
  }

  async function submit() {
    if (method === 'pin') {
      setPinError(null);
      const error = await onSubmit({ method: 'pin', pin });
      if (error) setPinError(error);
      return;
    }
    setSubmitError(null);
    if (method === 'photo') {
      if (!photo) return;
      const error = await onSubmit({ method: 'photo', imageUri: photo.uri, imageMimeType: photo.mimeType });
      if (error) setSubmitError(error);
      return;
    }
    if (strokes.length === 0 || pad.width === 0) return;
    // The strokes go to the API, which stores them as an image of the pad.
    const error = await onSubmit({
      method: 'signature',
      signature: { width: Math.round(pad.width), height: Math.round(pad.height), paths: strokes },
      note: t('courier.proofSteps.signatureCaptured'),
    });
    if (error) setSubmitError(error);
  }

  const ready =
    (method === 'pin' && pin.length === 4) ||
    (method === 'photo' && Boolean(photoUri)) ||
    (method === 'signature' && strokes.length > 0);

  const hint = t(`courier.proofSteps.${method === 'pin' ? 'code' : method}`);

  return (
    <View className="gap-5">
      <View className="flex-row gap-2.5">
        {METHODS.map(({ key, label, icon: Icon }) => {
          const selected = method === key;
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => {
                setMethod(key);
                setPinError(null);
                setSubmitError(null);
              }}
              className={`flex-1 h-[70px] rounded-2xl border-[1.5px] items-center justify-center gap-1.5 ${
                selected ? 'border-primary bg-primary/10' : 'border-border bg-card'
              }`}
            >
              <Icon
                size={19}
                color={selected ? colors.primary : colors.mutedForeground}
                strokeWidth={2}
              />
              <Text variant="caption" weight={selected ? 'bold' : 'medium'} className="text-[12px]">
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text variant="caption" tone="muted" className="text-[13px] leading-[19px]">
        {hint}
      </Text>

      {method === 'pin' ? (
        <View className="gap-3">
          {/* Four boxes rather than a text field: it shows how many digits are
              expected, and a keypad is the only sensible keyboard for it. */}
          <PinBoxes value={pin} error={Boolean(pinError)} />
          <Keypad
            onPress={(digit) => {
              setPinError(null);
              setPin((p) => (p.length >= 4 ? p : p + digit));
            }}
            onDelete={() => {
              setPinError(null);
              setPin((p) => p.slice(0, -1));
            }}
          />
          {pinError ? (
            <Text variant="caption" tone="destructive" className="text-center">
              {pinError}
            </Text>
          ) : null}
        </View>
      ) : null}

      {method === 'photo' ? (
        <View className="gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('courier.proof.takePhoto')}
            onPress={takePhoto}
            className="h-[220px] rounded-[20px] border-[1.5px] border-dashed border-borderStrong items-center justify-center overflow-hidden bg-card"
          >
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            ) : (
              <View className="items-center gap-2">
                <Camera size={26} color={colors.mutedForeground} strokeWidth={1.6} />
                <Text variant="caption" tone="muted">
                  {t('courier.proof.tapToShoot')}
                </Text>
              </View>
            )}
          </Pressable>
          {photoUri ? (
            <Button label={t('courier.proof.retakePhoto')} variant="ghost" size="sm" onPress={takePhoto} />
          ) : null}
        </View>
      ) : null}

      {method === 'signature' ? (
        <View className="gap-3">
          <GestureDetector gesture={signature}>
            <View
              onLayout={(e: LayoutChangeEvent) => setPad(e.nativeEvent.layout)}
              className="h-[220px] rounded-[20px] bg-card border-[1.5px] border-border overflow-hidden"
            >
              <Svg width="100%" height="100%">
                {strokes.map((d, i) => (
                  <Path
                    key={i}
                    d={d}
                    stroke={forest[700]}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                ))}
              </Svg>
              {strokes.length === 0 ? (
                <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
                  <Text variant="caption" tone="muted">
                    Signez ici
                  </Text>
                </View>
              ) : null}
            </View>
          </GestureDetector>
          {strokes.length > 0 ? (
            <Button
              label="Effacer"
              variant="ghost"
              size="sm"
              onPress={() => {
                setStrokes([]);
                setSubmitError(null);
              }}
            />
          ) : null}
        </View>
      ) : null}

      {submitError && method !== 'pin' ? (
        <Text variant="caption" tone="destructive" className="text-center" accessibilityLiveRegion="polite">
          {submitError}
        </Text>
      ) : null}

      <Button
        label={t('courier.proof.title')}
        variant="primary"
        size="lg"
        fullWidth
        disabled={!ready}
        loading={busy}
        icon={<Check size={18} color={colors.primaryForeground} strokeWidth={2.4} />}
        onPress={submit}
      />
    </View>
  );
}

/** When the camera does not say: iOS hands back `.jpg`, some Android cameras `.png`. */
function mimeFromUri(uri: string): string {
  const ext = uri.split('?')[0].split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'heic') return 'image/heic';
  return 'image/jpeg';
}

function PinBoxes({ value, error }: { value: string; error: boolean }) {
  const colors = useThemeColors();
  return (
    <View className="flex-row justify-center gap-3">
      {[0, 1, 2, 3].map((i) => (
        <View
          key={i}
          className="w-14 h-16 rounded-2xl border-[1.5px] items-center justify-center bg-card"
          style={{
            borderColor: error
              ? colors.destructive
              : value.length > i
                ? colors.primary
                : colors.borderStrong,
          }}
        >
          <Text weight="bold" className="text-[26px]" style={{ fontVariant: ['tabular-nums'] }}>
            {value[i] ?? ''}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * An on-screen keypad rather than the system keyboard.
 *
 * The system numeric keyboard covers the boxes it is filling on a small phone,
 * and a courier standing at a door does not need a keyboard that can also type
 * a comma.
 */
function Keypad({
  onPress,
  onDelete,
}: {
  onPress: (digit: string) => void;
  onDelete: () => void;
}) {
  const colors = useThemeColors();
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
  return (
    <View className="flex-row flex-wrap">
      {keys.map((key, i) =>
        key === '' ? (
          <View key={i} className="w-1/3 h-14" />
        ) : (
          <View key={i} className="w-1/3 h-14 p-1">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={key === 'del' ? 'Effacer' : key}
              onPress={() => (key === 'del' ? onDelete() : onPress(key))}
              className="flex-1 rounded-2xl items-center justify-center active:bg-muted"
            >
              {key === 'del' ? (
                <Delete size={20} color={colors.mutedForeground} strokeWidth={2} />
              ) : (
                <Text weight="semibold" className="text-[21px]">
                  {key}
                </Text>
              )}
            </Pressable>
          </View>
        )
      )}
    </View>
  );
}
