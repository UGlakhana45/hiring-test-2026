import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { useClinic } from '@/hooks/useClinic';
import { useSubscription } from '@/hooks/useSubscription';
import { signOut } from '@/services/auth';
import {
  createCheckoutSession,
  getHttpsCallableErrorMessage,
  initiateDowngrade,
  openCheckoutUrl,
} from '@/services/stripe';
import { PlanBadge } from '@/components/PlanBadge';
import { PLAN_CONFIG } from '@/types/subscription';
import type { Plan } from '@/types/subscription';

const UPGRADE_OPTIONS: Plan[] = ['pro', 'premium', 'vip'];
const DOWNGRADE_OPTIONS: Plan[] = ['free', 'pro', 'premium'];

export default function SettingsScreen() {
  const { profile } = useAuth();
  const { clinic } = useClinic();
  const { plan, status } = useSubscription();
  /** Cloud Functions only need this ID; clinic doc may lag or be missing in Firestore. */
  const clinicId = clinic?.id ?? profile?.clinicId ?? null;
  const [checkoutDiscountCode, setCheckoutDiscountCode] = useState('');
  const [checkoutBusy, setCheckoutBusy] = useState<Plan | null>(null);
  const [downgradeBusy, setDowngradeBusy] = useState<Plan | null>(null);

  async function handleSignOut() {
    await signOut();
    router.replace('/(auth)/login');
  }

  async function handleUpgrade(targetPlan: Plan) {
    if (!clinicId || targetPlan === 'free') {
      Alert.alert(
        'No clinic on this account',
        'Your user profile has no clinicId (seed/onboarding missing), or Firestore is offline. Run `npm run seed` against your emulator/project, then sign in again.',
      );
      return;
    }
    const code = checkoutDiscountCode.trim() || undefined;
    setCheckoutBusy(targetPlan);
    try {
      const { url } = await createCheckoutSession({
        clinicId,
        plan: targetPlan,
        discountCode: code,
      });
      await openCheckoutUrl(url);
    } catch (e: unknown) {
      Alert.alert('Checkout error', getHttpsCallableErrorMessage(e));
    } finally {
      setCheckoutBusy(null);
    }
  }

  async function handleDowngrade(targetPlan: Plan) {
    if (!clinicId || targetPlan === 'vip') return;
    setDowngradeBusy(targetPlan);
    try {
      const result = await initiateDowngrade({ clinicId, targetPlan });
      if (result.strategy === 'seat_conflict') {
        Alert.alert(
          'Cannot downgrade yet',
          `You have ${result.activeSeats} active seats but ${PLAN_CONFIG[targetPlan].label} allows ${result.seatLimit}. Remove ${result.conflictingSeats} staff member(s) first, then try again.`,
        );
        return;
      }
      Alert.alert(
        'Downgrade scheduled',
        `Your plan will change to ${PLAN_CONFIG[targetPlan].label} on ${result.effectiveDate ? new Date(result.effectiveDate).toLocaleDateString() : 'period end'}.`,
      );
    } catch (e: unknown) {
      Alert.alert('Downgrade error', getHttpsCallableErrorMessage(e));
    } finally {
      setDowngradeBusy(null);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Account info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <Text style={styles.name}>{profile?.displayName}</Text>
        <Text style={styles.email}>{profile?.email}</Text>
        <View style={styles.roleRow}>
          <Text style={styles.roleLabel}>Role:</Text>
          <Text style={styles.roleValue}>{profile?.role}</Text>
        </View>
      </View>

      {/* Clinic info */}
      {clinic && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Clinic</Text>
          <Text style={styles.clinicName}>{clinic.name}</Text>
          <View style={styles.planRow}>
            <PlanBadge plan={plan} />
            <Text style={styles.planStatus}>{status}</Text>
          </View>
        </View>
      )}

      {/* Plan management (owner only) */}
      {profile?.role === 'owner' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Plan management</Text>
          <Text style={styles.hint}>
            Upgrades take effect immediately. Downgrades may be queued if you have active staff
            exceeding the target plan's seat limit.
          </Text>

          <Text style={[styles.subTitle, { marginTop: 4 }]}>Discount code (optional)</Text>
          <TextInput
            style={styles.discountInput}
            placeholder="e.g. WELCOME20"
            placeholderTextColor="#9ca3af"
            autoCapitalize="characters"
            value={checkoutDiscountCode}
            onChangeText={setCheckoutDiscountCode}
          />

          <Text style={styles.subTitle}>Upgrade to</Text>
          {UPGRADE_OPTIONS.filter((p) => {
            const planOrder: Plan[] = ['free', 'pro', 'premium', 'vip'];
            return planOrder.indexOf(p) > planOrder.indexOf(plan);
          }).map((targetPlan) => (
            <TouchableOpacity
              key={targetPlan}
              style={[styles.planButton, checkoutBusy !== null && styles.rowDisabled]}
              onPress={() => void handleUpgrade(targetPlan)}
              disabled={checkoutBusy !== null}
            >
              <View>
                <Text style={styles.planButtonName}>{PLAN_CONFIG[targetPlan].label}</Text>
                <Text style={styles.planButtonPrice}>
                  CHF {PLAN_CONFIG[targetPlan].price}/mo · {PLAN_CONFIG[targetPlan].seats === Infinity ? 'Unlimited' : PLAN_CONFIG[targetPlan].seats} seats
                </Text>
              </View>
              {checkoutBusy === targetPlan ? (
                <ActivityIndicator color="#3b82f6" />
              ) : (
                <Text style={styles.planButtonAction}>Upgrade →</Text>
              )}
            </TouchableOpacity>
          ))}

          {plan !== 'free' && (
            <>
              <Text style={[styles.subTitle, { marginTop: 16 }]}>Downgrade to</Text>
              {DOWNGRADE_OPTIONS.filter((p) => {
                const planOrder: Plan[] = ['free', 'pro', 'premium', 'vip'];
                return planOrder.indexOf(p) < planOrder.indexOf(plan);
              }).map((targetPlan) => (
                <TouchableOpacity
                  key={targetPlan}
                  style={[styles.planButton, styles.planButtonDowngrade, downgradeBusy !== null && styles.rowDisabled]}
                  onPress={() => void handleDowngrade(targetPlan)}
                  disabled={downgradeBusy !== null}
                >
                  <View>
                    <Text style={styles.planButtonName}>{PLAN_CONFIG[targetPlan].label}</Text>
                    <Text style={styles.planButtonPrice}>
                      {PLAN_CONFIG[targetPlan].price === 0 ? 'Free' : `CHF ${PLAN_CONFIG[targetPlan].price}/mo`}
                      {' · '}
                      {PLAN_CONFIG[targetPlan].seats === Infinity ? 'Unlimited' : PLAN_CONFIG[targetPlan].seats} seats
                    </Text>
                  </View>
                  {downgradeBusy === targetPlan ? (
                    <ActivityIndicator color="#9ca3af" />
                  ) : (
                    <Text style={[styles.planButtonAction, styles.downgradeText]}>Downgrade</Text>
                  )}
                </TouchableOpacity>
              ))}
            </>
          )}
        </View>
      )}

      {/* Sign out */}
      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  content: { padding: 16, gap: 4, paddingBottom: 40 },
  section: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    gap: 6,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  name: { fontSize: 18, fontWeight: '700', color: '#111827' },
  email: { fontSize: 14, color: '#6b7280' },
  roleRow: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 4 },
  roleLabel: { fontSize: 14, color: '#6b7280' },
  roleValue: { fontSize: 14, fontWeight: '600', color: '#374151' },
  clinicName: { fontSize: 18, fontWeight: '700', color: '#111827' },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  planStatus: { fontSize: 13, color: '#6b7280' },
  hint: { fontSize: 13, color: '#6b7280', lineHeight: 18 },
  discountInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    marginTop: 6,
  },
  subTitle: { fontSize: 14, fontWeight: '600', color: '#374151', marginTop: 8 },
  planButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: 8,
    backgroundColor: '#f0f9ff',
    marginTop: 6,
  },
  planButtonDowngrade: {
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  planButtonName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  planButtonPrice: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  planButtonAction: { fontSize: 14, fontWeight: '700', color: '#3b82f6' },
  downgradeText: { color: '#9ca3af' },
  signOutButton: {
    backgroundColor: '#fee2e2',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  signOutText: { color: '#ef4444', fontSize: 16, fontWeight: '700' },
  rowDisabled: { opacity: 0.55 },
});
