import { useLocalSearchParams } from 'expo-router';

import { OrderChatScreen } from '@/components/chat/OrderChatScreen';

/** The shopper's chat with the courier carrying this order. */
export default function CustomerOrderChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <OrderChatScreen side="customer" orderId={id} />;
}
