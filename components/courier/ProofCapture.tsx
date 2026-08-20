import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Check, Delete, PenLine, ShieldCheck } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Path } from 'react-native-svg';
import { runOnJS } from 'react-native-reanimated';

import { Button, Text } from '@/components/ui';
import type { DeliveryProof, ProofMethod } from '@/data/types';
import { useThemeColors } from '@/hooks/useColorScheme';
import { forest } from '@/theme/tokens';

export interface ProofCaptureProps {
  /** The code the shopper reads out. Checked locally against what is typed. */
  expectedPin: string;
  onSubmit: (proof: Omit<DeliveryProof, 'at'>) => Promise<void>;
  busy?: boolean;
}

const METHODS: { key: ProofMethod; label: string; icon: typeof Camera; hint: string }[] = [
  { key: 'pin', label: 'Code', icon: ShieldCheck, hint: 'Le client vous donne son code à 4 chiffres.' },
  { key: 'photo', label: 'Photo', icon: Camera, hint: 'Photographiez la commande à l’endroit où vous la laissez.' },
  { key: 'signature', label: 'Signature', icon: PenLine, hint: 'Faites signer le client sur l’écran.' },
];

/**
 * Proof that the order arrived.
 *
 * Three methods because three situations exist: the customer is at the door
 * (code), the customer said leave it (photo), or the customer wants a receipt
 * (signature). Forcing one method would mean a courier who cannot complete a
 * legitimate delivery — which is how proof-of-delivery gets faked in practice.
 *
 * The PIN is checked here, on the device, against the value derived from the
 * order id. That is not security — anyone holding the order can compute it (see
 * `deliveryPin` in `data/delivery.ts`) — it is a hand-off token that proves the
 * courier and the customer were in the same place.
 */
export function ProofCapture({ expectedPin, onSubmit, busy = false }: ProofCaptureProps) {
  const colors = useThemeColors();
  const [method, setMethod] = useState<ProofMethod>('pin');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [strokes, setStrokes] = useState<string[]>([]);
  const current = useRef<string>('');

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
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchCameraAsync({ quality: 0.6, allowsEditing: false });
    if (!result.canceled) setPhotoUri(result.assets[0].uri);
  }

  function submit() {
    if (method === 'pin') {
      if (pin !== expectedPin) {
        setPinError('Code incorrect. Demandez-le au client.');
        return;
      }
      return void onSubmit({ method: 'pin' });
    }
    if (method === 'photo') {
      if (!photoUri) return;
      return void onSubmit({ method: 'photo', imageUri: photoUri });
    }
    if (strokes.length === 0) return;
    // The drawing is not persisted as a file — there is no backend to upload it
    // to. What is recorded is that a signature was given, which is what the
    // dispute record needs to know.
    return void onSubmit({ method: 'signature', note: 'Signature recueillie à la livraison' });
  }

  const ready =
    (method === 'pin' && pin.length === 4) ||
    (method === 'photo' && Boolean(photoUri)) ||
    (method === 'signature' && strokes.length > 0);

  const hint = METHODS.find((m) => m.key === method)!.hint;

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
            accessibilityLabel="Prendre une photo"
            onPress={takePhoto}
            className="h-[220px] rounded-[20px] border-[1.5px] border-dashed border-borderStrong items-center justify-center overflow-hidden bg-card"
          >
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            ) : (
              <View className="items-center gap-2">
                <Camera size={26} color={colors.mutedForeground} strokeWidth={1.6} />
                <Text variant="caption" tone="muted">
                  Toucher pour photographier
                </Text>
              </View>
            )}
          </Pressable>
          {photoUri ? (
            <Button label="Reprendre la photo" variant="ghost" size="sm" onPress={takePhoto} />
          ) : null}
        </View>
      ) : null}

      {method === 'signature' ? (
        <View className="gap-3">
          <GestureDetector gesture={signature}>
            <View className="h-[220px] rounded-[20px] bg-card border-[1.5px] border-border overflow-hidden">
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
            <Button label="Effacer" variant="ghost" size="sm" onPress={() => setStrokes([])} />
          ) : null}
        </View>
      ) : null}

      <Button
        label="Confirmer la livraison"
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
