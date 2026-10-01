import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { ChevronLeft, Gift, Mail, User } from 'lucide-react-native';
import { AnimatePresence, MotiView } from 'moti';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  type TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CODE_LENGTH, CodeInput } from '@/components/auth/CodeInput';
import { SocialButton } from '@/components/auth/SocialButton';
import { Button, Input, Text } from '@/components/ui';
import { authApi } from '@/data/api';
import { AuthError } from '@/data/api/auth';
import type { User as AppUser } from '@/data/types';
import { useThemeColors } from '@/hooks/useColorScheme';
import { useT } from '@/lib/i18n/useT';
import { type EmailValues, emailSchema, type NameValues, nameSchema } from '@/lib/validation/auth';
import { i18nResolver } from '@/lib/validation/resolver';
import { useSessionStore } from '@/store/useSessionStore';

/**
 * The whole way in, on one screen: choose → email → code → name.
 *
 * There are no passwords and no separate sign-in / sign-up: an email code signs
 * in, creating the account the first time. Only a new account sees the name
 * step. Kept on a single route so the brand mark can travel between steps and
 * each step slides in over the last, rather than a stack push per field.
 */

type Step = 'choose' | 'email' | 'code' | 'name';

/** Matches the API's `RESEND_COOLDOWN_MS` — the code was just sent when the code step opens. */
const COOLDOWN_S = 60;

const SPRING = { type: 'spring', damping: 20, stiffness: 190, mass: 0.9 } as const;

export default function AuthFlowScreen() {
  const { height } = useWindowDimensions();
  const signIn = useSessionStore((s) => s.signIn);

  const [step, setStep] = useState<Step>('choose');
  const [email, setEmail] = useState('');
  /** Signed in but nameless — held here, not in the store, until the name step finishes. */
  const [pendingUser, setPendingUser] = useState<AppUser | null>(null);

  const back: Partial<Record<Step, Step>> = { email: 'choose', code: 'email' };
  const goBack = back[step];

  // Android's back button walks the steps before it leaves the screen.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!goBack) return false;
      setStep(goBack);
      return true;
    });
    return () => sub.remove();
  }, [goBack]);

  const hero = step === 'choose';
  const markWidth = hero ? 138 : 64;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <TopBar step={step} onBack={goBack ? () => setStep(goBack) : undefined} />

        <ScrollView
          contentContainerClassName="flex-grow px-6 pb-4"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* The mark is the one element every step shares: large and centred on
              the landing, it shrinks up out of the way once a form takes over. */}
          <MotiView
            animate={{ height: hero ? Math.max(220, height * 0.36) : 88 }}
            transition={SPRING}
            className="items-center justify-center"
          >
            <MotiView animate={{ width: markWidth, height: markWidth * (1610 / 1817) }} transition={SPRING}>
              <Image
                source={require('@/assets/images/brand/mark.png')}
                style={{ width: '100%', height: '100%' }}
                contentFit="contain"
              />
            </MotiView>
          </MotiView>

          <AnimatePresence exitBeforeEnter>
            <MotiView
              key={step}
              from={{ opacity: 0, translateY: 18, scale: 0.98 }}
              animate={{ opacity: 1, translateY: 0, scale: 1 }}
              exit={{ opacity: 0, translateY: -10, scale: 0.98 }}
              exitTransition={{ type: 'timing', duration: 140 }}
              transition={SPRING}
              className="flex-1"
            >
              {step === 'choose' ? (
                <ChooseStep onEmail={() => setStep('email')} />
              ) : step === 'email' ? (
                <EmailStep
                  initial={email}
                  onSent={(value) => {
                    setEmail(value);
                    setStep('code');
                  }}
                />
              ) : step === 'code' ? (
                <CodeStep
                  email={email}
                  onChangeEmail={() => setStep('email')}
                  onVerified={(user, isNewUser) => {
                    if (isNewUser) {
                      setPendingUser(user);
                      setStep('name');
                    } else {
                      signIn(user);
                    }
                  }}
                />
              ) : (
                <NameStep onDone={(user) => signIn(user)} fallbackUser={pendingUser} />
              )}
            </MotiView>
          </AnimatePresence>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Back chevron and a three-segment progress track, both absent on the landing. */
function TopBar({ step, onBack }: { step: Step; onBack?: () => void }) {
  const t = useT();
  const colors = useThemeColors();
  const index = { choose: -1, email: 0, code: 1, name: 2 }[step];
  const visible = index >= 0;

  return (
    <View className="h-12 px-4 flex-row items-center gap-3">
      <MotiView animate={{ opacity: onBack ? 1 : 0 }} transition={{ type: 'timing', duration: 160 }}>
        <Pressable
          onPress={onBack}
          disabled={!onBack}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('common.ui.back')}
          className="w-10 h-10 rounded-full bg-card items-center justify-center"
        >
          <ChevronLeft size={22} color={colors.foreground} strokeWidth={2.2} />
        </Pressable>
      </MotiView>

      <MotiView
        animate={{ opacity: visible ? 1 : 0 }}
        transition={{ type: 'timing', duration: 200 }}
        className="flex-1 flex-row gap-1.5 mr-14"
      >
        {[0, 1, 2].map((i) => (
          <View key={i} className="flex-1 h-1 rounded-full overflow-hidden" style={{ backgroundColor: colors.border }}>
            <MotiView
              animate={{ scaleX: i <= index ? 1 : 0 }}
              transition={{ type: 'timing', duration: 360 }}
              style={{ height: '100%', borderRadius: 999, backgroundColor: colors.primary, transformOrigin: 'left' }}
            />
          </View>
        ))}
      </MotiView>
    </View>
  );
}

function StepHeading({ title, body }: { title: string; body?: React.ReactNode }) {
  return (
    <View className="items-center gap-2 mb-7">
      <Text variant="title" weight="bold" className="text-center">
        {title}
      </Text>
      {body ? (
        typeof body === 'string' ? (
          <Text variant="body" tone="muted" className="text-center">
            {body}
          </Text>
        ) : (
          body
        )
      ) : null}
    </View>
  );
}

/** Staggered entrance for a step's children, so a new step assembles rather than appears. */
function Rise({ i, children }: { i: number; children: React.ReactNode }) {
  return (
    <MotiView
      from={{ opacity: 0, translateY: 14 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ ...SPRING, delay: 60 + i * 70 }}
    >
      {children}
    </MotiView>
  );
}

function ChooseStep({ onEmail }: { onEmail: () => void }) {
  const t = useT();
  const colors = useThemeColors();
  const [notice, setNotice] = useState<string | null>(null);

  async function oauth(provider: 'google' | 'apple') {
    setNotice(null);
    try {
      await authApi.oauthContinue(provider);
    } catch (e) {
      setNotice(e instanceof AuthError ? t(`auth.error.${e.code}`) : t('common.genericError'));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }
  }

  return (
    <View className="flex-1 justify-between">
      <StepHeading title={t('auth.welcome.title')} body={t('auth.welcome.body')} />

      <View className="gap-3">
        <Rise i={0}>
          <Button
            label={t('auth.welcome.email')}
            variant="primary"
            size="lg"
            fullWidth
            icon={<Mail size={19} color={colors.primaryForeground} strokeWidth={2.2} />}
            onPress={onEmail}
          />
        </Rise>
        <Rise i={1}>
          <View className="flex-row items-center gap-3 my-1">
            <View className="flex-1 h-px bg-border" />
            <Text variant="caption" tone="muted">
              {t('auth.or')}
            </Text>
            <View className="flex-1 h-px bg-border" />
          </View>
        </Rise>
        {Platform.OS === 'ios' ? (
          <Rise i={2}>
            <SocialButton provider="apple" label={t('auth.oauth.apple')} onPress={() => oauth('apple')} />
          </Rise>
        ) : null}
        <Rise i={3}>
          <SocialButton provider="google" label={t('auth.oauth.google')} onPress={() => oauth('google')} />
        </Rise>

        <AnimatePresence>
          {notice ? (
            <MotiView
              key="notice"
              from={{ opacity: 0, translateY: 6 }}
              animate={{ opacity: 1, translateY: 0 }}
              exit={{ opacity: 0 }}
            >
              <Text variant="caption" tone="muted" className="text-center">
                {notice}
              </Text>
            </MotiView>
          ) : null}
        </AnimatePresence>

        <Rise i={4}>
          <Text variant="caption" tone="muted" className="text-center mt-2">
            {t('auth.welcome.fineprint')}
          </Text>
        </Rise>
      </View>
    </View>
  );
}

function EmailStep({ initial, onSent }: { initial: string; onSent: (email: string) => void }) {
  const t = useT();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EmailValues>({
    resolver: i18nResolver(t, emailSchema),
    defaultValues: { email: initial },
  });

  async function onSubmit({ email }: EmailValues) {
    setFormError(null);
    const normalised = email.trim().toLowerCase();
    try {
      await authApi.startEmail(normalised);
      onSent(normalised);
    } catch (e) {
      // Coming back to fix a typo in the same address within the minute: a
      // code is already on its way, so carry on to it rather than stall here.
      if (e instanceof AuthError && e.code === 'code_cooldown' && normalised === initial) {
        onSent(normalised);
        return;
      }
      setFormError(e instanceof AuthError ? t(`auth.error.${e.code}`) : t('common.genericError'));
    }
  }

  return (
    <View>
      <StepHeading title={t('auth.email.title')} body={t('auth.email.body')} />
      <View className="gap-5">
        <Rise i={0}>
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label={t('auth.field.email')}
                icon={Mail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                autoFocus
                returnKeyType="send"
                onSubmitEditing={handleSubmit(onSubmit)}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.email?.message}
              />
            )}
          />
        </Rise>
        {formError ? (
          <Text variant="caption" tone="destructive">
            {formError}
          </Text>
        ) : null}
        <Rise i={1}>
          <Button
            label={t('auth.email.submit')}
            variant="primary"
            size="lg"
            fullWidth
            loading={isSubmitting}
            onPress={handleSubmit(onSubmit)}
          />
        </Rise>
      </View>
    </View>
  );
}

function CodeStep({
  email,
  onChangeEmail,
  onVerified,
}: {
  email: string;
  onChangeEmail: () => void;
  onVerified: (user: AppUser, isNewUser: boolean) => void;
}) {
  const t = useT();
  const inputRef = useRef<TextInput>(null);
  const [code, setCode] = useState('');
  const [focused, setFocused] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(COOLDOWN_S);

  // Focus after the step's entrance settles — focusing mid-animation makes the
  // keyboard and the slide fight over the same frames.
  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 320);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  async function verify(value: string) {
    if (value.length !== CODE_LENGTH || verifying) return;
    setVerifying(true);
    setError(null);
    setNotice(null);
    try {
      const { user, isNewUser } = await authApi.verifyEmailCode(email, value);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onVerified(user, isNewUser);
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setError(e instanceof AuthError ? t(`auth.error.${e.code}`) : t('common.genericError'));
      setErrorKey((k) => k + 1);
      setCode('');
      inputRef.current?.focus();
    } finally {
      setVerifying(false);
    }
  }

  async function resend() {
    setError(null);
    setNotice(null);
    try {
      await authApi.startEmail(email);
      setNotice(t('auth.code.resent'));
      setCooldown(COOLDOWN_S);
    } catch (e) {
      setError(e instanceof AuthError ? t(`auth.error.${e.code}`) : t('common.genericError'));
    }
  }

  return (
    <View>
      <StepHeading
        title={t('auth.code.title')}
        body={
          <View className="flex-row items-center gap-2 flex-wrap justify-center">
            <Text variant="body" tone="muted">
              {t('auth.code.body', { email })}
            </Text>
            <Pressable onPress={onChangeEmail} hitSlop={8}>
              <Text variant="body" weight="bold" tone="primary">
                {t('auth.code.change')}
              </Text>
            </Pressable>
          </View>
        }
      />

      <View className="gap-5">
        <Rise i={0}>
          <CodeInput
            ref={inputRef}
            value={code}
            onChange={(digits) => {
              setCode(digits);
              if (error) setError(null);
              // Auto-submit on the sixth digit — including when iOS autofills
              // the whole code from the Mail suggestion bar in one go.
              if (digits.length === CODE_LENGTH) void verify(digits);
            }}
            error={!!error}
            errorKey={errorKey}
            focused={focused}
            onFocusChange={setFocused}
            accessibilityLabel={t('auth.code.label')}
          />
        </Rise>

        <View className="min-h-5 items-center">
          {verifying ? (
            <MotiView
              from={{ opacity: 0.3 }}
              animate={{ opacity: 1 }}
              transition={{ type: 'timing', duration: 600, loop: true }}
              className="flex-row gap-1.5"
            >
              {[0, 1, 2].map((i) => (
                <View key={i} className="w-2 h-2 rounded-full bg-primary" />
              ))}
            </MotiView>
          ) : error ? (
            <Text variant="caption" tone="destructive" className="text-center">
              {error}
            </Text>
          ) : notice ? (
            <Text variant="caption" tone="primary" className="text-center">
              {notice}
            </Text>
          ) : null}
        </View>

        <Rise i={1}>
          <Pressable onPress={resend} disabled={cooldown > 0} hitSlop={8} className="self-center">
            <Text variant="caption" weight="bold" tone={cooldown > 0 ? 'muted' : 'primary'}>
              {cooldown > 0 ? t('auth.code.resendIn', { seconds: cooldown }) : t('auth.code.resend')}
            </Text>
          </Pressable>
        </Rise>
      </View>
    </View>
  );
}

function NameStep({ onDone, fallbackUser }: { onDone: (user: AppUser) => void; fallbackUser: AppUser | null }) {
  const t = useT();
  const colors = useThemeColors();
  const [showReferral, setShowReferral] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NameValues>({
    resolver: i18nResolver(t, nameSchema),
    defaultValues: { fullName: fallbackUser?.fullName ?? '', referralCode: '' },
  });

  async function onSubmit(values: NameValues) {
    setFormError(null);
    try {
      onDone(await authApi.completeProfile(values.fullName, values.referralCode));
    } catch {
      setFormError(t('common.genericError'));
    }
  }

  return (
    <View>
      <StepHeading title={t('auth.name.title')} body={t('auth.name.body')} />
      <View className="gap-5">
        <Rise i={0}>
          <Controller
            control={control}
            name="fullName"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label={t('auth.field.fullName')}
                icon={User}
                autoComplete="name"
                textContentType="name"
                autoCapitalize="words"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleSubmit(onSubmit)}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.fullName?.message}
              />
            )}
          />
        </Rise>

        <AnimatePresence exitBeforeEnter>
          {showReferral ? (
            <MotiView
              key="referral"
              from={{ opacity: 0, translateY: -8, scale: 0.98 }}
              animate={{ opacity: 1, translateY: 0, scale: 1 }}
              transition={SPRING}
            >
              <Controller
                control={control}
                name="referralCode"
                render={({ field: { onChange, onBlur, value } }) => (
                  <Input
                    label={t('auth.field.referralCode')}
                    icon={Gift}
                    autoCapitalize="characters"
                    autoFocus
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    helperText={t('auth.field.referralHint')}
                  />
                )}
              />
            </MotiView>
          ) : (
            <MotiView key="referral-toggle" exit={{ opacity: 0 }} exitTransition={{ type: 'timing', duration: 100 }}>
              <Rise i={1}>
                <Pressable onPress={() => setShowReferral(true)} hitSlop={8} className="self-center flex-row items-center gap-2">
                  <Gift size={16} color={colors.primary} strokeWidth={2.2} />
                  <Text variant="caption" weight="bold" tone="primary">
                    {t('auth.name.referralToggle')}
                  </Text>
                </Pressable>
              </Rise>
            </MotiView>
          )}
        </AnimatePresence>

        {formError ? (
          <Text variant="caption" tone="destructive">
            {formError}
          </Text>
        ) : null}

        <Rise i={2}>
          <Button
            label={t('auth.name.submit')}
            variant="cta"
            size="lg"
            fullWidth
            loading={isSubmitting}
            onPress={handleSubmit(onSubmit)}
          />
        </Rise>
      </View>
    </View>
  );
}
