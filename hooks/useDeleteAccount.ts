import * as Haptics from 'expo-haptics';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

import { authApi } from '@/data/api';
import { ApiError } from '@/data/http';
import { useT } from '@/lib/i18n/useT';
import { useSessionStore } from '@/store/useSessionStore';

/**
 * "Delete my account", shared by the three profile screens.
 *
 * One hook rather than three copies because the consequence is the same for
 * every role and so is the wording that announces it — and because a second
 * confirmation is the whole safety of an action that cannot be undone, it
 * should not be possible for one screen to forget it.
 *
 * The API decides whether the account *can* go (it refuses while an order is
 * still moving) and says why in a sentence written for the person, so a refusal
 * is shown as-is rather than replaced with something vaguer.
 *
 * No navigation on success, as with sign-out: clearing the session makes the
 * role guard redirect to the auth landing on the next render.
 */
export function useDeleteAccount(): { confirmDeleteAccount: () => void; deleting: boolean } {
  const t = useT();
  const signOut = useSessionStore((s) => s.signOut);
  const [deleting, setDeleting] = useState(false);

  const deleteAccount = useCallback(async () => {
    setDeleting(true);
    try {
      await authApi.deleteAccount();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // The account is gone server-side; this clears the device's copy of it.
      signOut();
    } catch (error) {
      setDeleting(false);
      Alert.alert(
        t('common.deleteAccount.failedTitle'),
        error instanceof ApiError ? error.message : t('common.genericError')
      );
    }
  }, [signOut, t]);

  const confirmDeleteAccount = useCallback(() => {
    if (deleting) return;
    Alert.alert(t('common.deleteAccount.confirmTitle'), t('common.deleteAccount.confirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.deleteAccount.confirmAction'), style: 'destructive', onPress: () => void deleteAccount() },
    ]);
  }, [deleteAccount, deleting, t]);

  return { confirmDeleteAccount, deleting };
}
