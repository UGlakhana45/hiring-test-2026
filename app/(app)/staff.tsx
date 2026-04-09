import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Share,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { useClinic } from '@/hooks/useClinic';
import { useSubscription } from '@/hooks/useSubscription';
import { subscribeToClinicMembers } from '@/services/firestore';
import {
  getHttpsCallableErrorMessage,
  removeStaffMember,
  validateSeatInvite,
} from '@/services/stripe';
import { SeatUsageBar } from '@/components/SeatUsageBar';
import type { User } from '@/types/user';

export default function StaffScreen() {
  const { isOwner, profile } = useAuth();
  const { clinic } = useClinic();
  const clinicId = clinic?.id ?? profile?.clinicId ?? null;
  const { seatsUsed, seatsMax, canAddStaff, isGracePeriod } = useSubscription();
  const [members, setMembers] = useState<User[]>([]);
  const [inviteBusy, setInviteBusy] = useState(false);

  useEffect(() => {
    if (!clinicId) return;
    const unsub = subscribeToClinicMembers(clinicId, (all) => {
      setMembers(all.filter((u) => u.role === 'staff' || u.role === 'owner'));
    });
    return unsub;
  }, [clinicId]);

  async function handleInviteStaff() {
    if (!clinicId) return;
    if (!canAddStaff) {
      if (isGracePeriod) {
        Alert.alert('Billing issue', 'Your plan has a payment issue. Resolve billing before adding staff.');
      } else {
        Alert.alert('Seat limit reached', 'Upgrade your plan or purchase the Extra Seats add-on to add more staff.');
      }
      return;
    }
    setInviteBusy(true);
    try {
      const check = await validateSeatInvite(clinicId);
      if (!check.allowed) {
        Alert.alert('Cannot invite', check.reason ?? 'Seat limit or subscription state blocks new staff.');
        return;
      }
      const clinicLabel = clinic?.name ?? 'your clinic';
      const inviteBody = [
        `You're invited to join ${clinicLabel} on ClinicApp.`,
        '',
        `Clinic ID: ${clinicId}`,
        '',
        'Ask your admin how to get a staff account (e.g. they create your user in the console or you sign up and they assign the clinic).',
      ].join('\n');

      Alert.alert(
        'You can invite staff',
        `Server check passed (${check.activeSeats ?? '?'}/${check.seatLimit ?? '?'} seats). Share these details with your teammate.`,
        [
          {
            text: 'Share…',
            onPress: () => {
              void Share.share({
                title: `Join ${clinicLabel}`,
                message: inviteBody,
              });
            },
          },
          { text: 'OK', style: 'default' },
        ],
      );
    } catch (e: unknown) {
      Alert.alert('Invite check failed', getHttpsCallableErrorMessage(e));
    } finally {
      setInviteBusy(false);
    }
  }

  function handleRemoveStaff(user: User) {
    Alert.alert(
      'Remove staff member',
      `Remove ${user.displayName} from the clinic? Their active session will also be invalidated.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            if (!clinicId) return;
            removeStaffMember({ clinicId, targetUserId: user.id })
              .then(() => {
                Alert.alert(
                  'Removed',
                  `${user.displayName} was removed and their sessions were invalidated server-side.`,
                );
              })
              .catch((e: unknown) => {
                Alert.alert('Remove failed', getHttpsCallableErrorMessage(e));
              });
          },
        },
      ],
    );
  }

  function renderMember({ item }: { item: User }) {
    const isCurrentUserOwner = item.role === 'owner';
    return (
      <View style={styles.memberRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{item.displayName.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>{item.displayName}</Text>
          <Text style={styles.memberEmail}>{item.email}</Text>
        </View>
        <View style={styles.memberRight}>
          <View style={[styles.roleBadge, isCurrentUserOwner && styles.roleBadgeOwner]}>
            <Text style={[styles.roleText, isCurrentUserOwner && styles.roleTextOwner]}>
              {item.role}
            </Text>
          </View>
          {isOwner && !isCurrentUserOwner && (
            <TouchableOpacity onPress={() => handleRemoveStaff(item)}>
              <Text style={styles.removeButton}>Remove</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <SeatUsageBar used={seatsUsed} max={seatsMax} />
        {isOwner && (
          <TouchableOpacity
            style={[styles.inviteButton, (!canAddStaff || inviteBusy) && styles.inviteButtonDisabled]}
            onPress={() => void handleInviteStaff()}
            disabled={!canAddStaff || inviteBusy}
          >
            {inviteBusy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.inviteText}>+ Invite staff</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={members}
        keyExtractor={(item) => item.id}
        renderItem={renderMember}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>No staff members yet.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    backgroundColor: '#fff',
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  inviteButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  inviteButtonDisabled: { backgroundColor: '#9ca3af' },
  inviteText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  list: { padding: 16, gap: 8 },
  memberRow: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#dbeafe',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '700', color: '#1e40af' },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  memberEmail: { fontSize: 13, color: '#6b7280' },
  memberRight: { alignItems: 'flex-end', gap: 6 },
  roleBadge: {
    backgroundColor: '#f3f4f6',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  roleBadgeOwner: { backgroundColor: '#fef3c7' },
  roleText: { fontSize: 11, fontWeight: '700', color: '#374151' },
  roleTextOwner: { color: '#92400e' },
  removeButton: { fontSize: 13, color: '#ef4444', fontWeight: '600' },
  empty: { fontSize: 14, color: '#9ca3af', textAlign: 'center', marginTop: 32 },
});
