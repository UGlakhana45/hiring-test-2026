import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { Plan } from '@/types/subscription';

const COLORS: Record<Plan, { bg: string; text: string }> = {
  free:    { bg: '#e5e7eb', text: '#374151' },
  pro:     { bg: '#dbeafe', text: '#1e40af' },
  premium: { bg: '#ede9fe', text: '#5b21b6' },
  vip:     { bg: '#fef3c7', text: '#92400e' },
};

type Props = {
  plan: Plan;
};

export function PlanBadge({ plan }: Props) {
  const colors = COLORS[plan];
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.text, { color: colors.text }]}>
        {plan.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
