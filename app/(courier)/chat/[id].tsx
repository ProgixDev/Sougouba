import { useLocalSearchParams } from 'expo-router';

import { OrderChatScreen } from '@/components/chat/OrderChatScreen';

/** The courier's chat with the shopper whose order they carry. */
export default function CourierOrderChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <OrderChatScreen side="courier" orderId={id} />;
}
