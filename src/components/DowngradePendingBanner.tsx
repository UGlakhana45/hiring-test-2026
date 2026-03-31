import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useClinicStore } from '@/store/clinicStore';
import { PLAN_CONFIG } from '@/types/subscription';
import { format } from 'date-fns';

export function DowngradePendingBanner() {
  const subscription = useClinicStore((s) => s.subscription);

  if (!subscription?.downgradeAt || !subscription?.scheduledPlan) return null;

  const date = subscription.downgradeAt.toDate();
  const targetLabel = PLAN_CONFIG[subscription.scheduledPlan].label;

  return (
    <View style={styles.banner}>
      <Text style={styles.title}>Plan change scheduled</Text>
      <Text style={styles.text}>
        Your plan will change to {targetLabel} on {format(date, 'MMM d, yyyy')}.
        You retain full access until then.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400e',
    marginBottom: 2,
  },
  text: {
    fontSize: 13,
    color: '#92400e',
  },
});
